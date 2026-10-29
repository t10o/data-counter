"""データカウンターの Pico 側。

CN2 の端子の変化（立ち下がり・立ち上がり）を時刻付きで拾い、サーバーに送る。
数を数えたり判定したりはせず、変化をすべて送る。解釈はサーバーと画面に任せる。
"""

import binascii
import gc
import os
import sys
import time

import machine
import micropython

import config
from capture import EdgeCapture
from outbox import Outbox
from ticks import MonotonicClock

# 割り込みの中で例外が起きたときに、内容を出せるようにしておく
micropython.alloc_emergency_exception_buf(128)

# イベントがたまっているときの送信間隔
SEND_INTERVAL_MS = 100
# 何もなくても送る間隔。サーバーはこれで Pico が生きていることと、時刻の進みを知る
HEARTBEAT_MS = 5000
# 送信に失敗したら、これだけ待ってから送り直す
BACKOFF_MS = 2000
# 1 回に送るイベントの上限
BATCH_SIZE = 100
LOOP_SLEEP_MS = 5


def main():
    boot_id = binascii.hexlify(os.urandom(4)).decode()
    names = getattr(config, "PIN_NAMES", {})
    serial_log = getattr(config, "SERIAL_LOG", True)

    clock = MonotonicClock(time.ticks_us())
    capture = EdgeCapture(config.PINS)
    outbox = Outbox(getattr(config, "OUTBOX_SIZE", 2000))
    uplink = _make_uplink()
    led = machine.Pin("LED", machine.Pin.OUT)
    watchdog = machine.WDT(timeout=8000) if getattr(config, "WATCHDOG", False) else None
    previous_edge_us = {}

    def collect():
        for cn2, level, ticks in capture.drain():
            t_us = clock.to_us(ticks)
            seq = outbox.append(cn2, level, t_us)
            if serial_log:
                _log_edge(names, previous_edge_us, seq, cn2, level, t_us)

    print("data-counter: boot", boot_id, "pins", config.PINS, "levels", capture.levels())
    if uplink is None:
        print("data-counter: WIFI_SSID is empty, logging to USB serial only")

    next_send_ms = time.ticks_ms()
    while True:
        collect()

        if uplink is not None:
            connected = uplink.keep_connected()
            led.value(connected)
            if connected and time.ticks_diff(time.ticks_ms(), next_send_ms) >= 0:
                ok = _send(uplink, clock, capture, outbox, boot_id, collect)
                interval = SEND_INTERVAL_MS if len(outbox) > 0 else HEARTBEAT_MS
                next_send_ms = time.ticks_add(time.ticks_ms(), interval if ok else BACKOFF_MS)
        elif len(outbox) > 0:
            # Wi-Fi を使わないときは、ログを出したら捨てる
            outbox.ack(outbox.first_seq + len(outbox) - 1)

        if watchdog is not None:
            watchdog.feed()
        time.sleep_ms(LOOP_SLEEP_MS)


def _make_uplink():
    if not getattr(config, "WIFI_SSID", ""):
        return None
    from uplink import Uplink

    return Uplink(
        config.WIFI_SSID,
        config.WIFI_PASSWORD,
        config.SERVER_URL,
        token=getattr(config, "INGEST_TOKEN", ""),
        hostname=getattr(config, "DEVICE_ID", None),
        country=getattr(config, "WIFI_COUNTRY", "JP"),
    )


def _send(uplink, clock, capture, outbox, boot_id, collect):
    # 先に時刻を取ってから残りのイベントを回収する。こうすると now より前のイベントは必ずこの回までに入る
    now_us = clock.to_us(time.ticks_us())
    collect()
    events = outbox.peek(BATCH_SIZE)

    payload = {
        "device": getattr(config, "DEVICE_ID", "pico"),
        "boot": boot_id,
        "now": now_us,
        "events": events,
        "remaining": len(outbox) - len(events),
        "status": {
            "rssi": uplink.rssi(),
            "memFree": gc.mem_free(),
            "dropped": outbox.dropped + capture.overflows,
            "levels": capture.levels(),
        },
    }
    try:
        reply = uplink.post(payload)
        outbox.ack(reply["ack"])
        return True
    except (OSError, ValueError, KeyError) as error:
        print("send failed:", repr(error))
        return False
    finally:
        gc.collect()


def _log_edge(names, previous_edge_us, seq, cn2, level, t_us):
    """配線の確認用に 1 行出す。例: [   12.345678] #42 IN   rise  low 44.3 ms"""
    previous = previous_edge_us.get(cn2)
    previous_edge_us[cn2] = t_us
    held = ""
    if previous is not None:
        width_us = t_us - previous
        held = "  %s %d.%d ms" % ("low" if level else "high", width_us // 1000, width_us % 1000 // 100)
    print(
        "[%6d.%06d] #%d %-4s %s%s"
        % (t_us // 1000000, t_us % 1000000, seq, names.get(cn2, str(cn2)), "fall" if level == 0 else "rise", held)
    )


try:
    main()
except KeyboardInterrupt:
    # mpremote などで止めたときは、そのまま REPL に戻す
    raise
except Exception as error:
    # 何が起きても、台の中で止まったままにしない
    sys.print_exception(error)
    time.sleep(5)
    machine.reset()
