# Chordless: The Conductor of AI

**Video Length:** 2:55 (the rules say *less than* three minutes; judges may stop at 3:00)
**Competition:** Meta VR Start Developer Competition 2026 (deadline Nov 18, 2026, 12:00 PM PT)
**Theme:** A grand concert hall where the orchestra has no instruments
**Speaker:** Technickel (Conductor of AI, a human who directs AI tools; never presented as an AI himself)
**Tech:** Built with IWSDK, Meta's Immersive Web SDK, as a WebXR app in the Quest browser
**Music:** Gioachino Rossini, *William Tell* Overture, Finale (1829), public domain, played in
Chordless by its own synthesized instruments. No recording of the piece is used anywhere.

This file is the human half of the edit: what to generate, what to record, and what Technickel
says. [`edit-plan.yaml`](edit-plan.yaml) is the machine half. It uses the same shot IDs, placed
on the timeline, for the DaVinci Resolve MCP to build from.

---

## How the rules shape this cut

From the competition's Polish & Presentation criterion: *"Don't lean on AI-generated video to
carry the pitch."* It also asks for footage "as viewed on a Meta Quest device or via XR
Simulator" and real gameplay that honestly represents the app. So:

- **AI clips are the frame, app footage is the picture.** About 40 s of AI clips against about
  2:15 of real Chordless footage, so roughly 75% real.
- **Every human in an AI clip has an emoji face**, like Technickel. That keeps your house style
  and also covers the rule that entries may not "depict any identifiable person other than
  Entrants". No real airline, venue or brand logos in generated clips.
- **Record at least one shot on a real Quest with your own hands** (shot `R-quest`, in the
  closing pitch). The scripted hands in the emulator are perfect; one shot of your real hands
  proves the app works.
- **Captions carry the story during the music, not voiceover.** The performance has only two
  voiceover lines, and both sit in quiet passages. The loud passages have no talking at all.
  Voiceover is on its own track, so a music-only cut is just muting A1.
- **Credits are on screen, not just in the description.** See [Attribution](#attribution).

## The pitch in three lines

The voiceover makes three claims, and everything else supports them:

1. **It's the instrument, not a game about one.** Most music in VR is a rhythm game or a
   mixed-reality overlay that teaches a real guitar you already own. In Chordless your hands
   *play* the instrument: real strings at real fret positions, a bow, ten fingers on a piano.
2. **It runs anywhere you can bring a Quest.** No instrument to carry, no case, no extra seat,
   no noise complaints with headphones in.
3. **It's built on the open web.** IWSDK, Meta's Immersive Web SDK, makes it a WebXR app that
   opens in the Quest browser with no install and no controllers.

## The music

The performance is one continuous play of the *William Tell* finale, about 2:05, with
instruments joining section by section. The scripted performances (`npm run play:*`) cover
bars 243–276 today, which is the galop theme, about 25 s. The rest of the finale gets
arranged later, so the bar-level cut points in the edit plan are final for bars 243–276 and
provisional for everything else.

**Length budget:** the act-1 opening is 30 s and the bow is 20 s, which leaves **2:05 for the
music**. If the arrangement runs longer, drop a repeat from the finale rather than squeezing
the opening.

| Unit at quarter = 152, 2/4 | Length |
| --- | --- |
| 1 beat | 0.3947 s |
| 1 bar | 0.7895 s |
| 4 bars (one phrase) | 3.158 s |
| 8 bars | 6.316 s |

Picture is cut on bar lines: every 8 bars in quiet passages, then every 4, then every 2, then
every bar in the coda, so the editing speeds up as the orchestra grows.

## Shot naming

Same convention as the earlier videos:

- `clips/1-3.mp4`: an AI clip (act-shot)
- `clips/c-2.mp4`: an AI-generated cutaway of the conductor, used during the performance
- `takes/<instrument>-<scene>.mp4`: a screen-captured Chordless performance (scene = the file
  name from `src/scene-list.ts`)
- `audio/vo-1-2.mp3`: a voiceover line
- `audio/stems/<instrument>-<scene>.wav`: that take's audio

**Character sheet** (paste into every Technickel prompt): *TECHNICKEL, an orchestra conductor: a man
whose head is a yellow "cool" sunglasses emoji (😎). He wears a black concert tailcoat, a
white bow tie, white gloves, and holds a slim white conductor's baton.*

---

### **Act 1: The Problem**

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

**Sync note:** The three baton taps are SFX on beats −4, −3 and −2 before the first note, and
the downbeat cuts straight to the first take on the first note, at **0:30**.

---

### **Act 2: The Performance**

**(0:30 – about 2:35), *William Tell* finale, about 2:05, one continuous play**

Each instrument entry gets a cut to that instrument's take and a one-line caption (lower
third). The first few also get a 1–1.5 s conductor cutaway just *before* the entry, with
Technickel cueing that section, so each new layer has a reason to arrive without anyone
talking.

