<p align="center"><img src="assets/icon.svg" width="120" alt="Jugaad Escape logo: a padlock sprung open with a bobby pin" /></p>

# Jugaad Escape

> *Jugaad is that very Indian "kuch na kuch kar lenge" — a rubber band on the
> remote, a brick holding the door, a scooter that somehow still starts.*

A comic first-person stealth game. It is 6 PM at Bharatiya Jugaad Bank. The
branch manager, Motu Sir, has pulled the shutter down, padlocked the
collapsible gate, bolted the wooden doors and announced that nobody goes home
until he says so. Get through all three doors with whatever the office has
lying around — without him catching you.

## How it plays

- **Your desk is safe.** Sitting there you are just another clerk working late.
- **Sir has a routine.** He watches the floor from his glass cabin (mostly
  staring at his monitor, now and then glancing up). A full minute after he
  sits back down, he gets up to walk a round past your desk to the front
  doors. Every other time he goes to the loo instead — his cabin is empty,
  and his key bunch is on his desk.
- **Noise brings him out.** "Kaun hai?!" — then 10–15 seconds before he is on
  his feet. Be back in your chair. On the way back from anything he checks
  your desk; an empty chair starts a search.
- **Getting seen fills a meter**, slowly while he is busy, fast when he is
  looking for you. Crouch behind desks to break it. If it fills: THAPPAD, back
  to your desk, and whatever you were holding goes into his almirah. Five
  slaps and it is overtime till midnight.
- **Forget the perfect tool.** Items have properties, not jobs, and every lock
  step can be done at least two ways (the tests hold every seed to this):

| Door | Step | Some of the ways |
|---|---|---|
| Wooden doors | Tower bolt (high up) | umbrella from the coat stand, phool jhaadu from the washroom |
| | Latch | visiting card (bends after one go), colleague's ID card, old ATM card, steel ruler, butter knife, Sir's keys |
| Collapsible gate | Padlock | hairpin + paperclip lockpick, safety-pin pick, cola can + scissors shim, spare key from the key box (code on a sticky note), Sir's keys, fire extinguisher (very loud) |
| | Oil the track (optional) | nariyal tel, petroleum jelly, a tiffin of achaar — or slide it dry and screech |
| Shutter | Two padlocks | the same picks / shim / keys / extinguisher |
| | Grease + heave up | oil it, or just heave — he *will* hear — then crouch and crawl under |

- **Decoys:** print 50 copies on the photocopier, switch on the note counter,
  set an alarm on your phone and leave it somewhere, flick an eraser with a
  ruler-and-rubber-band gulel, or ring his extension from the enquiry desk to
  keep him stuck on the phone.
- **Score:** the end card lists every jugaad you used and gives a Jugaad Score
  and a title — improvised answers beat keys, keys beat brute force.

Controls: WASD move · Shift run · C crouch · hold E search / use · 1–5 pick
item · F use item · G combine · Q drop. On a phone: joystick, drag to look,
and the Use / Crouch / Run / Item / Combine buttons.

### On a phone

Phones play in landscape only — held upright, a card asks you to turn the
phone and the game pauses. Starting the shift goes full screen and, on
Android, locks the screen sideways (iPhone Safari cannot lock orientation or
full-screen a page; add it to the Home Screen for a full-screen app). There
is a full-screen button on the landing page and in the game's top bar.

## Run it

```
npm start
```

Then open http://localhost:5174. There is nothing to install: Three.js is
vendored in `assets/vendor/`, and the server has no dependencies.

```
npm test      # the floor plan, Motu Sir's routine, and the jugaad rules
npm run check # syntax check every file
```

## Deploy (Vercel)

It is a static site with no build step: import the repo in Vercel, leave the
framework as **Other**, no build command, output directory the project root.
`.vercelignore` keeps the tests and the local server out of the deploy.

## What is where

```
index.html              landing page, HUD, cutscene frame, touch controls
src/titlescene.js       the landing page's live 3D backdrop
src/cutscenes.js        the opening lock-in and the record-room lock-up
src/three/items.js      the 3D model of every jugaad tool (hand, bag, floor)
assets/icon.svg         the logo; icon-*.png and og.jpg are renders of it
src/main.js             the host: renderer, audio, input, title screen
src/game.js             the game: movement, interaction, inventory, doors,
                        decoys, the slap, the HUD, endings
src/bankaudio.js        fans, hum, Sir's footsteps and mutterings, decoy sounds
src/audio.js            the shared synth (tones, noise, footsteps)
src/input.js            keyboard, joystick, touch buttons, mouse look
src/three/bank.js       the branch in 3D, built from the floor plan
src/three/boss.js       Motu Sir's model and poses
src/three/doors.js      the wooden doors, gate and shutter, animated
src/three/escape.js     the ending: out under the shutter into the street
shared/bank-map.js      the floor plan, collision, sight lines, path finding
shared/boss-ai.js       Sir's routine, eyes and ears (pure, testable)
shared/jugaad.js        items, containers, door steps, recipes, scoring
src/bank.css            the game's HUD styles (on top of styles.css)
```

Tuning lives at the top of the files: Sir's timings and eyesight in `BOSS`
(`shared/boss-ai.js`), noise levels and hold times per way in `DOORS`
(`shared/jugaad.js`), where things can be hidden in `PLACEMENT`, and player
speeds in `src/game.js`.
