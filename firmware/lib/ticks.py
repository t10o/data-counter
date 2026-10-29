"""time.ticks_us() を、一周しない時刻に直す。

MicroPython の ticks_us() は 2^30 マイクロ秒（約 18 分）で 0 に戻る。
前回からの差を足していくことで、起動からのマイクロ秒をずっと数え続ける。
"""

TICKS_PERIOD = 1 << 30
_HALF = TICKS_PERIOD // 2
_MASK = TICKS_PERIOD - 1


class MonotonicClock:
    """9 分（周期の半分）に 1 回以上 to_us() を呼んでいれば、正しく数えられる。"""

    def __init__(self, ticks):
        self._ref_ticks = ticks
        self._ref_us = 0

    def to_us(self, ticks):
        """ticks を、この時計を作ったときからのマイクロ秒にする。少し前の ticks を渡してもよい。"""
        delta = ((ticks - self._ref_ticks + _HALF) & _MASK) - _HALF
        us = self._ref_us + delta
        if delta > 0:
            self._ref_ticks = ticks
            self._ref_us = us
        return us
