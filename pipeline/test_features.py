import unittest
from features import embed


class FeatureTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(embed([], [], [], [])[0], 1)

    def test_unit_vector(self):
        v = embed([800, 3900], [100, 250], [dict(x=.2, y=.8, seconds=35, weapon='Vandal')], ['Jett', 'Omen'])
        self.assertEqual(len(v), 128)
        self.assertAlmostEqual(sum(x*x for x in v), 1)


if __name__ == '__main__':
    unittest.main()
