import unittest
from collections import Counter
from hub_scenarios import scenarios


class ScenarioTests(unittest.TestCase):
    def test_exactly_2000_normalized_unique_messages_across_distinct_projects(self):
        cases=scenarios()
        self.assertEqual(len(cases),2000)
        self.assertEqual(len({' '.join(c['message'].casefold().split()) for c in cases}),2000)
        self.assertEqual(len({c['persona'] for c in cases}),20)
        self.assertEqual(len({c['project'] for c in cases}),100)
        self.assertEqual(set(Counter(c['persona'] for c in cases).values()),{100})
        self.assertEqual(sum(c['message'].startswith('/') for c in cases),600)

    def test_non_overlapping_shards_cover_the_complete_dataset(self):
        messages=[c['message'] for c in scenarios()]
        chunks=[set(messages[i*500:(i+1)*500]) for i in range(4)]
        self.assertEqual(set.union(*chunks),set(messages))
        for i,a in enumerate(chunks):
            for b in chunks[i+1:]:self.assertFalse(a&b)


if __name__=='__main__':unittest.main()
