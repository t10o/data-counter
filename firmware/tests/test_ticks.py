import unittest

from ticks import TICKS_PERIOD, MonotonicClock


class MonotonicClockTest(unittest.TestCase):
    def test_counts_from_the_first_ticks(self):
        clock = MonotonicClock(1000)

        self.assertEqual(clock.to_us(1000), 0)
        self.assertEqual(clock.to_us(1500), 500)

    def test_keeps_counting_across_the_wrap(self):
        clock = MonotonicClock(TICKS_PERIOD - 100)

        self.assertEqual(clock.to_us(50), 150)

    def test_counts_beyond_many_wraps(self):
        clock = MonotonicClock(0)
        step = TICKS_PERIOD // 4
        t = 0
        for _ in range(12):
            t += step
            clock.to_us(t % TICKS_PERIOD)

        self.assertEqual(clock.to_us(t % TICKS_PERIOD), 3 * TICKS_PERIOD)

    def test_accepts_ticks_slightly_in_the_past(self):
        clock = MonotonicClock(0)
        clock.to_us(10000)

        self.assertEqual(clock.to_us(9000), 9000)
        self.assertEqual(clock.to_us(11000), 11000)


if __name__ == "__main__":
    unittest.main()
