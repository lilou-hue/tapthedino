# Tap the Dino

Standalone browser game at **https://tapthedino.com/**, hosted on GitHub Pages.
Space, up arrow, or tap to jump. Keep jumping: the world has other plans.

## Controls and session

- **Space / Up / tap:** jump. During EXTREME, make fresh presses/taps to climb;
  holding a key is not repeated input.
- **Esc** or the single small **Pause** button: pause/resume. The pause dialog
  contains Resume, Sound, Finish & keep score, and Start again. The old playing
  button cluster is absent from rendering, hit testing and tab order.
- **M:** toggle sound, including while paused. Sound preference is browser-local.
- Window blur/visibility pauses the simulation and audio. Returning to the window
  never clears an explicit user pause. Resuming does not jump or bank a score.
- Finish is an explicit action, disabled before the first reveal or in an assisted
  run. The standalone end card shows score/best, Play again and Share
  (`https://tapthedino.com/`). Play again returns to the initial idle page.

The small pause affordance appears only after play is revealed; Esc also works
before that. This keeps the original first page uncluttered without hiding the
controls in a permanently visible menu. Later Chrome runs show compact session
score, hearts and lap-speed feedback; the fold and quiet idle breath hide it.
Scores and mute use `a1NoInternetBest` and `a1NoInternetMuted` in local storage.
There are no coins, quests, shared arcade callbacks, automatic banking or network
score submissions.

## Chrome opening — every lap

Before play, the page is the Chromium offline error page and its own runner
(`opening.js`): idle blinks, first jump, the 0.4 s widening intro, obstacle-free
start, cacti, distance meter, clouds, night mode in dark theme and original
press/reached samples (contacts now use the shared sad cue). The runner is stepped
at a fixed 60 Hz from `game.js`,
using Chromium's 1x/2x sprites at its own integer pixel ratio. It cannot start
before its sprite sheet loads: until then the static idle crop remains and input
is ignored. Failed sheets are retried, then the other density is used.

**Lap one retains free in-place attempts.** Three cleared cacti (credited on
landing), or the 12.5 s collision-free deadline, start the transformation. A
collision ends only that attempt: no heart loss, no score write, no deadline
advance. Retry with Space/Up after 1.2 s, Enter, or tapping the runner. Retry
discards that attempt's clears and score; hearts are full at the reveal. The
runner's HI distance is visual and memory-only, not the game's best score.

The same hero and runway hand off to the main renderer at identical screen
geometry (`flatAnchor`). The line tears out past the runner box, ripples, and the
page dissolves as extrusion folds it into the world. The page sprite retains its
60 Hz jump physics and Chrome sounds until the morph begins. The first HUD
appears only once the camera is underway.

**Every successful lap folds back to this same page, not a second imitation.**
The returning hero and horizon project into the actual runner rectangle before
the canvas-to-DOM swap. The existing page is laid out before its anchor is read;
light/dark theme, resize and native DPR remain shared. A quiet original idle look
lasts 1.15 s, then the runner starts itself. First load still waits for input.
Score and session identity survive; the lap increments and heals one heart
(maximum three) exactly once. Later openings require two clears or the same
collision-free deadline. Later Chrome contacts cost one heart with 0.35 s recovery,
resume in place without clearing session points, and show the game's own end card
at zero hearts. Only lap one has free attempt resets.

Duck/pterodactyl gameplay is not implemented. First-lap speeds are unchanged;
later Chrome speeds accelerate but are hard-capped at 8.3, below the unsupported
bird's 8.5 threshold. Differences from Chrome: immediate resize rather than a
resize pause; fixed 60 Hz stepping rather than a variable frame time; HI distance
is not persisted. Browser versions, fonts and locale can differ; the reference
is the English offline page in Chrome 157 on Linux.

## The world and EXTREME

Every lap is one continuous run through the **original multi-medium journey**, with
the Jelly and Moon stages added:

**Chrome page → rupture → extrusion → vector night track → ink corkscrew → jelly →
painted dream → dinosaur desktop → crash → stampede → coalescence → little moon →
neon EXTREME → fold back to Chrome (breath)**.

