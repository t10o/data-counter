"""サーバーに届いたと確かめられるまで、イベントを持っておく箱。

イベントには 1 から順に seq を振る。サーバーは保存できた最大の seq を返すので、
それ以下を捨てる。Wi-Fi が切れている間はたまり続け、いっぱいになると古いものから捨てる。
"""

import array


class Outbox:
    def __init__(self, capacity):
        self._capacity = capacity
        self._pin = bytearray(capacity)
        self._level = bytearray(capacity)
        self._t_us = array.array("q", bytes(8 * capacity))
        self._start = 0
        self._count = 0
        self._next_seq = 1
        self.dropped = 0

    def __len__(self):
        return self._count

    @property
    def first_seq(self):
        """いちばん古いイベントの seq。空なら次に振る seq。"""
        return self._next_seq - self._count

    def append(self, pin, level, t_us):
        """イベントを入れて、振った seq を返す。"""
        if self._count == self._capacity:
            self._start = (self._start + 1) % self._capacity
            self._count -= 1
            self.dropped += 1

        i = (self._start + self._count) % self._capacity
        self._pin[i] = pin
        self._level[i] = level
        self._t_us[i] = t_us
        self._count += 1

        seq = self._next_seq
        self._next_seq += 1
        return seq

    def peek(self, limit):
        """古い順に最大 limit 件を [seq, ピン, レベル, 時刻] で返す。箱からは消さない。"""
        first = self.first_seq
        events = []
        for k in range(min(limit, self._count)):
            i = (self._start + k) % self._capacity
            events.append([first + k, self._pin[i], self._level[i], self._t_us[i]])
        return events

    def ack(self, seq):
        """seq 以下のイベントを捨てる。"""
        n = min(seq - self.first_seq + 1, self._count)
        if n <= 0:
            return
        self._start = (self._start + n) % self._capacity
        self._count -= n
