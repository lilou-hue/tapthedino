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

Every lap is one continuous run: **Chrome page → sculpted night → ink gravity
corkscrew → jelly jungle → painted valley → little moon → neon EXTREME → fold
back to Chrome**. Internal scene names are
`offline → rupture → extrusion → track → corkscrew → jelly → dream → moon → extreme → collapse → breath`.
There is no mode selector, desktop/crash sequence, stampede or clone hero. Ink's
quarter-turn gravity is restored without restoring the old disconnected scenery
or hero. Music retains the 136 BPM transport with distinct ink, boing and sparse
lunar arrangements. The original refined night/painted art and Chrome fold remain.

- **Sculpted night:** a navy/violet miniature landscape with one faceted magenta
  sun near the vanishing point, a quiet dark road with hairline rails, and a few
  broad fins. The hero is one hand-authored, joined, low-sided profile (snout,
  mouth notch, eye, neck, haunch, tapered tail, three spines, arm, running legs)
  extruded from the page sprite's silhouette with three values from one key
  light; planted feet sit on the ground. Hazards are single joined teal cacti. At
  most two background cactiforms stand outside the corridor and sink away before
  their projected silhouette meets the hero's jump envelope or the next hazard.
- **Inside out:** cream paper, black contours, red cactus targets and one ivory
  sculpted hero. A rigid floor frame rotates the road, hero, hazards, shadow,
  timing marker and tail together about the hero's foot. HUD stays upright;
  the hero does **not** counter-rotate. Wall and ceiling jumps are real visible
  rotated arcs, with the same collision coordinates in the local floor frame.
- **Jelly jungle:** aqua glossy road, rounded rooted gummy plants, pink sculpted
  hero and opaque cherry cacti/canopies. The visible underside matches the
  collision head clearance; posts are outside the lane. Airborne squash never
  stretches the hero above the published body height.
- **Little moon:** white/lilac hero, pale crystal cacti, flat regolith corridor,
  sunlit crater rims and a small Earth disc. Only the distant backdrop curves:
  neither member of a pair is hidden behind a planet edge.
- **Painted valley:** the original generated gouache valley, hero and props
  (assets, anchors and atlas byte-identical) with an aspect-aware sky crop,
  corridor brushwork plus broad outer ground past the frustum, a moderate path
  bend, and asymmetric prop groups that fade before projected overlap. There is
  **one painted hero**. Without the pack, an explicit warm sculpted fallback with
  the same framing is used and is reported as `fallback`, never as painted.
- **Neon EXTREME:** connected pink hero (the same three-spined anatomy), cyan
  giant with its face, navy paper and wet puffs; the giant's top starts off-screen.
- **Feedback:** short contact arcs (0.36 s, radius ≤1.3; cream dust in the
  painting), two quiet take-off ticks with the same timing, soft layered
  24-vertex shadows, and a small landing compression. Pause, hearts and score
  share one top glass band; the chapter caption is a small pill.
- **Handoffs:** the next medium starts where the hero's feet were. Only the page
  sprite ↔ sculpted morph shows both heroes; otherwise the outgoing world fades
  without its hero, and the neon giant fades first on the fold.

### Earned chaos (same rules)

Clean streaks raise three bounded visual tiers: roadside night shards and split
sun facets, world-frame ink confetti on real flips, elastic gummy plant caps and
slam splashes, subtle painted leaf swirls, and low-gravity lunar dust comets.
Big clears briefly pop a medium-matched comic sticker, kick the scenery and add
short, syncopated musical accents; Moon's
two credits produce **one** landing burst. EXTREME's confetti and **OVERKILL!**
stamp require actual successful contact, then contract during the rewind.

No new modes, hazards or difficulty changes. New fragments avoid the projected
jump envelope, presented hazards and HUD; jelly's canopy underside stays static.
Effects use simulation time and the existing eight-effect/1.5-second lifetime,
with at most 32 procedural fragments per world pass (four in reduced motion).
Stage intros stay quiet, pause/hidden time freezes the response, and no audio
accent is queued for a later unlock. Reduced motion suppresses secondary wobble
and trails without changing the real ink quarter-turn mechanic.

Cleared cacti stay
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