Internal scene names are
`offline → rupture → extrusion → track → corkscrew → jelly → dream → desktop → crash → stampede → coalesce → moon → extreme → collapse → breath`.
Chapters are numbered in that order: 01 The other side, 02 Inside out, 03 Soft
landing, 04 Something remembers, 05 Dinosaur OS, 06 Every one of us, 07 A little space.

| Scene | Art medium (`data-medium`) | Hero |
| --- | --- | --- |
| offline, rupture, breath, early extrusion, late fold | `chrome` (the real page runner and sprites) | Chromium T-rex sprite |
| extrusion, track | `vector-3d` | original voxel dinosaur, faceted sun, fins, earned monuments |
| corkscrew | `ink-comic` | original cream/black/red drawn hero, inked rib tunnel |
| jelly | `gummy` | sculpted pink hero, glossy road, gumdrop plants, cherry canopies |
| dream | `ai-gouache` (or `gouache-fallback`) | the one painted hero, original painted valley props and earned path bend |
| desktop, crash | `pixel-16` | 16-bit window with a pixel dinosaur inside; window stacks, falling desktop, blue screen |
| stampede, coalesce | `cel-cartoon` | drawn cel hero, echo pack (32/40), candy city with earned cascades, giant coalescence |
| moon | `lunar` | sculpted white/lilac hero, regolith corridor, crater rims, Earth disc |
| extreme | `neon-doodle` | connected magenta/cyan hero, cyan giant with its face |
| collapse | `vector-3d` (native fold) | sculpted hero on the dark ribbon, folding into the page |

The original journey's scenery, earned transformations, landing responses and
**medium-specific 136 BPM score** are restored: each night clear grows a monument,
ink landings turn the world, painted clears bend the valley path, desktop clears
open five-window stacks (pool of 24) and lift the workspace, stampede clears
double the echo pack and break the next three towers. The coalescence (2.2 s)
gathers the pack and city into one giant; the Moon then starts from a single body
(echoes, city and windows are reset). The giant is drawn only in the coalescence,
never in the Moon or fold. The sculpted current hero is used only for Jelly, Moon
and the fold bridge; every other medium has its original hero.

Kept fixes from the refined version: decoded/cached painted sky with an
aspect-aware crop, foot-anchored stage framing, a single hero in every
cross-medium handoff (the outgoing world fades without its hero; only the page
sprite ↔ 3D morph shows both), EXTREME's live foot handoff, the quiet top HUD band
and chapter pill, hazard probes/hero bounds in the debug snapshot. Light polish
only: painted props and stampede pack members fade where their projected
silhouette would cover the hero or the nearest hazard (props, counts and layout
are unchanged); the painted stage uses quiet warm take-off ticks and soft contact
shadows; desktop hazard windows have a warm alert bar and cactus icon, while
background windows are quieter documents; the ink camera is slightly higher so an
approaching cactus is not hidden behind the hero. The previous chaos tiers,
FLIP/BOING/ZERO G stickers, EXTREME confetti/OVERKILL stamp and streak-driven
syncopation were removed. Desktop/crash bars sit below the shared HUD band.

Cleared cacti stay full-height and continue behind the hero to the near/offscreen
boundary (`z > -8`); a bounded render-only tail survives stage transitions without
old collisions or second scoring. Actual contacts consume that exact cactus
immediately, reset the combo, and play one short descending minor wah, including
protected contacts. They cannot later clear or collide again. This also applies to
Chrome's free first attempt and the fatal EXTREME giant.

First-lap world speed is **11.2 units/s**; each lap adds 18 percentage points, capped
at **1.80×** (11.2, 13.216, 15.232, 17.248, 19.264, 20.16). Approach time is
`max(0.95, 1.35 / speedMultiplier)` s. Rhythm stages use four deterministic rows
`[1.05, 1.5, 1.2, 1.65]`, `[1.4, 1.1, 1.6, 1.25]`, `[1.65, 1.2, 1.45, 1.05]`,
`[1.15, 1.55, 1.05, 1.4]`, selected by an explicit rhythm ID (night 0, desktop 3,
stampede 4) and lap, gaps scaled by `1 / sqrt(speedMultiplier)` with a 1 s floor.

