# Chordless: The Conductor of AI (trailer cut)

**Video Length:** 2:52 (the rules say *less than* three minutes; judges may stop at 3:00)
**Competition:** Meta VR Start Developer Competition 2026 (deadline Nov 18, 2026, 12:00 PM PT)
**Speaker:** Technickel (Conductor of AI, a human who directs AI tools; never presented as an AI himself)
**Tech:** Built with IWSDK, Meta's Immersive Web SDK, as a WebXR app in the Quest browser
**Music:** a plain guitar tune (*Ode to Joy*, Beethoven, 1824, public domain), then Gioachino Rossini,
*William Tell* Overture, Finale (1829), public domain, played in Chordless by its own synthesized
instruments. No recording of either piece is used anywhere.

This file is the human half of the edit: what to generate, what to record, and what Technickel
says. [`edit-plan.yaml`](edit-plan.yaml) is the machine half. It uses the same shot IDs, placed
on the timeline, for the DaVinci Resolve MCP to build from.

**What changed from the first draft.** The first draft was a concert: the conductor's intro and gag
montage, then one long play of the finale with instruments joining section by section. This draft keeps
the whole opening (the conductor of AI, the four gags, the vanishing act, the title) and replaces the
concert with a game trailer: a modest guitar tune, a flubbed note, a rage that builds on the
*William Tell* score, the destruction mechanic introduced at the score's high point, then title cards
for the features. The opening costs 12 s of the score against a trailer-only cut, so the middle
episodes are trimmed.

---

## The shape

| Beat | Time | What the viewer gets |
| --- | --- | --- |
| 1. The conductor of AI | 0:00–0:30 | Technickel introduces himself in the empty hall, the four-gag montage of why real instruments are a pain, the vanishing act, the title, the headset |
| 2. A simple song | 0:30–0:44 | One air guitar, a slow tune, nothing fancy |
| 3. The flub | 0:43.8–0:45.3 | One wrong note, then silence |
| 4. The rage | 0:45.3–1:07.9 | *William Tell* builds under him, and the picture goes red, then white |
| 5. The high point | 1:07.9–1:20.5 | The score's tutti hits and he smashes the guitar. This is where destruction is introduced |
| 6. The cards | 1:20.5–2:35.3 | **FULL DESTRUCTION**, **MULTIPLE INSTRUMENTS**, **CHANGING ENVIRONMENTS**, over the rest of the score |
| 7. The bow | 2:35.3–2:52.3 | Final chord, the bow, a short pitch over real Quest footage, the end card |

## How the rules shape this cut

From the competition's Polish & Presentation criterion: *"Don't lean on AI-generated video to
carry the pitch."* It also asks for footage "as viewed on a Meta Quest device or via XR
Simulator" and real gameplay that honestly represents the app. So:

- **AI clips are the frame, app footage is the picture.** About 55 s of AI clips against about
  2:00 of real Chordless footage, so roughly 70% real. The trailer cards make the app the star.
- **Every human in an AI clip has an emoji face**, like Technickel. That keeps your house style
  and also covers the rule that entries may not "depict any identifiable person other than
  Entrants". No real brand logos in generated clips.
- **Record at least one shot on a real Quest with your own hands** (shot `R-quest`, under the
  **BARE HANDS** card and the closing pitch).
- **Captions and cards carry the story during the music, not voiceover.** There are only two
  voiceover lines during the performance, both in quiet passages. The loud passages have no talking.
  Voiceover is on its own track, so a music-only cut is just muting A1.
