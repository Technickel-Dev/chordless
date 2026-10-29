# Chordless

An air guitar for Meta Quest, played with your bare hands. Your left fingers
fret real strings at real fret positions on a full-size steel-string guitar,
and your right index fingertip plucks: sweep across the strings to strum,
flick one string to pick a single note. The sound is synthesized in the
browser, so there are no audio files.

It is a WebXR app built with [IWSDK](https://iwsdk.dev/), Meta's Immersive Web
SDK. WebXR is the browser standard for VR and AR, so the app runs in the Quest
browser with no install.

## Run it

Requires Node.js 20.19+ (or 22.12+, or 24+).

```sh
npm install
npm run dev
```

`npm run dev` starts the dev server and opens a managed browser window. On a
desktop, IWSDK's emulator (IWER, which fakes a Quest headset, controllers and
hands in the browser) lets you enter XR without a headset; see the
[emulator controls](https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls).

To play on a Quest on the same Wi-Fi network:

```sh
npm run dev:status
```

Open the network URL it prints (`runtimeUrls.network`, an `https://` address
on port 8081) in the Quest browser, accept the local certificate warning, press
**Enter XR**, then put the controllers down so hand tracking takes over.
`npm run dev:down` stops the server.

## How to play

The guitar hangs in front of you like it is on a strap. It follows you when
you step or turn your body, but not when you glance or lean toward the neck,
so your fingers can find the same fret again.

**Left hand (fretting).** Press a fingertip onto a string between two frets.
The highest fret held on a string is the one that sounds, as on a real guitar.
Lay your index finger flat across the strings to barre. Hammer-ons and
pull-offs work: pressing a higher fret on a ringing string changes the note
without a new pluck, and lifting a finger off a ringing string damps it.

**Right hand (picking).** Your index fingertip plucks every string it crosses.
Sweep across several strings to strum, faster for louder. Lift the fingertip
about 2 cm above the strings to move back without playing. To mute a ringing
string, rest your fingertip on it and hold still for a moment.

**Visual cues.** With nothing to touch, the guitar shows you where your hands
are:

- a shadow under each left fingertip, brighter as it nears the strings and
  green when it is pressing;
- a green dot on every pressed string;
- an amber ring under your picking fingertip;
- a glow along each string's vibrating length;
- a display past the headstock naming the chord that is ringing (C, Am7, C/E…)
  and the fret held on each string.

**Fitting the guitar to you.** Pinch thumb and index on both hands and hold for
a second: the sound hole moves to your right pinch and the neck points toward
your left. The placement is remembered.

**Panel.** Point a hand at the panel and pinch to press **Clean** or
**Overdrive**, **Vol −** / **Vol +**, or **Reset guitar** (back to the default
position).

## How it works

IWSDK apps are built on an ECS (entity–component–system): entities carry
components holding data, and systems update them every frame.

- `src/guitar/air-guitar-system.ts` is the main system. Each frame it reads
  both hands' 25 tracked joints, keeps the guitar placed on the player, turns
  the left hand into frets, the right index fingertip into plucks, and drives
  the synth and the visual cues.
- `src/guitar/air-guitar-component.ts` holds the guitar's live state (chord,
  frets, pluck and damp counts, tone, volume), which the panel writes to and
  the tests read.
- `src/guitar/fretting.ts` reads frets from finger points: fingertip pads
  always press, the rest of a finger only where it lies flat (a barre). A
  lifted finger releases its fret after 25 ms (quick enough for pull-offs and
  open notes straight after fretted ones), and frets hold for a moment if hand
  tracking drops out, so a tracking hiccup cannot cut a note.
- `src/guitar/pluck-detector.ts` plucks a string when the fingertip crosses it.
  It smooths tracking jitter with a One Euro filter, checks each crossing where
  it happens, keeps a fast strum going through brief tracking dropouts, and
  only mutes a string the fingertip deliberately rests on.
- `src/guitar/synth.ts` renders each note with the Karplus–Strong plucked-string
  algorithm: the string starts from its plucked shape, vibrates in two
  slightly detuned directions (a quick bright attack into a long, shimmering
  tail), and is heard through a modelled acoustic body (air and plate
  resonances, light bass, a 1–3 kHz presence), a small room and a limiter.
  An overdrive chain is the alternative tone.
- `src/guitar/geometry.ts` holds the guitar's dimensions: a 25.5" scale, 19
  frets at their true positions, strings a little wider apart than a real
  guitar so a tracked fingertip lands on one string.
