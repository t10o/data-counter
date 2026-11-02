"""CN2 の変化を GPIO の割り込みで拾い、リングバッファに積む。

割り込みハンドラーは hard=True で動かすので、中ではメモリを確保できない。
時刻・ピン・レベルを、あらかじめ用意した配列に書き込むだけにしている。
"""

import array
import time

from machine import Pin

_BOTH_EDGES = Pin.IRQ_FALLING | Pin.IRQ_RISING


class EdgeCapture:
    def __init__(self, pins, size=256):
        """pins は {CN2 のピン番号: GPIO 番号}。size は 2 のべき乗にする。"""
        if size & (size - 1):
            raise ValueError("size must be a power of two")

        self._mask = size - 1
        self._pin = bytearray(size)
        self._level = bytearray(size)
        self._ticks = array.array("I", bytes(4 * size))
        # head は割り込みだけが、tail はメインループだけが進める
        self._head = 0
        self._tail = 0
        self.overflows = 0

        self._inputs = {}
        for cn2, gpio in pins.items():
            # 外付けの抵抗なしで読めるよう、内蔵プルアップを使う（外付けがあっても害はない）
            pin = Pin(gpio, Pin.IN, Pin.PULL_UP)
            pin.irq(self._handler(cn2), _BOTH_EDGES, hard=True)
            self._inputs[cn2] = pin

    def _handler(self, cn2):
        # 割り込みの中で属性を引かずに済むよう、ここで取り出しておく
        push = self._push
        ticks_us = time.ticks_us

        def on_edge(pin):
            push(cn2, pin.value(), ticks_us())

        return on_edge

    def _push(self, cn2, level, ticks):
        head = self._head
        following = (head + 1) & self._mask
        if following == self._tail:
            self.overflows += 1
            return
        self._pin[head] = cn2
        self._level[head] = level
        self._ticks[head] = ticks
        self._head = following

    def drain(self):
        """たまった変化を古い順に (CN2 のピン番号, レベル, ticks_us) で返す。"""
        while self._tail != self._head:
            i = self._tail
            yield self._pin[i], self._level[i], self._ticks[i]
            self._tail = (i + 1) & self._mask

    def levels(self):
        """いまの各ピンのレベル。0 なら接点が閉じている（ON）。"""
        return [[cn2, pin.value()] for cn2, pin in self._inputs.items()]