- **Credits are on screen, not just in the description.** See [Attribution](#attribution).
- **The destruction is the app's own.** Nothing is faked in post. The red, the white-out and the
  slow motion are grading and speed ramps on real captures of the smashing.

## The pitch in three lines

The voiceover makes three claims, and everything else supports them:

1. **It's the instrument, not a game about one.** Most music in VR is a rhythm game or a
   mixed-reality overlay that teaches a real guitar you already own. In Chordless your hands
   *play* the instrument: real strings at real fret positions, a bow, ten fingers on a piano.
2. **You can break them.** Pick an instrument up and smash it, and it comes apart where it was hit.
   It is the only instrument you can play, destroy and put back together in the same minute.
3. **It's built on the open web.** IWSDK, Meta's Immersive Web SDK, makes it a WebXR app that
   opens in the Quest browser with no install and no controllers.

## The music

Two pieces, back to back, joined by silence.

**The tune (0:30–0:44).** *Ode to Joy*, first six bars, one air guitar, single notes, no chords,
at quarter = 100 in 4/4 (a bar is 2.4 s). It is deliberately plain so the mistake is audible. On
the last beat of bar 6 the fretting finger lands a fret off and a sour note rings (0:43.8). The tune
is never finished. This needs a new song file and a "flub" in the guitar
performer; see [Still to build](#still-to-build).

**The score (0:45.3–2:35.3).** A 110 s trim of the two-minute concert cut of the *William Tell* finale, starting
cold into the silence after the flub. Because the rage must *build*, it uses the same layering as the
concert cut, one instrument section at a time, but its sections now carry the story:

| Section | Share | Playing | What is on screen |
| --- | --- | --- | --- |
| Fanfare | ~10 s | trumpet alone | **Rage 1**: the silence cracks, Technickel's grin goes flat |
| Galop theme, quiet (bars 244–259) | ~13 s | + guitar, pp | **Rage 2**: shaking, red creeping in from the edges |
| Galop theme, loud (bars 260–275) | ~13 s | + cello, + everything arranged so far | **The high point**: white-out, then the smash. FULL DESTRUCTION card |
| Middle episodes, quiet | ~18 s | + violin, trombone, horn | **MULTIPLE INSTRUMENTS** card |
| Middle episodes, building | ~14 s | + piano, + triangle | the instrument roll continues |
| Galop returns | ~16 s | + drums | **CHANGING ENVIRONMENTS** card |
| Quiet before the coda | ~10 s | everyone but the cymbals | **BARE HANDS** card, the 3×3 grid builds |
| Coda | ~14 s | **everything, with the cymbals' first crash** | the whole stage breaks on the crash |
| Final chord | ~3 s | everything | cutoff |

That is 110 s, so the score ends at about 2:35.3 and act 3 has 17 s. If the arrangement runs
longer, drop a repeat from the middle episodes rather than squeezing the opening or the bow.

| Unit at quarter = 152, 2/4 | Length |
| --- | --- |
| 1 beat | 0.3947 s |
| 1 bar | 0.7895 s |
| 4 bars (one phrase) | 3.158 s |
| 8 bars | 6.316 s |

Picture is cut on bar lines. The cuts speed up as the orchestra grows (every 8 bars, then 4, 2,
then every bar in the coda). The galop bars (243–276) are final; the other sections' bar numbers
are provisional until each part's concert cut is mapped.

## Shot naming

- `clips/1-3.mp4`: an AI clip (beat-shot)
- `clips/c-2.mp4`: an AI-generated cutaway of the conductor or player, used during the performance
- `takes/<instrument>-<scene>.mp4`: a screen-captured Chordless performance (scene = the file
  name from `src/scene-list.ts`)
- `takes/smash-<instrument>-<scene>.mp4`: the same, with a scripted smash
- `audio/vo-1-2.mp3`: a voiceover line
- `audio/stems/<instrument>-<scene>.wav`: that take's audio

**Character sheet** (paste into every Technickel prompt): *TECHNICKEL, an orchestra conductor: a man
whose head is a yellow "cool" sunglasses emoji (😎). He wears a black concert tailcoat, a
white bow tie, white gloves, and holds a slim white conductor's baton.*

Technickel is also the player. From shot 1-9 he wears the headset, and the app footage is his point
of view. His emoji face is the mood gauge: 😎 (calm) → 😐 (the flub) → 😠 (rage) → 🤬 (the peak) → 😈
(the smash) → 😎 (the bow).

---

### **Beat 1: The Conductor of AI**

**(0:00 – 0:30)**

#### Shot 1-1: The Empty Hall (0:00 – 0:03)

**Visuals:**
> **Storyboard Prompt:** "A photorealistic, cinematic 16:9 still of a grand, gilded concert hall in near darkness. On stage, rows of empty orchestra chairs and music stands, but no musicians and no instruments. A single spotlight lands on an empty conductor's podium."
>
> **Video Prompt:** "Slow push in toward the podium. The spotlight flickers on. TECHNICKEL walks into the light from stage left and steps onto the podium."
>
> **Audio:** Orchestra tuning-up cacophony (no instruments visible, which is the joke), fading under the VO.

#### Shot 1-2: The Introduction (0:03 – 0:09)

**Visuals:**
> **Storyboard Prompt:** "A photorealistic 16:9 medium shot of TECHNICKEL on a conductor's podium in a dim, gilded concert hall, empty orchestra chairs behind him, spotlit, baton held at his side."
>
> **Video Prompt:** "TECHNICKEL turns to face the camera, gives a small bow, and gestures with his baton at the empty chairs behind him, as if presenting them."

**Technickel (VO, warm and theatrical):**
Good evening! I'm Technickel, conductor of AI. And every musician I know has the same problem.

#### Shots 1-3 to 1-6: The Gag Montage (0:09 – 0:21, 3 s each)

**Technickel (VO, quick, one line per shot):**
Their instrument. (1-3) It needs its own plane seat. (1-4) It gets noise complaints at 2 a.m.
(1-5) It won't fit up the stairs. (1-6) And it is *not* library-friendly.

> **1-3 Storyboard Prompt:** "A photorealistic 16:9 still inside an airplane cabin. A full-size cello sits buckled into a window seat with a tiny airline meal on its tray table. Squeezed into the middle seat beside it, a cellist with a weary emoji face (😩) holds two boarding passes. No airline logos."
>
> **1-3 Video Prompt:** "A flight attendant with a polite smiling emoji face (🙂) leans in and hands the cello a small bag of pretzels. The cellist slowly turns to look at the camera."

> **1-4 Storyboard Prompt:** "A photorealistic 16:9 still of a cramped apartment at night. A wall clock reads 2:13. A drummer with a focused emoji face (😤) plays a full drum kit under a single lamp."
>
> **1-4 Video Prompt:** "The ceiling shakes as someone upstairs pounds on it with a broom handle; plaster dust falls onto the cymbals. A note slides under the door reading 'PLEASE.' The drummer's emoji face changes to embarrassed (😬)."

> **1-5 Storyboard Prompt:** "A photorealistic 16:9 still of a narrow apartment stairwell. Two movers with straining emoji faces (😣) are wedged sideways with a black grand piano, completely stuck. Behind them, a pianist with an anxious emoji face (😰) holds only the piano bench."
>
> **1-5 Video Prompt:** "The movers push. The piano does not move. One mover slowly slides down the wall to sit on a step. The pianist sets the bench down and sits on it in defeat."

> **1-6 Storyboard Prompt:** "A photorealistic 16:9 still of a silent, towering wood-paneled library. A percussionist with an excited emoji face (😁) stands between the shelves holding two large orchestral cymbals raised high, about to crash them."
>
> **1-6 Video Prompt:** "From behind a bookshelf, a librarian with a shushing emoji face (🤫) slowly lowers their reading glasses and stares. The percussionist freezes mid-swing, cymbals an inch apart."

*Alternates if one doesn't generate well:* the trumpet player whose practice sets off every dog
on the block; the drummer's eleventh trip to an overflowing hatchback; the triangle player who
booked the conservatory practice room three weeks out, for a triangle.

#### Shot 1-7: The Vanishing Act (0:21 – 0:25)

> **Storyboard Prompt:** "A photorealistic 16:9 wide shot of the gilded concert hall, now fully lit. Every orchestra chair holds an instrument (cellos, violins, a grand piano, a drum kit, trumpets) but there are still no musicians. TECHNICKEL stands on the podium, baton raised."
>
> **Video Prompt:** "TECHNICKEL flicks the baton once. Every instrument on stage dissolves into golden sparkles that drift up into the light, leaving only empty chairs. He tucks the baton under his arm, pleased."

**Technickel (VO):**
So I left the instruments at home. All of them.

#### Shot 1-8: Title Card (0:25 – 0:27)

Designed in Resolve (Text+), not generated. **CHORDLESS**, with the subtitle *Air instruments
for Meta Quest. Played with your bare hands.* Behind it, a slow-motion take of fingertips on
the air guitar's strings (from `takes/guitar-cliffside.mp4`), darkened.

**Technickel (VO):**
Meet Chordless.

#### Shot 1-9: From the Top (0:27 – 0:30)

> **Storyboard Prompt:** "A photorealistic 16:9 medium shot of TECHNICKEL on the podium wearing a sleek, unbranded white VR headset over his sunglasses emoji face, baton raised in the spotlight."
>
> **Video Prompt:** "TECHNICKEL taps his baton three times on the music stand, raises both arms, holds for one beat, then gives a sharp downbeat."

**Sync note:** The three baton taps are SFX on beats −4, −3 and −2 before the first note (the tune is
quarter = 100, so they are 0.6 s apart), and the downbeat cuts straight to the guitar on the first
note, at **0:30**.

---

### **Beat 2: A Simple Song**

**(0:30 – 0:44)**

POV capture, `takes/guitar-cliffside-tune.mp4`: the air guitar at the Cliffside Sunset scene,
playing *Ode to Joy* slowly, single notes. Nothing flashy; it should feel like a first lesson.
Slow push-in on the fretting hand over the 14 s.

**Lower third (0:31, 3 s):** GUITAR · Cliffside Sunset
**On screen at the first note:**

- **Music credit** (top left, 0:30–0:36): *Ludwig van Beethoven · Ode to Joy (1824) · Public domain*
- **Corner bug** (small, top right, for the rest of the video): *IN-APP CAPTURE*

**VO-A, the uniqueness line (0:31–0:42, about 11 s, under the tune):**
Most music in VR is a rhythm game, or a mixed-reality overlay on a guitar you already own.
Chordless *is* the instrument. Real strings, real frets. Just your hands.

*Worded as a contrast, not "the first ever", so it's a claim nobody can dispute. "Rhythm
game" names the genre without naming any game.*

---

### **Beat 3: The Flub**

**(0:43.8 – 0:45.3)**

Take `takes/guitar-cliffside-tune.mp4` continues. On the last beat of bar 6 the wrong note rings
(about **0:43.8**, set to the take). The VO ends before it. Then:

1. **Hard cut of the music** on the bar-6 clank. No tail, no reverb.
2. **Punch in 2×** on the fretting finger, one fret off, held 1 s.
3. **Silence**, 1.5 s, room tone only (wind from the Cliffside scene). A single distant crow is
   allowed.

#### Shot c-1: The Look (0:44.3 – 0:45.3)

> **Storyboard Prompt:** "A photorealistic 16:9 close-up of TECHNICKEL in a white VR headset, in a dim gilded concert hall, his sunglasses emoji face (😎) in the spotlight."
>
> **Video Prompt:** "The sunglasses emoji face slowly changes to a flat unimpressed face (😐). He stares straight ahead. A single muscle twitches near his white-gloved fist."

---

### **Beat 4: The Rage**

**(0:45.3 – 1:07.9)**

*William Tell* enters on the first note at **0:45.3**, cold, into the silence. Treat the next 22.6 s
as one continuous ramp. Everything below is applied on top of real captures and ramps with the
music, not the clock:

| Effect | Start | Peak |
| --- | --- | --- |
| Red grade (lift reds, crush blues) | +0 s | +16 s |
| Vignette closing in | +0 s | +16 s |
| Camera shake (a few px, then more) | +4 s | +20 s |
| Cut speed | every 8 bars | every 2 bars |
| Gain / exposure (the "blinding") | +12 s | +22.6 s: +5 stops, a clean white |
| Heartbeat SFX, on the beat | +0 s | +20 s, doubling in rate |

**Picture:** the guitar from the tune, played faster and angrier (`takes/guitar-cliffside-rage.mp4`,
the same fretting but the guitar swinging a little), intercut with the AI cutaways:

#### Shot c-2: The Fist (0:46 – 0:48)

> **Storyboard Prompt:** "A photorealistic 16:9 extreme close-up of a white-gloved fist tightening around the neck of an acoustic guitar, in a dim gilded concert hall."
>
> **Video Prompt:** "The glove squeezes the neck until the fabric creaks. Dust falls off the strings. Push in slowly."

#### Shot c-3: The Face (0:55 – 0:57)

> **Storyboard Prompt:** "A photorealistic 16:9 close-up of TECHNICKEL in a white VR headset, his emoji face red with an angry expression (😠), in hard red side light."
>
> **Video Prompt:** "The angry face trembles. It changes to a furious face (🤬) with a rapid shake. Steam puffs out from under the headset. Push in fast."

#### Shot c-4: The Podium (1:02 – 1:04)

> **Storyboard Prompt:** "A photorealistic 16:9 wide low-angle shot of an empty conductor's podium in the gilded concert hall, red light pouring in from stage left, the music stand knocked over."
>
> **Video Prompt:** "The music stand rattles, then shakes itself off the podium and clatters across the stage. The red light flares white."

**Sync note:** The fanfare hands over to the galop at about 0:55.3: put a 4-frame cut to black
there. The gain ramp reaches full white **on the downbeat of bar 260** (the tutti, 1:07.9), and the
white clears into beat 5.

---

### **Beat 5: The High Point (the destruction is introduced)**

**(1:07.9 – 1:20.5)**

The galop's tutti (bar 260) is the loudest, fullest moment of the first half of the score. It is
where the app's destruction mechanic is introduced, and the player has no voiceover: it speaks for
itself.

**Picture:** POV capture, `takes/smash-guitar-cliffside.mp4`:

1. **Bar 260, beat 1.** The white clears on the guitar. The player's fist closes round the neck and
   lifts it off the body.
2. **Bar 260, beat 2.** The swing into the floor, in the Cliffside scene, at **0.25× speed** for one beat and
   ramping back to full speed by the end of the bar. Lead the speed ramp with a bass hit.
3. **Bar 261.** Strings snap. The body splinters where it landed and chunks fly. Hold the camera on
   the chunks tumbling for a full bar, with the tutti at full volume.
4. **Bars 262–263.** Rapid cuts: the neck thrown across the cliff, a second hit on the headstock, the
   hand opening.
5. **Bar 264.** Card slam: **FULL DESTRUCTION** (see [The cards](#the-cards)).

#### Shot c-5: The Grin (bar 261, 1 beat, over the chunks)

> **Storyboard Prompt:** "A photorealistic 16:9 extreme close-up of TECHNICKEL in a white VR headset, in a dim gilded concert hall, golden confetti-like splinters drifting through the red light."
>
> **Video Prompt:** "His furious face (🤬) relaxes into a satisfied grin (😈). Splinters fly past in slow motion."

---

### **Beat 6: The Cards**

**(1:20.5 – 2:35.3)**

The music from here on is a trailer: bursts, drops, a build to a final crash. Each card is a slam in
the style of a game trailer, big white type over a darkened quarter-second, with a short stinger.
The card text is in `edit-plan.yaml`, and the picture behind each is real capture only.

#### The cards

| Card | Time | Under it | Why this beat |
| --- | --- | --- | --- |
| **FULL DESTRUCTION** | 1:11–1:14.5 (bar 264) | the smash from beat 5, then **instrument after instrument** hit one by one, every 2 bars: the piano pushed over with keys flying, the drums pulled off their stands and thrown, the trumpet smashed, the violin smashed | It is the first thing the trailer shows, so the card names it |
| **MULTIPLE INSTRUMENTS** | 1:21–1:24.5 (middle episodes) | a quiet moment: a pinch of both hands, and everything comes back whole. Then the instruments, one every 2 bars: violin, cello, trombone, horn, trumpet, piano, triangle, drums, cymbals, guitar | The pause after the destruction; ten instruments, one per bar |
| **CHANGING ENVIRONMENTS** | 1:53–1:56.5 (galop returns) | a rapid scene flip with the player's real hands on **Next scene**, then a cut every bar: stage, Cliffside Sunset, Underwater, Space Station, Library, Ice Cave, Volcano Rim, Pinball, and so on | The music has returned to the galop; the picture races through the worlds |
| **BARE HANDS** *(optional fourth)* | 2:09–2:12 (quiet before the coda) | `R-quest`, the real headset, real hands, no controllers | Proves the app works on the real device |

The first three are the ones you named. The optional fourth carries the "built on the open web"
claim and the real-Quest shot. If the cut feels too long, drop it and move `R-quest` to the pitch
in beat 7.

**VO-B, the tech line (1:27–1:38, about 11 s, over the quiet middle episodes):**
It's built with Meta's Immersive Web SDK, so it runs right in the Quest browser. No install, no
controllers. Ten instruments, and more than sixty places to play them.

*Fit this line to the quietest passage. If the section is shorter than the line, move the line, don't
shorten the music.*

#### Grid and coda

- **Quiet before the coda (2:08.5):** a 3×3 grid builds, Technickel conducting in the centre tile
  (`c-grid`), one instrument tile appearing every 2 bars.
- **Coda (2:18.5–2:32.5):** full screen on the cymbals' crash, then a 1-bar montage of the smash and
  environment takes, cutting back to the grid on each 4-bar phrase downbeat.
- **Final chord (2:32.5):** the Theatre, full screen: the entire stage comes apart on the last crash
  (`takes/smash-stage-finale.mp4`), then the conductor's fist cutoff (`c-6`).

#### Shot c-6: The Cutoff

> **Storyboard Prompt:** "A photorealistic 16:9 medium shot of TECHNICKEL on the podium, headset pushed up, arm raised, white-gloved fist closed, golden confetti in the air, the hall behind him lit."
>
> **Video Prompt:** "TECHNICKEL snaps his raised hand into a tight fist. Everything stops: the confetti hangs in mid-air for a beat, then falls."

---

### **Beat 7: The Bow**

**(2:35.3 – 2:52.3)**

#### Shot 7-1: Ovation (3 s)

> **Storyboard Prompt:** "A photorealistic 16:9 medium shot of TECHNICKEL on the podium, VR headset pushed up on his head, baton lowered, in a warm spotlight in the gilded concert hall."
>
> **Video Prompt:** "TECHNICKEL turns to the camera and takes a deep, theatrical bow. Golden confetti drifts down through the spotlight."
>
> **Audio:** Applause swell (SFX), fading under the VO.

#### Shot 7-2: The Pitch, Over Real Footage (8 s)

Picture: `R-quest` (your own hands, playing on a real Quest, with its own audio low under the VO),
then `R-scene-flip` for the last 2 s.

**Technickel (VO, warm, unhurried):**
That's Chordless. Not a game about music: an orchestra you can play, and break, in a headset.

#### Shot 7-3: End Card and Credits (6 s)

Designed in Resolve. **CHORDLESS**, *Built with IWSDK, Meta's Immersive Web SDK, for Meta
Quest*, the GitHub Pages URL, and "Meta VR Start Developer Competition 2026". The credits
block from [Attribution](#attribution) runs in small type underneath.

**Technickel (VO):**
Practice anywhere. Break anything.

**(Fade to black. Optional sting: one broom-handle knock on a ceiling, then silence.)**

---

## Attribution

The same credits go in three places: on screen at each first note (short form, above), on the
end card, and in the YouTube description.

**End card and YouTube description (long form):**

> **Music:** Ludwig van Beethoven, *Ode to Joy* (1824), and Gioachino Rossini, *William Tell*
> Overture (*Guillaume Tell*), Finale (1829). Both public domain.
>
> **Arrangement:** *William Tell* is arranged for Chordless from the full score typeset by Max
> Wilkinson (2008), IMSLP #22579, licensed under Creative Commons Attribution 3.0
> (https://creativecommons.org/licenses/by/3.0/). The parts were transcribed and arranged
> for Chordless's instruments.
>
> **Performance:** All music in this video is in-app capture from Chordless. Every note is
> played and synthesized live by the app; no recordings of either piece are used. Performances
> were recorded in IWSDK's XR emulator with scripted hand motion, and on a Meta Quest.
>
> **Built with:** IWSDK (Meta's Immersive Web SDK), WebXR.
>
> **Video:** Conductor and story scenes are AI-generated. All gameplay footage is real.

Two notes on this:

- **The compositions are public domain, but the *William Tell* score edition isn't.** The Wilkinson
  edition that `tests/songs/william-tell.js` is transcribed from is CC BY 3.0, so it needs credit.
  If the full arrangement uses another edition, credit that one too. The *Ode to Joy* tune is a
  hand-written eight bars from the melody, so it needs no edition credit.
- **Say how the performances were captured.** The takes are the app really playing, but the
  hands are scripted in the emulator. Saying so keeps "honestly represents the experience"
  safe; calling it plain "live gameplay" invites a judge to wonder.

---

## Still to build

None of this exists yet. Do it before recording.

1. **Merge the destruction work into the branch you record from.** It lives on
   `claude/instrument-destruction-system-f73726` (guitar, drums, piano, strings, brass, cymbals and
   triangle can all be smashed). It is not on `main`.
2. **A short guitar tune with a flub.** A new `tests/songs/ode-to-joy.js` (six bars, the last beat of bar 6
   on a wrong fret), and a runner, like the concert-cut runners, that plays it at quarter = 100.
3. **Scripted smashes.** A performer step for each instrument that grabs, swings and releases it on a
   given beat, so a smash can land on bar 260 exactly. The destruction branch has `tests/guitar-smash.e2e.mjs`
   and `tests/smash-props.e2e.mjs` to start from.
4. **A take runner** (instrument × scene loop). The same one the first draft needed.
5. **A concert cut for every instrument** that is in the score's sections. Today the guitar, violin,
   trombone and horn have one. The rest play the full-length part.

## Recording List

### AI clips (you generate)

| ID | Use | Length to generate |
| --- | --- | --- |
| 1-1 to 1-7, 1-9 | Beat 1 | 5–8 s each, trimmed in the edit |
| c-1 to c-5 | The look, the fist, the face, the podium, the grin | 3–4 s each; only 1–2 s is used |
| c-6 | The cutoff | 3–4 s |
| c-grid | Technickel conducting in a neutral 2/4 pattern, for the grid centre tile | 8–10 s. It won't be on tempo, so it gets retimed to 152 bpm in the edit |
| 7-1 | The bow | 5 s |

### Chordless takes (scripted, screen-captured)

Each take is a full `play:*` run, 1920×1080 at 60 fps, opened with `?scene=<file>`, with the
`e2e-banner` hidden. Capture the take's audio in the same recording.

| Take | What |
| --- | --- |
| `guitar-cliffside-tune` | The *Ode to Joy* tune with the bar-6 flub |
| `guitar-cliffside-rage` | The guitar during the rage, played hard (fanfare + galop quiet) |
| `smash-guitar-cliffside` | The smash on bar 260 |
| `smash-<instrument>-<scene>` | One per instrument, each smashed on a different bar: `piano-clock-tower`, `drums-living-room`, `trumpet-pirate-ship`, `violin-underwater`, `cello-balloon-basket`, `cymbals-library`, `triangle-fridge`, `trombone-jazz-club`, `horn-mountaintop` |
| `smash-stage-finale` | Every instrument on the Theatre stage coming apart on the final crash |
| `<instrument>-<scene>` | Played-through takes, one per instrument, for the instrument roll and the grid: `trumpet-pirate-ship`, `guitar-train-roof`, `cello-lantern-lake`, `violin-northern-lights`, `piano-stage`, `drums-neon-arcade`, `cymbals-bowling-alley`, `trombone-jazz-club`, `horn-mountaintop` |
| `env-*` (one bar each, 12 used) | `piano-space-station`, `drums-volcano-rim`, `drums-pinball`, `cello-bouncy-castle`, `violin-snow-globe`, `guitar-lava-lamp`, `trumpet-giant-turtle`, `piano-upside-down-room`, `guitar-stadium`, `trumpet-desert-canyon`, `violin-ice-cave`, `drums-record-player`. Spares: `drive-in`, `paper-world`, `floating-islands`, `car-wash` |

### Real captures (you, on the headset)

| ID | What |
| --- | --- |
| R-quest | You playing the guitar on a real Quest (headset recording or cast), about 8 s, with its own audio |
| R-scene-flip | Pinching **Next scene** a dozen times with an instrument in hand, about 4 s |

### Voiceover

| ID | Line starts with | Placement |
| --- | --- | --- |
| vo-1-2 | "Good evening!" | 0:03 |
| vo-1-3 to vo-1-6 | "Their instrument." … | 0:09, one per gag |
| vo-1-7 | "So I left the instruments at home." | 0:21.5 |
| vo-1-8 | "Meet Chordless." | 0:25.3 |
| vo-a | "Most music in VR is a rhythm game…" | 0:31, under the tune |
| vo-b | "It's built with Meta's Immersive Web SDK…" | the quietest middle episode |
| vo-7-2 | "That's Chordless." | the bow + 3.5 s |
| vo-7-3 | "Practice anywhere." | the end card |
