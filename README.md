# Snapoly 0.5.0

Touch-first 3D arcade puzzle for Android, iPhone and the browser. Swipe to rotate, tap an exposed face, then Snap. Three face-connected cells of one color clear that group; four or more trigger Full Clear, keeping the core and awarding a bonus. Original procedural art, glass chimes, particle effects and smooth settling.

## Play and build

- Open **Snapoly.html** for a standalone offline game, including music.
- Run **npm ci**, **npm test**, **npm run build**, then **npm start**. Open http://127.0.0.1:4173.
- Android: see ANDROID.md. The shipped test package updates the earlier PolySnap installation in place.
- iPhone/iPad: open the hosted web game in Safari, Share → Add to Home Screen. This is a PWA; no native IPA or App Store listing is included.
- Vercel: vercel.json builds the download website into website/. Its web game is at /play/. The Android APK in site/downloads is included in the website build. Run npm run build and node tools/build-site.mjs to reproduce it.

Node.js 20 or newer. Runtime: Three.js 0.180.0. Build tool: esbuild 0.25.10. No game server, account, API key or paid service is required to play.

## This version

- Cube, Pyramid, Diamond, Hexagonal Prism and Dodecahedron: 20 levels each, preserving the first 60 level indexes and all existing progress. New chapters use real polygon faces and collision geometry.
- Every continuous mode gains a random **3–10% of its current speed every 25 successful placements**. A cleared placement counts once; misses and Bomb removals do not advance speed. The HUD announces each step.
- Shield protects one miss; Recolor changes the selected incoming cell to a chosen available color. Permanent research and refills use existing coins. The shop displays all four tools. Equip at most two before Play; other stock stays in storage.
- MagnetFlow: one life, no earned spares. Within 20°, a compatible unobstructed face magnetically aligns and attaches. No Snap button. Every 100 placements pauses for Keep going, Save & exit, or End run. The run also saves periodically and on pause/background.
- Magnet saves preserve sculpture, incoming cells and clocks, score/combo, pace, tool inventory/loadout and orientation. Resume stays paused until requested. Starting a new Magnet run replaces the saved run. Ending or losing removes the resume save and keeps the best score.
- Updated in-game rules, briefings and compact controls. The units are called **cells**. Reward wording stays **Color Clear / Full Clear**.

Campaign shape access opens after the previous shape's fourth level. Continuous shape access requires that shape's Beginner badge (five distinct wins); Cube is available immediately in Endless. The first Novice badge (ten wins in one shape) opens MagnetFlow. Badges continue at 15 and 20 wins.

Growth Lab keeps 100 cubes without clears or life loss. Endless has normal clears, three lives and run-only earned spares. Flow runs start with two charges of each owned tool and cannot spend or refill campaign stock. Campaign starters 1–4 have no tools.

## Saves, sound and compatibility

Progress is local to the browser origin or installed Android app. There is no cloud sync. Browser and native saves are separate; changing websites does not migrate an old browser save. Clearing app/browser data deletes it. Only MagnetFlow restores an in-progress run; campaign and other modes retain records and inventory, not their current sculpture.

The app display name is Snapoly. Android's legacy package ID, signing key, WebView save origin and browser storage key remain unchanged to retain existing saves. The local source folder may still be named PolySnap for the same continuity. Never uninstall an existing phone build merely to update it.

Music starts after a gesture at no more than 20%, with independent music/effects mute. Both user-supplied tracks are included offline. See THIRD_PARTY_NOTICES.txt and public/music/README.txt. The original code license does not assert a new license for those tracks.

DESIGN_GUIDE.md consolidates the established concept, current rules and expansion ideas. LEVELS.md describes progression; BALANCE.md lists the tunable economy; QA.md records verification and limits.

Website: https://snapoly.net · Source: https://github.com/questforgelitrpg/Snapoly · Contact: snapolygame@gmail.com
