# Chordless

Air instruments for Meta Quest, played with your bare hands: a guitar, a
violin, a cello, a pair of orchestral cymbals and a piano. On the guitar your left fingers fret real strings at real fret
positions on a full-size steel-string guitar, and your right index fingertip
plucks: sweep across the strings to strum, flick one string to pick a single
note. On the violin and cello your left fingers stop the strings anywhere on
a fretless fingerboard and your right hand draws a bow. The cymbals are one
in each hand: clash them together. The piano stands in front of you and
you play its keys with all ten fingertips. The sound is synthesized in the
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

**Panel.** Point a hand at the panel and pinch to press **Guitar**,
**Violin**, **Cello**, **Cymbals** or **Piano** (which instrument to play), **Clean** or **Overdrive**, **Vol −** /
**Vol +**, or **Reset position** (back to the default position).

### The violin

The violin rests under your chin on your left shoulder, the neck pointing
forward and to the left, the top tilted toward your bow arm. Like the guitar,
it follows you when you turn your body but not when you glance along the neck.

**Left hand (stopping).** Press a fingertip onto a string anywhere on the
fingerboard: there are no frets, so the pitch comes from exactly where you
press, and the stop nearest the bridge sounds. Pitches snap to the nearest
semitone, holding a note until your finger is clearly nearer the next one, so
tracking jitter cannot wobble it; hold a note and it grows a gentle vibrato.
Set `intonation` to `free` on the `AirViolin` component for a true
fretless fingerboard, where your own finger makes the vibrato and slides.

**Right hand (bowing).** The bow is in your right hand, held at the frog the
way a violinist holds it: palm down, the stick across your fingers, the tip
pointing to your left. Draw it along itself across the strings between the
bridge and the end of the fingerboard. Bow speed sets the loudness; pressing
the hair a little into the string fills out the tone, and bowing near the
bridge is brighter than over the fingerboard. The bridge is arched, so the
bow's tilt chooses the string, as a violinist's arm does: raise your bow hand
for the G string and lower it for the E, about 15 degrees per string, and
tilt between two strings to play both. Lift it off to stop. Each change of bow direction starts a new stroke.

**Visual cues.** Shadows under your left fingertips (green when stopping a
string), a green dot where each string is stopped, an amber ring where the bow
meets the strings, a glow along each string as it sounds, and a display past
the scroll naming the note bowed and the note each string would play.

### The cello

The cello stands in front of you, a little to the left, as a seated cellist
holds it: the endpin toward the floor, the body at about hip height, the neck
leaning back past the left of your chin, and the strings facing away from
you, the C string on your left and the A on your right. Your left hand
reaches round the neck from the C-string side to stop the strings, a
semitone per finger in the lower positions; your right hand holds a cello
bow and draws it across the strings below the fingerboard. As on the
violin, the bow's tilt chooses the string (raise your bow hand for the C,
lower it for the A), its speed sets the loudness, and the stop nearest the
bridge sets the pitch.

### The cymbals

A pair of 18-inch orchestral clash cymbals, one in each hand, held by the
strap: make a fist and the cymbal hangs beyond your knuckles, its face
pointing the way your hand points and the strap across your fingers. Bring
the plates together to clash them; the faster they meet, the louder (and
brighter) the crash, from a soft *pp* at walking pace to *ff* at about 2 m/s.
They must part a couple of centimetres before they can clash again. Meet
them a little off-centre, as cymbal players do: plates that meet flat and
centred trap air and sound muffled. To stop the ringing, hold them together
after the clash (*secco*), lay them together gently, or press either plate
to your chest. The rims glow while the cymbals ring.

### The piano

A 61-key console piano, C2 to C7, at real piano scale (164.5 mm to the
octave), set down in front of you when you choose it: the keys at about
elbow height, their front edge 30 cm ahead of your eyes, square to the way
you face. **Reset position** sets it down again in front of you. Play with
any fingertip, thumbs included: a key goes down as far as you push it, and
sounds when it is two thirds of the way down, as loud as your finger was
moving (a gentle press is *pp*, a fast strike *ff*). It stops when you let
it up, except the top octave and a half, which has no dampers, as on a real
piano. Black keys play at the back of the keyboard, where they stand
between the whites. A finger keeps the key it came down on while it rocks
or slides a little, and a hand that slips in under the tops of the keys
from the front or side plays nothing. Sounding keys glow, and the HUD above
the music rest names the chord (three or more keys) or the notes held.

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