### Stage mechanics (one button, fresh presses)

| Stage | Jump / gravity | Contacts and exit |
| --- | --- | --- |
| Night | 7.7 / 18, 0.16 s buffer | Rhythm 0. Six-clear target, **10 s** minimum, **14 s** deadline. |
| Ink | 7.7 / 18 | Four cacti **2.15 s** apart. Each earned landing turns the floor **90° once** (0.70 s, 0.90 s reduced motion); full 0/90/180/270/360° revolution; a surviving miss completes the revolution without credit. |
| Jelly | 10 / 12, no buffer | Six cells **1.45 s** apart, each a floor cactus plus a canopy **0.65 s** behind it. One fresh airborne press slams at **−16**. Canopy underside = body height 1.896 + 0.8 clearance; passing under it never scores or resets the combo. |
| Painted | 7.7 / 18 | Six cacti, gaps **1.10, 1.80, 1.10, 1.80, 1.10 s**. |
| Desktop | 7.7 / 18 | Rhythm 3, first spawn 0.15 s, six-clear target, **9.5 s** minimum, **11 s** deadline. |
| Crash | — | 2.2 s, no hazards and no new jumps; exits grounded. |
| Stampede | 7.7 / 18 | Rhythm 4, fixed **16 s** build, spawner open through **13.5 s**, nine-clear target. |
| Coalescence | — | 2.2 s, no hazards and no new jumps; exits grounded into the Moon. |
| Moon | 6 / 5, no buffer | Three pairs, **0.75 s** within a pair, **3 s** between pairs; one float clears both and the shared landing banks **two credits once**. |

Deadlines stop the spawner; they never erase hazards. Every presented hazard must
resolve, and the player must be grounded, before a stage exits. Jelly/Moon/Ink/
Painted intervals are authored seconds, never divided by the lap multiplier.
Three hearts, **0.35 s** contact recovery and one-heart lap healing (maximum three)
remain; live hazards are capped at five (compound cells reserve two slots).

A clean deterministic first lap (synthetic 60 Hz controller, `1280×800` and
`390×844`) presents **48 scoring ground hazards** (8 night, 4 ink, 6 jelly,
6 painted, 8 desktop, 10 stampede, 6 moon) plus six no-score canopies. Including
three opening clears and EXTREME's 150-point bonus it scores **7,415**; a real-time
keyboard run (230 ms Chrome holds) also reached lap 2 with 7,415 and three hearts.
Scores depend on actual clears/combos and are not comparable with earlier routes.
Existing best/share storage keys are retained; best scores are **not reset**.

After the Moon, **EXTREME** is the finale:

- 1.5 s explicit **MASH FAST** ready counter, then a fixed **4.5 s** climb toward
  a 24-unit cactus. READY shows the 18-tap target, not a misleading input count.
- A dedicated **neon-doodle** medium: indigo paper, continuous cyan/lime cactus,
  connected magenta/cyan hero, stable hatches, stars and comic boost clouds.
  The close camera starts with the actual top offscreen, follows the ascent and
  recorded rewind height, and reserves space for the head and readable HUD.
- Forward WAV encouragement starts near the end of READY and in early ACTIVE,
  never payoff. The first height-24 crossing permanently stops forward speech
  and switches to a truthful contact-pending caption; 18 fresh presses and contact
  are still required. A later height dip cannot restart speech.
- At least **18 fresh presses and height 24** are required at contact.
  Sustained 4.5–5 Hz tapping works; the old 2.5 Hz pace fails. Holding a key
  cannot repeat inputs, and a late burst cannot teleport through the unchanged
  8-unit/s ascent envelope. Height remains capped at 30.
- A miss is fatal at contact, regardless of hearts or recovery. Success awards
  exactly 150 points once, followed by 1.4 s payoff and 2.2 s visual/audio rewind.
- EXTREME's timing, height and difficulty are identical on every lap. It does not
  inherit the world-speed increase.
- Comic boost puffs, the cactus face and rewind use bounded geometry/effect pools
  and a maximum 240-frame scalar presentation tape, not replayed gameplay.