- `src/guitar/chords.ts` names chords from the notes ringing.
- `src/guitar/guitar-model.ts` builds the guitar model in code.

Feel can be tuned in a few constants: how close a finger must be to press
(`PRESS` in `fretting.ts`), the picking zone, re-pluck lockout and mute timing
(`pluck-detector.ts`), and where the guitar hangs and how far it tilts toward
you (`DEFAULT_PLACEMENT` and `FACE_TILT` in `air-guitar-system.ts`).

## Tests

```sh
npm run typecheck
npm run test:unit
```

Unit tests ([Vitest](https://vitest.dev/)) cover the fretboard geometry, fret
reading (chords, barres, flicker), pluck detection (single strings, fast and
slow strums, tracking noise and dropouts, muting), chord naming, and the
synth (every string in tune within 2 cents, matched loudness, no DC offset,
a steel-string harmonic balance).

The end-to-end test and the song script run inside IWSDK's managed browser and
drive the emulator's hands, so start the dev server with browser automation
allowed first:

```sh
npx iwsdk dev up --headed --allow-browser-automation
npm run test:e2e
npm run play:william-tell
```

- `tests/air-guitar.e2e.mjs` checks seven chord shapes (C, G, D, Am, Em, E and
  an F barre) formed by an emulated left hand, single-string picking, fast,
  deep and slow strums, hammer-ons, re-placing the guitar, the panel buttons
  and hand-tracking loss. Results and screenshots go to `test-results/`.
  Set `E2E_PACE=2` to slow it down to watch.
- `tests/william-tell.mjs` performs the galop theme of the *William Tell*
  Overture finale (bars 243–275) the way a guitarist would, and reports each
  note asked for, the finger and hand position used, the note the app played
  and when it registered. `tests/performer.js` plans the fingering (hand
  positions with lookahead, one finger per fret, fingers kept down until they
  are in the way, shifts with fingers lifted) and the picking (stroke
  directions chosen for the whole song so the finger rarely lifts over a
  string, played just ahead of the beat to allow for the app's delay in
  hearing a pluck), then drives both emulated hands every frame through
  `tests/hand-rig.js`, which solves each finger's joints to reach its
  fingertip target without passing through the others. Set `WT_TEMPO=110`
  for a slower take.
- `npm run check:hands` poses the whole song and checks the hands stay
  plausible: bone lengths, joint limits, no kinked or twisted fingers, no
  finger through another, and no fingertip pad pressing a string or fret it
  should not.
- `npm run check:timing` feeds the posed song through the app's own fret
  reader and pluck detector at steady (90, 72, 60 Hz) and uneven frame
  rates, and scores every note and how far off the beat it lands.
- `tests/render-audio.mjs` (`npm run render:audio`) renders strummed chords,
  a melody and single notes straight from the synth into
  `test-results/audio/<label>-*.wav`, with spectrum statistics, for comparing
  sound changes by ear. Set `AUDIO_LABEL` to name the run.

Both bring the browser window to the front; a window behind others renders at
about 1 fps. Each script must finish within IWSDK's 110-second limit.

## Project layout

```
iwsdk.config.json      IWSDK project settings: scene, assets, components, XR
src/index.ts           creates the world and registers the systems
src/guitar/            the air guitar (see How it works)
src/panel.ts           the panel's buttons
src/assets.ts          asset catalog for the scene
src/components.ts      component catalog
public/scenes/         the room the guitar is played in
public/ui/             the panel layout (UIKitML)
tests/unit/            unit tests
tests/air-guitar.e2e.mjs, tests/chord-hand.js   end-to-end test and chord hand poses
tests/william-tell.mjs, tests/performer.js, tests/hand-rig.js, tests/songs/   song playback
tests/hand-check.mjs, tests/timing-check.mjs   checks on the performer's hands and timing
```

## Credits

`tests/songs/william-tell.js` transcribes the first-violin melody of the finale
(bars 243–275) of Gioachino Rossini's *William Tell* Overture (1829, public
domain) from "William Tell: Overture to the Opera", full score typeset by
Max Wilkinson (2008), [IMSLP #22579](https://imslp.org/wiki/Guillaume_Tell_(Rossini,_Gioacchino)),
licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
Changes: melody only, without articulation, arranged for guitar with the loud
section an octave lower, and an added closing E major chord.

Built with [IWSDK](https://iwsdk.dev/).