The violin lives in `src/violin/`, built the same way:

- `air-violin-system.ts` holds the violin under the chin, reads the left
  hand into stops and puts the bow in the right hand.
- `geometry.ts` has a full-size violin's dimensions: a 328 mm string
  length, the arched bridge and fingerboard, and stopping position to pitch.
- `stopping.ts` turns finger points into where each string is stopped,
  with semitone snapping.
- `bow.ts` places the bow from the right hand's joints and finds which
  strings the hair crosses, how hard it presses and how fast it moves; a
  hand moving faster than any bow stroke is a tracking jump and plays
  nothing.
- `synth.ts` is a bowed string per voice: the bowed string's sawtooth-like
  Helmholtz motion with the bow's notches, rosin noise, vibrato, and the
  resonances of a violin body.
- `bowed-system.ts` is the system itself, made for each instrument from its
  geometry, bow, voice, model and where it is held (`air-violin-system.ts`
  makes the violin's).
- `src/scene-assets/violin.scene-asset.ts` builds the violin, the cello and
  their bows; they are also in the asset manifest (`violin`, `violin-bow`,
  `cello`, `cello-bow`).

The cello (`src/cello/`) is the same family with its own numbers: a 690 mm
string length and wider arch (`geometry.ts`, which also holds its bow and
its voice, a body about an octave below the violin's with a formant around
1.5-2.5 kHz), its state component and its system's placement.

The cymbals (`src/cymbals/`):

- `geometry.ts` is the 18-inch plate's shape (bow, bell, thickness and
  where the hand grips the strap), shared by the model and the clash
  detection.
- `clash.ts` puts a cymbal in a fist (`cymbalPose`) and watches the pair
  (`ClashDetector`): the rims meet first, since the plates are dished, so
  the gap is the nearest rim of either plate to the other's rim plane while
  they face each other. A clash sounds the frame the gap closes, as loud as
  the plates were closing over the last few frames; a jump in tracking is
  not a clash, and the plates must part again before the next. Plates held
  together after a clash, or laid together gently, damp the ringing; so
  does either plate against the chest (`touchesSphere`).
- `synth.ts` pre-renders three clashes, soft to loud, off the main thread
  when the app starts: a noise wash in bands that bloom upward after the
  impact and lose their highs first, about 150 inharmonic partials for the
  metal's shimmer, the plate's beating low modes and the impact's crack.
  Each clash crossfades the two layers either side of its loudness through
  a lowpass that opens with it, into a hall; a flat clash adds the air
  pocket's whump. Damping chokes everything ringing in about 0.1 s.
- `air-cymbals-system.ts` puts the cymbals in the hands, runs the clash
  detection and the sound, and draws the rims' glow and the HUD.
- `src/scene-assets/cymbal.scene-asset.ts` builds the cymbal: a lathed
  bronze plate (its grooves and hammer marks in the surface maps), a leather
  pad and the strap handle, knotted inside the bell (`cymbal` in the asset
  manifest).

Feel can be tuned in a few constants: how close a finger must be to press
(`PRESS` in `fretting.ts`), the picking zone, re-pluck lockout and mute timing
(`pluck-detector.ts`), and where the guitar hangs and how far it tilts toward
you (`DEFAULT_PLACEMENT` and `FACE_TILT` in `air-guitar-system.ts`).

The piano (`src/piano/`):

- `geometry.ts` lays out the keyboard: the white keys on a regular pitch,
  the black keys spread evenly within their groups of two and three as on a
  real piano, each white key's outline cut back round its black neighbours,
  and `keyAt`, which finds the key under a point (black keys first).
- `keys.ts` turns fingertips into key presses (`Keyboard`): a tip takes
  hold of the key it comes down onto from above, the key goes down as far
  as the tip's pad pushes it, a note sounds at 6.5 mm of the 10 mm dip and
  stops when the key is back above 3 mm. A strike's velocity is the tip's
  downward speed just before it, smoothed and peak-held over about 50 ms so
  a two-frame strike still counts fully.