Night alone retains the four deterministic rhythm rows, rotating by lap and
obstacle index: `[1.05, 1.5, 1.2, 1.65]`, `[1.4, 1.1, 1.6, 1.25]`,
`[1.65, 1.2, 1.45, 1.05]`, `[1.15, 1.55, 1.05, 1.4]`. Its rhythm ID is explicitly
0; its gaps scale by `1 / sqrt(speedMultiplier)` with a **1 s floor**. It retains
jump velocity **7.7**, gravity **18**, a **0.16 s** input buffer, six-clear target
and **10/14 s** minimum/deadline. The deadline stops spawning; presented hazards
finish before a grounded exit instead of disappearing at the boundary.

### Stage mechanics (one button, fresh presses)

| Stage | Jump / gravity | Authored contacts and action |
| --- | --- | --- |
| Ink | 7.7 / 18 | Four cacti, **2.15 s** apart. Each earned landing turns the floor **90° once**, not once per pending credit. A full 0/90/180/270/360° revolution is visible. |
| Jelly | 10 / 12 | Six cells **1.45 s** apart. Each floor cactus has a canopy **0.65 s** behind it, spawned together. Fresh ground press bounces; one fresh airborne press sets velocity **−16** to drop. Further airborne presses do nothing. |
| Painted | 7.7 / 18 | Three two-jump phrases: six cacti with gaps **1.10, 1.80, 1.10, 1.80, 1.10 s**. This is a rhythm variation, not a new ability. |
| Moon | 6 / 5 | Three pairs, **0.75 s** within each pair and **3.0 s** between pair starts. One 2.4 s float clears both; two credits arrive once on the shared landing. No airborne action or repeat buffering. |

These new intervals are **seconds, never divided by the lap multiplier**. World
movement still accelerates. New stages show their one-line cue immediately and
spawn their first complete cell after **1 s**, giving **1.95–2.35 s** before first
contact. Sequences stop after their authored count, then wait for every presented
hazard to resolve and the player to land. Ink also waits for its final turn and
brief settled endpoint. Turns take **0.70 s**, or a gentler **0.90 s** in reduced
motion, and alternate direction on later laps. After a missed ink cactus, a
surviving grounded exit finishes the revolution without awarding a false clear.

Jelly's actual sculpted head height is `(41 − 0.5) / (47 / 2.2)` = **1.896 units**.
The opaque canopy underside is **2.696**, so its maximum safe foot height is
**0.8**. Contact uses `abs(z) < 0.4` and foot height above 0.8; floor contact uses
foot height below 0.58. Passing a canopy grounded resolves it without points,
pending credits or combo reset. A practical jelly rhythm is launch 0.25–0.35 s
before a cactus, then drop 0.08–0.36 s after it. Holding the button cannot slam or
auto-bounce. Moon's 3.6-unit apex and both pair members fit the authored camera.

Three hearts, **0.35 s** contact recovery and one-heart lap healing (maximum
three) remain. Every contact consumes that exact obstacle, including protected
contacts. Live hazards are capped at five; compound spawns reserve two slots,
and the collision-free cleared tail is capped at eight. Landings bank ground
clears once; merely tapping, slamming, spawning or ducking under a canopy does
not earn points. No transition erases a still-live canopy or changes gravity
mid-flight.

A clean deterministic first-lap reference now presents **30 ground hazards**
(8 night, 4 ink, 6 jelly, 6 painted, 6 moon), plus six no-score canopies. Including
three opening clears and EXTREME's single 150-point bonus, it scores **4,715**;
two clean laps score **9,280** in the reference run. Scores depend on actual
clears/combos and are not directly comparable with the shorter previous route.
Existing best/share storage keys are retained; best scores are **not reset**.
Each ordinary ground clear is worth at most 150 points.

After the moon, **EXTREME** is the finale:

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

Farts occur **only during EXTREME**; ordinary jumps use short synth cues, jelly boings/drops, and moon airy glides. Chrome phases retain
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

Production `DINO_DEBUG.state` is a read-only frozen snapshot. Version 6 includes
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
bounds. Exposure does not grant a state setter or a scoring shortcut.

Browser verification is performed externally, without adding dependencies or
shipping test controls. Headless timings are not physical-phone performance
claims. Check both themes, touch DPR2 and desktop, first-attempt crash/retry,
two-plus keyboard/touch lap returns, all ink orientations, jelly no-slam failure,
jelly timing windows at 1×/1.8×, moon double credits, later Chrome damage, cactus
pass-through, painted
big clears, short landscape EXTREME headroom, and pause/mute/missing-asset/no-audio
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