Farts occur **only during EXTREME**; ordinary jumps use short synth cues, jelly boings/drops, and moon airy glides. Each medium keeps its original landing cadence and arrangement; crash and coalescence are silent beats. Chrome phases retain
Chromium press/reached samples, with no extra jump beep or clear chime; collisions
use the same sad impact as every other medium. Optional locally hosted speech has
caption fallback and never queues a missed cue after loading or unmuting.
On death, music and other voices stop immediately while only the already-playing
380 ms impact may finish; the context goes quiet within 430 ms. Impact has reserved,
unducked voice capacity. Mute, hide, pause, banking and restart cancel tracked
voices and pending work; no death cue creates or resumes a cold audio context.
Resuming resynchronizes the score rather than replaying entry stingers.

## Development and inspection

No build step or runtime dependencies. Serve this directory with a static server:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/. Do not open index.html as a file: artwork uses fetch.
There is no service worker or offline cache to install or invalidate.

Production `DINO_DEBUG.state` is a read-only frozen snapshot. Version 7 includes
`speed`, `speedMultiplier`, `approachTTC`, `distance`, `clearedTail`, pause state,
EXTREME state (forward cue times and first crossing), impact audio counts,
close-camera/top/hero bounds, and opening/handoff geometry. `?debug` additionally exposes
`advance(seconds)` and `freeze(true)` for stepped captures; `?debug&seed=N` makes
the runner's randomness reproducible. Seed/stepping/freezing mark the run and all
later restarts in the same page assisted: no best writes, banking or end card.
There is no stage-skip or asset-readiness bypass. Read-only stage inspection also
includes `physics` (jump, gravity, air action, body/ceiling constants),
`stagePattern` (spawn count, stopped, pending), obstacle `kind`, `worldRoll`,
`rollTarget`, `rollProgress`, `floorNormal`, projected hazard probes and hero
bounds, plus real `echoes`, `cascadeCount` and window/tower/broken-tower counts. Exposure does not grant a state setter or a scoring shortcut.

Browser verification is performed externally, without adding dependencies or
shipping test controls. Headless timings are not physical-phone performance
claims. Check both themes, touch DPR2 and desktop, first-attempt crash/retry,
two-plus keyboard/touch lap returns, all ink orientations, jelly no-slam failure,
jelly timing windows at 1×/1.8×, moon double credits, desktop window stacks,
crash/stampede cascade/coalescence→Moon reset, later Chrome damage, cactus
pass-through, painted big clears, short landscape EXTREME headroom, and pause/mute/missing-asset/no-audio
fallbacks when syncing.

## Source, provenance and maintenance

Originally extracted from `lilou-hue/SlayPlay`, commit
`016a817fde086307653806fbb1f5123617100184`, directory `arcade/no-internet/`.
The latest manually ported source is **`a72728b`**, including EXTREME from
`8e1e9be`, its normal-jump audio correction, musical intensity, world responses
and renderer performance work. This is a semantic port over the standalone
Chrome-opening implementation, not a wholesale replacement of that opening.

Changes to SlayPlay do **not** deploy here automatically. Sync by hand: compare
against the shared content base, retain the standalone end card/storage/share
paths and native opening, then validate session and geometry behavior. Never
import the shared `arcade.js`/`arcade.css`, back navigation, coins, quests, badges,
store, challenge banners, external runtime calls or a service worker.

The painted pack remains byte-identical to the source pack. The two EXTREME
speech WAVs and `assets/audio/extreme/provenance.json` are exact source copies;
see that provenance file for generation, public-domain dataset and processing
information. They are original synthetic dialogue, not copied game-announcer
recordings. Chromium layout/artwork/sound attribution and speech provenance are
in `THIRD_PARTY_NOTICES.md`.

## Deployment

GitHub Pages publishes the repository root from `main` after a push. Preserve
`CNAME` (`tapthedino.com`), `.nojekyll`, the favicon, robots/sitemap, paint and
Chrome assets, and licenses. DNS is managed in Porkbun. There is no automatic
sync/deployment code in this game. Never add API keys or `.env` files to the
public repository.