**On-screen from the first note:**

- **Music credit** (top left, 0:30–0:36): *Gioachino Rossini · William Tell Overture, Finale
  (1829) · Public domain*
- **Capture credit** (bottom, 0:30–0:36): *In-app capture. Every note is played and
  synthesized live in Chordless.*
- **Corner bug** (small, top right, for the whole performance): *IN-APP CAPTURE*

**Caption format:** instrument and scene name on line one; the callback line, if any, under it
in italics.

#### The build

Instruments join in this order. The section names are the finale's broad form; map each one
to its bars in `tests/songs/william-tell.js` once the full arrangement exists. Only the galop
theme (bars 243–276) is arranged today.

| Section | Rough share | Playing | Picture | Caption | VO |
| --- | --- | --- | --- | --- | --- |
| Fanfare (the trumpet call that opens the finale) | ~10 s | trumpet alone | `c-1` brass cue, then `trumpet-pirate-ship`, `trumpet-mountaintop` | TRUMPET · Pirate Ship | none |
| Galop theme, quiet (bars 244–259) | ~13 s | + guitar, pp | `guitar-cliffside`, then punched in (zoom 1.6×) on the fretting hand | GUITAR · Cliffside Sunset | **VO-A** |
| Galop theme, loud (bars 260–275) | ~13 s | + cello | 4-bar cuts: `cello-balloon-basket`, `guitar-cliffside`, `trumpet-mountaintop` | CELLO · Hot Air Balloon / *No extra seat required.* | none |
| Middle episodes, quiet | ~25 s | + violin | `c-2` sweep to the violins, then `violin-underwater`, `violin-northern-lights` | VIOLIN · Underwater | **VO-B** |
| Middle episodes, building | ~20 s | + piano, + triangle | 4-bar cuts: `piano-clock-tower`, `triangle-fridge`, `piano-jazz-club`, `cello-lantern-lake` | PIANO · Clock Tower / *Zero movers. Zero stairs.* then TRIANGLE · Inside a Fridge / *Very cool.* | none |
| Galop returns | ~20 s | + drums | `c-3` point at camera, then 2-bar cuts: `drums-living-room` first, then every take so far | DRUMS · Grandma's Living Room / *2:13 a.m. Headphones in. Grandma's still asleep.* | none |
| Quiet before the coda | ~10 s | everyone but the cymbals | **The grid builds**: a 3×3 grid, Technickel conducting in the centre tile (`c-grid`), one instrument tile appearing every 2 bars | none | none |
| Coda | ~14 s | **everything, with the cymbals' first crash** | Full-screen `cymbals-library` on the crash, then a 1-bar montage (the montage takes), cutting back to the grid on each 4-bar phrase downbeat | CYMBALS · Endless Library / *Shhh.* | none |
| Final chord | | everything | `piano-stage`, the Theatre, full screen; `c-4` fist cutoff on the cymbal choke | | |

**VO-A, the uniqueness line (over the quiet galop theme, about 12 s):**
Most music in VR is a rhythm game, or a mixed-reality overlay on a guitar you already own.
Chordless *is* the instrument. Real strings, real frets. Just your hands.

*Worded as a contrast, not "the first ever", so it's a claim nobody can dispute. "Rhythm
game" names the genre without naming any game.*

**VO-B, the tech line (over the first quiet middle episode, about 12 s):**
It's built with Meta's Immersive Web SDK, so it runs right in the Quest browser. No install, no
controllers. Eight instruments, and sixty-one places to play them.

*Fit both lines to quiet passages once the arrangement exists. If a section is shorter than
its line, move the line, don't shorten the music.*

---

### **Act 3: The Bow**

**(about 2:35 – 2:55)**

#### Shot 3-1: Ovation (3 s)

> **Storyboard Prompt:** "A photorealistic 16:9 medium shot of TECHNICKEL on the podium, VR headset pushed up on his head, baton lowered, in a warm spotlight in the gilded concert hall."
>
> **Video Prompt:** "TECHNICKEL turns to the camera and takes a deep, theatrical bow. Golden confetti drifts down through the spotlight."
>
> **Audio:** Applause swell (SFX), fading under the VO.

#### Shot 3-2: The Pitch, Over Real Footage (12 s)

Picture: `R-quest` (your own hands, playing on a real Quest, with its own audio low under the
VO), then `R-scene-flip`, a pinch on **Next scene** cycling quickly through a dozen worlds.
`R-quest` lives here rather than in the performance because a real-hands take can't be
beat-locked to the scripted stems.

**Technickel (VO, warm, unhurried):**
That's Chordless. Not a game about music: an orchestra that fits in a headset, built on the
open web. Practice anywhere you can bring a Quest. No cases. No complaints. Just your hands.