- `synth.ts` renders every third key at a soft and a hard blow, off the
  main thread, the first time the piano is chosen, from the middle of the
  keyboard outward; keys between play a neighbour a semitone up or down,
  and keys not yet rendered borrow the nearest one that is. A rendered note
  is up to 40 partials, stretched sharp as a stiff string's are, each made
  of unison strings slightly out of tune with one another that beat and
  decay fast then slow (a piano's two-stage decay), shaped by where the
  hammer strikes and by its felt, which brightens with a harder blow, plus
  the hammer's knock. Playback crossfades the two blows by velocity, pans
  bass to treble, colours it with a soundboard and room, and drops a damper
  on release.
- `air-piano-system.ts` places the piano, reads the ten fingertips into
  piano space, plays and stops notes, turns each key about its pivot,
  lights the sounding keys and draws the HUD.
- `src/scene-assets/piano.scene-asset.ts` builds the piano: ivory and ebony
  keys, each its own lever, a black lacquer case with cheek blocks, a
  fallboard over the red key felt, a lid and music rest, side panels and a
  three-pedal box (`piano` in the asset manifest). `fitPianoStand`
  stretches the side panels to the floor for the height the keys are set at.

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
npm run test:violin
npm run test:cello
npm run test:cymbals
npm run test:piano
npm run play:william-tell
npm run play:violin
npm run play:cello
npm run play:cymbals
npm run play:piano
```

- `tests/air-guitar.e2e.mjs` checks seven chord shapes (C, G, D, Am, Em, E and
  an F barre) formed by an emulated left hand, single-string picking, fast,
  deep and slow strums, hammer-ons, re-placing the guitar, the panel buttons
  and hand-tracking loss. Results and screenshots go to `test-results/`.
  Set `E2E_PACE=2` to slow it down to watch.
- `tests/violin.e2e.mjs` and `tests/cello.e2e.mjs` (both through
  `tests/bowed-e2e.js`) choose the instrument on the panel, bows each open
  string and a double stop by tilting the bow, stops a string twice (B4 and
  E5 on the violin's A string, E3 and A3 on the cello's D), and checks that a lifted bow is silent and that each change of bow
  direction is one stroke.
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
- `tests/violin-william-tell.mjs` (`npm run play:violin`) plays the same
  theme on the violin at the written pitch, as the first violins have it (up
  to C#6), closing on an E major double stop. `tests/violin-performer.js`
  marks up the part as a violinist would: every note's string, hand
  position and finger chosen for the whole piece at once (the quiet theme in
  first position, the tutti mostly in second), fingers that stay down until
  they would spoil a note and land on a sounding string just as the bow
  turns, and shifts late in a note. The bow alternates strokes near its
  middle, crossing strings at the turn, faster, nearer the bridge and
  pressed harder when loud. Notes are scored from the app's own synth:
  in the middle of each note the loudest string must play the right pitch
  and no other string may sound. `npm run check:violin` runs the same
  performance through the app's stopping reader and bow contact offline, at
  steady and uneven frame rates.
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
- `tests/render-violin.mjs` and `tests/render-cello.mjs` (`npm run
  render:violin`, `render:cello`, through `tests/bowed-render.js`) do the
  same for the bowed instruments: long bowed notes up the top string, the
  loud William Tell passage and the two lowest open strings, into
  `test-results/audio/<label>-<instrument>-*.wav`.
- `tests/cello-william-tell.mjs` (`npm run play:cello`) plays the theme on the
  cello, an octave below the guitar's arrangement, with the cello's
  fingering (a semitone per finger, extensions for a whole tone) from
  `tests/cello-performer.js`; `npm run check:cello` checks it offline. The
  violin and cello performers, checks and play scripts share
  `tests/bowed-performer.js`, `tests/bowed-check.js` and
  `tests/bowed-play.js`.
- `tests/cymbals.e2e.mjs` (`npm run test:cymbals`) chooses the cymbals on the
  panel, closes both hands into fists round the straps and drives the plates
  along scripted paths: a fast clash rings *ff*, a slow one is soft, a flat
  one is muffled, plates passing edge-on are silent, and holding them
  together or pressing one to the chest stops the ringing.
- `tests/cymbals-william-tell.mjs` (`npm run play:cymbals`) plays a cymbal
  part for the theme's loud section (see Credits) from
  `tests/cymbals-performer.js`: a glancing clash on every downbeat at the
  speed its dynamic needs, one *secco*, and a last crash swung open and then
  stopped against the chest. `npm run check:cymbals` checks it offline at
  four frame rates, and `npm run render:cymbals` renders clashes at *pp*,
  *mf* and *ff*, a flat one and the whole part to WAV.
- `tests/piano.e2e.mjs` (`npm run test:piano`) chooses the piano on the
  panel, points both index fingers and pins their tips along scripted
  paths in piano space: a firm press sounds middle C and turns and lights
  the key, a slow press is soft and a fast strike loud, black keys play,
  both hands hold a fifth (screenshot), the undamped top keys ring on while
  the rest stop, a hand sliding in under the key tops is silent, **Reset
  position** turns the piano to face the player, and the other instruments'
  buttons put it away. It also renders middle C at both blows to WAV.
- `tests/piano-william-tell.mjs` (`npm run play:piano`) plays the galop
  finale on the piano from `tests/piano-performer.js`: the theme in the right
  hand (quiet, then tutti an octave up) over the left hand's *oom-pah* bass,
  fingered thumb to little finger with every finger posed by the guitar's
  hand rig (the idle ones hover over the keys beside the playing one),
  288 strikes at *p*, *f* and *ff*, ending on E2 and E6. It prints how many
  keys sounded on time and as loud as asked and renders what the piano
  played to `test-results/piano-william-tell.wav`. `npm run check:piano`
  runs the same part offline through the key detection at four frame rates.

Both bring the browser window to the front; a window behind others renders at
about 1 fps. Each script must finish within IWSDK's 110-second limit.

## Project layout

```
iwsdk.config.json      IWSDK project settings: scene, assets, components, XR
src/index.ts           creates the world and registers the systems
src/guitar/            the air guitar (see How it works)
src/violin/            the air violin and bow, and what the bowed instruments share
src/cello/             the air cello
src/cymbals/           the air cymbals
src/piano/             the air piano
src/scene-assets/      the room's models, the violin, cello and bows, the cymbal and the piano
src/panel.ts           the panel's buttons
src/assets.ts          asset catalog for the scene
src/components.ts      component catalog
public/scenes/         the room the guitar is played in
public/ui/             the panel layout (UIKitML)
tests/unit/            unit tests
tests/air-guitar.e2e.mjs, tests/chord-hand.js   end-to-end test and chord hand poses
tests/violin.e2e.mjs, tests/cello.e2e.mjs, tests/bowed-e2e.js   end-to-end tests for the bowed instruments
tests/{violin,cello}-william-tell.mjs, -performer.js, -check.mjs, tests/bowed-*.js   bowed song playback and its checks
tests/cymbals.e2e.mjs, tests/cymbals-william-tell.mjs, -performer.js, -check.mjs   cymbal test, playback and its check
tests/piano.e2e.mjs    piano end-to-end test
tests/william-tell.mjs, tests/performer.js, tests/hand-rig.js, tests/songs/   song playback
tests/hand-check.mjs, tests/timing-check.mjs   checks on the performer's hands and timing
```

## Credits

`tests/songs/william-tell.js` transcribes the first-violin melody of the finale
(bars 243–275) of Gioachino Rossini's *William Tell* Overture (1829, public
domain) from "William Tell: Overture to the Opera", full score typeset by
Max Wilkinson (2008), [IMSLP #22579](https://imslp.org/wiki/Guillaume_Tell_(Rossini,_Gioacchino)),
licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
Changes: melody only, without articulation; arranged for guitar with the loud
section an octave lower and an added closing E major chord; for violin at
the written pitch with an added closing E major double stop; and for cello an
octave below the guitar arrangement with the same double stop two octaves
below the violin's. The cymbal part (bars 260–276) is not from the score:
it is arranged here, a crash on each downbeat of the loud section.

Built with [IWSDK](https://iwsdk.dev/).
