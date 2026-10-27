# Snapoly design guide — 0.5.1

This consolidates Nathan's original geometric-game conversation and subsequent play-test notes. No separate prior design bible was found. Implemented rules below describe the current build; future ideas are explicitly separated.

## Interaction and visual direction

Mobile first on Android and iPhone. The board dominates the screen; the bottom gameplay dock uses at most one quarter of its height. Crisp beveled geometry, jewel-toned gradients, clean edges, original assets, tactile snap sounds, readable color symbols and clear rewards. The colored units are cells. Reward language is Color Clear and Full Clear, never Burst.

Incoming cells approach from the four screen edges, with a forward tilt that keeps their approach visible. Free 3D rotation uses a swipe; two fingers can roll. Incoming cards choose the next target. In normal modes, tap any compatible exposed face, then the large Snap button automatically turns and attaches. The target remains selected while inspecting. Catch and Align buttons stay removed. Geometric compatibility uses face polygon and edge size, independently of color. An outline pulses faster as the target nears alignment, then holds solid when valid. Junctions can touch several existing cells and earn join points.

## Matching and failure

Only face-connected cells of the incoming color form its trigger group. Corners, edges, other colors and the neutral core cannot bridge it. Three clear only that group; separate cells of the same color stay. Other survivors slide into connected positions. Slides do not trigger cascades. Four or more in the trigger group clear all attached cells except the core, with 1,000 bonus points plus 250 per matching cell beyond four, multiplied by combo. Incoming cells survive the effect. Level completion never acts as a clear.

Missed deadlines or invalid geometric attachments cost a life and reset combo. An invalid manual Snap with no target does not attach. Shield can absorb one miss. Campaign and Endless start with three active lives; Growth has no life limit. MagnetFlow starts with one and never earns spares.

## Progression and shapes

Five implemented shapes: Cube; Pyramid; Diamond (octahedron); Hexagonal Prism (two hexagons, six squares); Dodecahedron (twelve pentagons). Polygon outlines, attachment reflection, occupancy and face-connected matching use the real geometry. New shapes append to the level/record arrays rather than shifting existing progress. There are 100 campaign levels.

Each shape has twenty levels. The four tool-free starters progressively add sides with more travel time and tighter arrival spacing. Speed steps affect both deadlines and arrivals: +15%, +10%, +15%, +25%, +25%, +25% at levels 5, 7, 12, 16, 18 and 20. The old Cube Master pace is now near level 12, between Novice and Expert. Violet joins at 11, Sapphire at 13 and Lime at 15, so Expert uses all six colors. Master finishes with 60 cells and approximately 7-second opening travel / 0.7-second arrivals. Later levels each change one category; every stage has an illustrated briefing with Play. Badges at 5/10/15/20 distinct wins are Beginner/Novice/Expert/Master. Previously earned badges and records remain valid. Replays improve stars rather than badge counts. The next campaign shape opens after level 4 of the previous shape. Campaign spares require three clears from level 10 onward, up to five; the former level-15 two-clear bonus is replaced by the full palette.

Endless starts with Cube. Each other shape needs its own Beginner badge to enter either flow mode. Any one Novice badge opens MagnetFlow; ten wins split across shapes do not qualify.

## Continuous modes

All continuous modes compound a random 3–10% speed increase every 25 successful attachments. A cell that clears immediately counts once, and later removal does not count again. Misses and Bombs do not advance it. Each increase is at most 10% of the preceding speed; there is no total speed cap. The HUD reports the percentage and new multiplier.

Growth Lab retains 100 cubes, no clears or life limit, with camera zoom as the sculpture grows. Endless starts at 16-second travel / 1.8-second arrivals, with infinite incoming, normal clears, tools and a run-only spare pool. Every three match clears earns a spare, up to five. These resources cannot enter the campaign wallet.

MagnetFlow is a high-score survival game with all six colors from the start and 14-second travel / 1.6-second arrivals: rotate an unobstructed compatible face within about 20° of the incoming lane. A short stable aim lets the magnet finish alignment and attachment. There is no Snap or face-tap targeting. One life; no new spare lives. Increasing speed and four incoming lanes supply the survival pressure. Shield remains a one-miss tool, not an extra life.

Every 100 placed cells pauses arrivals after any clear/slide finishes. Keep going advances the next checkpoint by 100. Save & exit preserves the run; End run banks its best score and clears the resumable game. A single local saved run retains its exact sculpture, incoming clocks, speed, score, combo, tools and orientation. Both legacy three-color and new six-color snapshots are accepted. Resumed old runs retain their current incoming timers and colors; newly spawned cells use the new full palette and starting pace. Resume opens paused and never refills inventory or life. Saves also occur periodically and on pause/background. Starting a new Magnet run replaces the saved one. No cloud transfer is implemented.

## Tools, rewards and layout

There are four tools, all visible in the between-level shop. Slow Time and Bomb retain their campaign introductions. Shield research requires any Novice badge and 140 coins; refill 65. Recolor requires any Expert badge and 220 coins; refill 80. These chosen prototype costs are tunable, rather than measured final balance. Research is permanent, includes two charges once, and never charges twice for an owned tool. Refills add one charge up to a cap of three.

Shield protects one missed cell, keeping life and combo. Recolor changes only the selected incoming cell's color, retaining its timer, lane and embedded reward. Cleared marked cells supply tool charges. Stowed tools can be collected, but cannot be used until equipped. Full inventory converts an extra reward into three coins.

Before Play, the illustrated briefing presents up to four tool choices with a two-slot limit. Tap a selected tool to free a slot, then choose its replacement. During play only these two buttons appear, beside the large Snap button or MagnetFlow meter. No expanding gameplay toolbar is added. The shop and setup are separate from the active board. Campaign levels 1–4 suppress tools even if owned; researched extras can be used from level 7. Independent Flow runs receive two of each owned tool, including stowed ones.

## Future options — not implemented

Triangular Prism and Cuboctahedron are candidates for readable triangle/square faces. Rhombic Dodecahedron offers broad diamond faces but needs explicit rhombus angle compatibility before mixed-shape rounds. An Icosahedron has many smaller triangular faces and is a lower mobile-readability priority. Mixed-shape special stages still need compatibility and progression design.

Additional tool ideas for later review: preview/queue choice, one-cell relocation, and temporary spawn spacing. None is in the shop yet; no unsupported purchasable item is shown. Keep the same two-slot setup if the catalog grows. Do not reintroduce the removed Catch/Align buttons without another design decision.

Next balance review should measure tool use after level 6, wallet growth, Magnet survival length, checkpoint timing and late-run device performance. Physical iPhone acceptance, App Store distribution, production Android signing and cloud saves remain future work.