#### Shot 3-3: End Card and Credits (5 s)

Designed in Resolve. **CHORDLESS**, *Built with IWSDK, Meta's Immersive Web SDK, for Meta
Quest*, the GitHub Pages URL, and "Meta VR Start Developer Competition 2026". The credits
block from [Attribution](#attribution) runs in small type underneath.

**Technickel (VO):**
Same time tomorrow. And practice!

**(Fade to black. Optional sting: one broom-handle knock on a ceiling, then silence.)**

---

## Attribution

The same credits go in three places: on screen at the first note (short form, above), on the
end card, and in the YouTube description.

**End card and YouTube description (long form):**

> **Music:** Gioachino Rossini, *William Tell* Overture (*Guillaume Tell*), Finale (1829).
> Public domain.
>
> **Arrangement:** Arranged for Chordless from the full score typeset by Max Wilkinson (2008),
> IMSLP #22579, licensed under Creative Commons Attribution 3.0
> (https://creativecommons.org/licenses/by/3.0/). The parts were transcribed and arranged
> for Chordless's instruments.
>
> **Performance:** All music in this video is in-app capture from Chordless. Every note is
> played and synthesized live by the app; no recordings of the piece are used. Performances
> were recorded in IWSDK's XR emulator with scripted hand motion, and on a Meta Quest.
>
> **Built with:** IWSDK (Meta's Immersive Web SDK), WebXR.
>
> **Video:** Conductor and story scenes are AI-generated. All gameplay footage is real.

Two notes on this:

- **The composition is public domain, but the score edition isn't.** The Wilkinson edition
  that `tests/songs/william-tell.js` is transcribed from is CC BY 3.0, so it needs credit. If
  the full arrangement uses another edition for the rest of the finale, credit that one too.
- **Say how the performances were captured.** The takes are the app really playing, but the
  hands are scripted in the emulator. Saying so keeps "honestly represents the experience"
  safe; calling it plain "live gameplay" invites a judge to wonder.

---

## Recording List

### AI clips (you generate)

| ID | Use | Length to generate |
| --- | --- | --- |
| 1-1 to 1-7, 1-9 | Act 1 | 5–8 s each, trimmed in the edit |
| c-1 to c-4 | Cueing cutaways: brass fist cue, sweep to the violins, point at camera, fist cutoff | 3–4 s each; only 1–1.5 s is used |
| c-grid | Technickel conducting in a neutral 2/4 pattern, for the grid centre tile | 8–10 s. It won't be on tempo, so it gets retimed to 152 bpm in the edit |
| 3-1 | The bow | 5 s |

### Chordless takes (scripted, screen-captured)

Each take is a full `play:*` run of the arrangement, 1920×1080 at 60 fps, opened with
`?scene=<file>`, with the `e2e-banner` hidden. Capture the take's audio in the same recording.
These need a small runner script (instrument × scene loop) that doesn't exist yet. Record
after the full arrangement is done, so every take covers the whole finale.

| Instrument | Takes (scene file) |
| --- | --- |
| trumpet | `pirate-ship`, `mountaintop` |
| guitar | `cliffside`, `train-roof` |
| cello | `balloon-basket`, `lantern-lake` |
| violin | `underwater`, `northern-lights` |
| piano | `clock-tower`, `jazz-club`, `stage` |
| triangle | `fridge` |
| drums | `living-room`, `neon-arcade` |
| cymbals | `library`, `bowling-alley` |
| montage (one bar each, 12 used) | `piano-space-station`, `drums-volcano-rim`, `drums-pinball`, `cello-bouncy-castle`, `violin-snow-globe`, `guitar-lava-lamp`, `trumpet-giant-turtle`, `piano-upside-down-room`, `guitar-stadium`, `trumpet-desert-canyon`, `violin-ice-cave`, `drums-record-player`. Spares: `drive-in`, `paper-world`, `floating-islands`, `car-wash` |

### Real captures (you, on the headset)

| ID | What |
| --- | --- |
| R-quest | You playing the guitar on a real Quest (headset recording or cast), about 15 s, with its own audio |
| R-scene-flip | Pinching **Next scene** a dozen times with an instrument in hand |

### Voiceover

| ID | Line starts with | Placement |
| --- | --- | --- |
| vo-1-2 | "Good evening!" | 0:03 |
| vo-1-3 to vo-1-6 | "Their instrument." … | 0:09, one per gag |
| vo-1-7 | "So I left the instruments at home." | 0:21.5 |
| vo-1-8 | "Meet Chordless." | 0:25.3 |
| vo-a | "Most music in VR is a rhythm game…" | quiet galop theme |
| vo-b | "It's built with Meta's Immersive Web SDK…" | first quiet middle episode |
| vo-3-2 | "That's Chordless." | the bow + 3.5 s |
| vo-3-3 | "Same time tomorrow." | the end card |
