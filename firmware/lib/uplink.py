"""Wi-Fi につないで、サーバーにイベントを POST する。"""

import json
import time

import network
import requests

# 接続に失敗したら、これだけ待ってからやり直す
_RETRY_MS = 10000
# 省電力を切ると、送信の遅れが小さくなる（PM_NONE がない古いファームウェア向けの値）
_PM_NONE = getattr(network.WLAN, "PM_NONE", 0xA11140)


class Uplink:
    def __init__(self, ssid, password, url, token="", hostname=None, country="JP", timeout_s=3):
        self._ssid = ssid
        self._password = password
        self._url = url
        self._timeout_s = timeout_s
        self._headers = {"Content-Type": "application/json"}
        if token:
            self._headers["Authorization"] = "Bearer " + token

        if country and hasattr(network, "country"):
            network.country(country)
        if hostname and hasattr(network, "hostname"):
            network.hostname(hostname)

        self._wlan = network.WLAN(network.STA_IF)
        self._wlan.active(True)
        self._wlan.config(pm=_PM_NONE)
        self._last_attempt_ms = None

    def keep_connected(self):
        """つながっていれば True。切れていれば接続を始めて False を返す（待たない）。"""
        if self._wlan.isconnected():
            return True

        now = time.ticks_ms()
        if self._last_attempt_ms is None or time.ticks_diff(now, self._last_attempt_ms) >= _RETRY_MS:
            self._last_attempt_ms = now
            print("wifi: connecting to", self._ssid)
            self._wlan.connect(self._ssid, self._password)
        return False

    def rssi(self):
        try:
            return self._wlan.status("rssi")
        except (OSError, ValueError):
            return None

    def post(self, payload):
        """payload を送り、サーバーの返事を dict で返す。失敗したら OSError を投げる。"""
        response = requests.post(self._url, data=json.dumps(payload), headers=self._headers, timeout=self._timeout_s)
        try:
            if response.status_code != 200:
                raise OSError("HTTP %d: %s" % (response.status_code, response.text))
            return response.json()
        finally:
            response.close()
