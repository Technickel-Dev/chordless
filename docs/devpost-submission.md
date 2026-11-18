# Chordless

## What it does

Chordless is a symphony of virtual instruments you play in VR with your own hands. We're not talking your typical VR "playing" either, we have full high fidelity instruments. Every note is synthesized live in the browser, with no audio files, and
because it's a WebXR app it runs right in your headset's browser with nothing to install.

Got stage fright? Chordless puts you wherever you feel most creative, whether that's headlining a
stadium or your grandma's living room.

And when the song goes sideways, channel your inner rock legend and smash your instrument to bits.
It's the most expensive move in rock and roll, now completely free.

## Inspiration

The idea started with a simple desire: I wanted to play an instrument in real life. Then reality
set in. Other than skill issues, Instruments are too fragile to check and too big for the overhead bin. When you practice,
the whole house practices. They're expensive, and for many people out of reach. And hauling one to
a jam session? Uphill both ways.

You know what doesn't have any of those problems? An air guitar.

From there it became a question of how fun that would actually be to play (or, honestly, how funny
it would be to watch someone else play it). Then I realized how far VR hand tracking has come, and
I wanted to see if I could do more than wave my hands around. I wanted to go beyond the mixed
reality we typically see in VR and build instruments you can actually play.

Building on web technology only pushed that further. Chordless runs in a browser, so there's
nothing to install and nothing standing between someone and their first note. That makes it
available to so many more people.

## What I learned

I've built in XR before, but never with tooling this strong. This was my first time using Meta's
Immersive Web SDK, and my first time building XR agentically. I learned where hand
tracking shines and where it falls apart, how to synthesize instruments from scratch, and how real
instruments actually work, from bow to brass.

The biggest lesson was automated testing. Getting the controls and sound to *feel* right took endless
tweaking, so I built tests where emulated hands play the *William Tell* finale on every instrument
and record the audio. This lead to my delightful video presentation!

## Accomplishments that I'm proud of

I have a graveyard of unfinished projects, and more than a few of them are VR ideas that never made
it past a prototype. Chordless is my first significant VR app, and it didn't just make it out of the
graveyard. It's a proper living? breathing creation. In about three weeks and hundreds of commits, it grew from a single air guitar into a dozen
instruments that a musician would recognize by how they're played, not just how they sound.

## How I built it

- **IWSDK (Meta's Immersive Web SDK) and WebXR**: an ECS (entity-component system) app, one system per instrument, running in the browser
- **Web Audio synthesis**: Karplus–Strong plucked strings with a modelled acoustic body, bowed strings, piano with dampers, brass partials, and pre-rendered cymbal and drum articulations rendered off the main thread
- **Smash physics**: meshes are pre-fractured into chunks and dented where they strike things
- **Testing**: Many many IWSDK browser tests, unit tests (Vitest), and scripted performances of the *William Tell* finale on each instrument
- **Hosting**: GitHub Pages, redeployed on every push to `main` using Github Actions
- **Video**: real captures from the app, cut together by a script with FFMpeg

Chordless makes use of a number of Meta VR capabilities:

- **Hand tracking**: all 25 joints of both hands, read every frame. Fingertip pads fret, flat fingers barre, a One Euro filter smooths jitter, and notes hold through brief tracking dropouts
- **Pinch gestures**: pinch to pick from the menu, to blow the brass, and with both hands to fit the guitar to your body
- **Horizon UI kit**: icon-only spatial panels in Horizon OS's own design language, with point-and-pinch selection and pictogram "how to play" strips
- **IWER, IWSDK's XR emulator**: emulated headset and hands in the desktop browser, which is what let the automated tests play every instrument

## Challenges I ran into

The biggest challenge was making the instruments feel solid when there's nothing physical to hold.
No string pushes back on your fingertip and no drum head stops your stick, so the visuals had to do
that job: fingertip shadows that show how close you are to a string, strings that glow as they ring,
and sticks that stop on a drum head instead of passing through it. This had to be done for every instrument, each with their own challenges.

Hand tracking itself was a constant fight, too. Fingertips jitter and hands drop out mid-strum, and
a note that cuts out mid-chord ruins the feel, so a lot of work went into smoothing out the noise
and holding notes through brief dropouts. Don't get me started on the monstrously unnatural hand positions the testing tried to take. I ended up having to design a whole joint constraint system to make the hand usage realistic.

Then there was not having a VR headset. Apart from one hour on a friend's device, every instrument
was built and tuned in the emulator. That's a big part of why the automated tests mattered so much:
the testing would have been impossible without the automation to check things worked as expected.

Finally, there are no audio samples anywhere in Chordless. Getting synthesized strings and brass to
sound like real instruments instead of cheap knockoffs which took more listening than I'd like to admit.

## What's next for Chordless

This is just the opening act for Chordless. Here are a few ideas that would take it to the next level:

- **Multiplayer**: a band jam session or a full orchestra across headsets. It could even be a classroom of students
- **Mixed reality**: play in your own room alongside an instrument you already own, for even more realism. This is more aligned with the typical VR experience but is important for the more hands on musicians 
- **Songs to learn and a practice mode**, so there's always a reason to come back
- **Gamification**, in the spirit of a rhythm game
- **Recording, editing and sharing** to create your performances
- **Custom scenes** for a more tailored experience in your own environments
- **More instruments**. There are so many more I could build
- **A Horizon Store / PWA release** Another fantastic distribution channel
- **Refining the experience**: I want to get a real headset and make sure everything feels right. For example, how each instrument sits in your hands still needs a lot of work. I had less than an hour with a real headset so as much as I was able to pack changes in, I missed a lot of the real quality changes
