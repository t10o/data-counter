import unittest

from outbox import Outbox


class OutboxTest(unittest.TestCase):
    def test_numbers_events_from_one(self):
        outbox = Outbox(4)

        self.assertEqual(outbox.append(1, 0, 100), 1)
        self.assertEqual(outbox.append(1, 1, 140), 2)
        self.assertEqual(outbox.peek(10), [[1, 1, 0, 100], [2, 1, 1, 140]])

    def test_ack_drops_events_up_to_the_seq(self):
        outbox = Outbox(4)
        for t in range(3):
            outbox.append(2, t % 2, t)

        outbox.ack(2)

        self.assertEqual(outbox.peek(10), [[3, 2, 0, 2]])
        self.assertEqual(outbox.first_seq, 3)

    def test_ignores_stale_or_future_acks(self):
        outbox = Outbox(4)
        outbox.append(1, 0, 0)
        outbox.ack(1)

        outbox.ack(1)
        self.assertEqual(len(outbox), 0)

        outbox.append(1, 1, 10)
        outbox.ack(99)
        self.assertEqual(len(outbox), 0)
        self.assertEqual(outbox.append(1, 0, 20), 3)

    def test_overwrites_the_oldest_when_full(self):
        outbox = Outbox(3)
        for t in range(5):
            outbox.append(1, 0, t)

        self.assertEqual(outbox.dropped, 2)
        self.assertEqual([event[0] for event in outbox.peek(10)], [3, 4, 5])

    def test_peek_limits_the_batch(self):
        outbox = Outbox(8)
        for t in range(5):
            outbox.append(1, 0, t)

        self.assertEqual([event[0] for event in outbox.peek(2)], [1, 2])
        self.assertEqual(len(outbox), 5)

    def test_keeps_large_timestamps(self):
        outbox = Outbox(2)
        week_us = 7 * 24 * 3600 * 1000000
        outbox.append(1, 0, week_us)

        self.assertEqual(outbox.peek(1)[0][3], week_us)


if __name__ == "__main__":
    unittest.main()
