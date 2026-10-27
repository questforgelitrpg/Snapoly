# Snapoly 0.5.1 balance pass

Nathan reached Cube Master without using tools or lives. The previous curve shortened deadlines but left arrivals 2.8 seconds apart after level 4, and the final opening deadline was still 13.91 seconds. This play-test pass increases both movement and arrival pressure, places the former Master pace between Novice and Expert, and moves all six campaign colors to Expert.

| Milestone | 0.5.0 Cube travel / arrivals | 0.5.1 Cube travel / arrivals |
| --- | --- | --- |
| Level 5 | 18.52s / 2.80s | 17.39s / 1.74s |
| Novice, level 10 | 16.84s / 2.80s | 15.81s / 1.58s |
| Level 12 | 15.30s / 2.80s | 13.75s / 1.37s |
| Expert, level 15 | 15.30s / 2.80s, four colors | 13.75s / 1.37s, six colors |
| Master, level 20 | 13.91s / 2.80s, 46 cells | 7.04s / 0.70s, 60 cells |

The opening four stages remain tool-free. Each added side still grants more travel time, while arrivals tighten sooner. Later speed steps scale both clocks together. Expert introduces the full prism palette; post-Expert speed rises at levels 16, 18 and 20 add 25% each. Spare earning stays at one life per three clears after level 10, rather than becoming one per two at Expert. Previously earned spares, coins, tools and badges are preserved.

MagnetFlow starts with all six colors, 14-second deadlines and 1.6-second arrivals (previously three colors, 22s / 3s). Endless starts at 16s / 1.8s. Continuous random speed steps remain 3–10% every 25 placements, never over 10% of the preceding speed. MagnetFlow retains one life, a checkpoint every 100 placements, and resumable high-score runs. Both old and six-color saves are supported without refilling stock or changing existing incoming timers.

## Economy retained

- Introductory tool grants: two charges per tool, once per profile; old one-charge introductions receive only the owed extra charge. Retries do not restore spent inventory.
- Flow stock: two of each owned tool per independent run, held separately from campaign resources.
- Clear coins: two per removed cell; overflowing tool rewards convert to three coins.
- First-win bonus: 10 + 2 per later level (10 at level 1 through 48 at level 20). Replays earn clear coins but no completion bonus.
- Slow Time: 45 coins; Bomb: 55. Shield research after Novice: 140, refill 65. Recolor research after Expert: 220, refill 80. Permanent research includes two charges. Each tool stores up to three; equip at most two.

A simple triple pays six coins before overflow. Ignoring first-win bonuses and drops, replacing Slow takes eight triples; Bomb takes ten. Full Clears pay for every removed cell. Existing accumulated wealth is not removed.

## Acceptance limits

Automated timing checks compare the real arrival/deadline pressure and show Slow Time buying a recovery window. They do not prove human difficulty or make tool use compulsory. Next S24 play-test targets: levels 7, 12, 15, 16, 18 and 20; missed cells, actual tool use, spare consumption, six-color readability, and whether the final pace remains controllable. Measure difficulty from play rather than treating these chosen values as final balance.
