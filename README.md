# Escape Room

A solo first-person horror run. You are lost in an endless yellow maze. Three
fuse boxes are out there; pull all three and the way out opens — and the thing
walking the maze with you stops pretending not to know where you are.

This is the solo mode of Killbook 2D, split out into its own project so it can
be developed on its own. The game files are straight copies of that mode; the
only new code is the host page (`index.html`, `src/main.js`, `src/title.css`)
and a small static server. Nothing here depends on Killbook, and Killbook does
not depend on this.

## Run it

```
npm start
```

Then open http://localhost:5174. There is nothing to install: Three.js is
vendored in `assets/vendor/`, and the server has no dependencies. (It needs a
server rather than opening `index.html` directly because browsers will not load
ES modules from `file://`.) Any static server works too, e.g.
`npx serve .`.

```
npm test      # the monster's AI and the maze
npm run check # syntax check every file
```

## What is where

```
index.html            title screen, the game's HUD and overlays, touch controls
src/main.js           the host: renderer, audio, input, title screen
src/solo.js           the game: movement, stamina, fuses, deaths, endings
src/soloaudio.js      its sound: the monster's 3D voice, fuse hums, the scream
src/audio.js          the shared synth (tones, noise, footsteps) it builds on
src/input.js          keyboard, joystick, touch buttons, mouse look
src/three/backrooms.js  the endless maze, built in chunks around you
src/three/soloprops.js  fuse boxes and the exit
src/three/stalker.js  the monster in the world; src/three/monster.js its body
src/three/escape.js   the ending when you get out: the run into the city
src/three/wake.js     the ending when you run out of lives: the dark room
shared/lobby.js       the maze layout (pure, testable in Node)
shared/stalker-ai.js  the monster's brain (pure, testable in Node)
assets/audio/scream.m4a  the one recorded sound
src/styles.css        styles, copied whole from Killbook 2D (only the solo,
                      touch-control and base rules are used here; trim freely)
```

Tuning lives near the top of the files: speeds, chase and relocation times,
stamina, lives and the fuse steps in `src/solo.js` and
`shared/stalker-ai.js`; the ending beats in `ESCAPE` and `WAKE`.
