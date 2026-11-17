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

The pixel/vector/ink/gouache/desktop/cel journey retains the source's original
136 BPM score, medium-specific build, earned landing response and bounded world
waves. The painted scene has **one hero**, not flashing bonus dinosaur clones.
Its original textured assets and atlas anchors are unchanged. Cleared cacti stay
full-height and continue behind the hero to the near/offscreen boundary (`z > -8`);
a bounded render-only tail survives stage transitions without old collisions or
second scoring. Small geometry fixes join cactus arms, ground the trunk and pixel
feet, keep squash details attached, and separate the vector jaw from the head.
Actual contacts instead consume that exact cactus immediately, reset the combo,
and play one short procedural descending minor wah, including protected contacts.
They cannot later clear or collide again. This also applies to Chrome's free first
attempt and the fatal EXTREME giant; clean jumps still retain their full-height tail.

The main world is deliberately much harder than the authentic training prelude.
First-lap speed is **11.2 world units/s** (40% above the former 8). Each lap adds
18 percentage points, capped at **1.80×** the new base: 11.2, 13.216, 15.232,
17.248, 19.264, then 20.16 units/s. The quiet LAP multiplier uses that new base.
Approach time is `max(0.95, 1.35 / speedMultiplier)` seconds, not extra distance
that cancels the speed increase. Track's first spawn is at 0.65 s, with its first
contact about 2 s after entry (formerly about 4.9 s), after the camera settles.

Four deterministic long/short gap rhythms rotate by scene, lap and obstacle
index: `[1.05, 1.5, 1.2, 1.65]`, `[1.4, 1.1, 1.6, 1.25]`,
`[1.65, 1.2, 1.45, 1.05]`, and `[1.15, 1.55, 1.05, 1.4]` seconds.
Gaps scale by `1 / sqrt(speedMultiplier)` with a **1 s floor**: the unchanged
~0.86 s jump still has at least ~0.14 s landing recovery. No random stacks or
new collision geometry. Three hearts, one-heart lap healing (maximum three),
and one contact per cactus remain; damage protection is now **0.35 s**, so
separate missed hazards cost separate hearts. Live hazards remain capped at five
and the render-only transition tail at eight.

Track/corkscrew/dream/desktop targets are **six clears each** (formerly four).
Their minimum/deadline pairs remain **10/14, 9.5/11, 11/12, 9.5/11 s**; more
hazards fit the original chapter lengths instead of ending chapters early.
Stampede targets **nine clears**, spawns only through 13.5 s, and retains its
fixed 16 s musical build. Score remains landing-based, once per clear, plus
EXTREME's single 150-point bonus; there are no points for spawning or tapping.
A clean reference first lap now presents **43 main-world hazards**, resolves
**39 clean contacts**, and scores **6,065** including three opening clears and
EXTREME (rather than the old 3,515-point profile). The four unresolved hazards
are discarded at chapter boundaries, never scored. Scores depend on actual
clears and combo: an ordinary clear is worth at most 150 points, and EXTREME
always adds exactly 150, never a per-press award.

After coalescence, **EXTREME** replaces the old gentle finale:

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

Farts occur **only during EXTREME**; ordinary world jumps beep. Chrome phases retain
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

Production `DINO_DEBUG.state` is a read-only frozen snapshot. Version 5 includes
`speed`, `speedMultiplier`, `approachTTC`, `distance`, `clearedTail`, pause state,
EXTREME state (forward cue times and first crossing), impact audio counts,
close-camera/top/hero bounds, and opening/handoff geometry. `?debug` additionally exposes
`advance(seconds)` and `freeze(true)` for stepped captures; `?debug&seed=N` makes
the runner's randomness reproducible. Seed/stepping/freezing mark the run and all
later restarts in the same page assisted: no best writes, banking or end card.
There is no stage-skip or asset-readiness bypass.

Browser verification is performed externally, without adding dependencies or
shipping test controls. Headless timings are not physical-phone performance
claims. Check both themes, touch DPR2 and desktop, first-attempt crash/retry,
three successful lap returns, later Chrome damage, cactus pass-through, painted
big clears, the 40-dino pack, and pause/mute/missing-asset fallbacks when syncing.

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
