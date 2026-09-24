// Escape Room, on its own.
//
// Everything the game does lives in solo.js and the modules it imports; they
// are unchanged copies of the solo mode from Killbook 2D. In Killbook the host
// page lent the solo run a renderer, the audio context and the input
// handling. This file is that host, and nothing more: a title screen, the
// three things the run borrows, and a way back to the title when it ends.

import * as THREE from "three";
import { SoloGame } from "./solo.js";
import { GameAudio } from "./audio.js";
import { Input, Look } from "./input.js";

const $ = (selector) => document.querySelector(selector);

const canvas = $("#game-canvas");
const title = $("#screen-title");
const touchControls = $("#touch-controls");

// The solo run sizes the renderer and sets its pixel ratio itself.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setClearColor(0x000000);

const audio = new GameAudio();

// One joystick and one set of action buttons, for phones. The run swaps in
// its own jump and torch handlers while it is going.
const input = new Input({
  joystick: $("#joystick"),
  knob: $("#joy-knob"),
  interactButton: $("#interact-button"),
  runButton: $("#run-button"),
  jumpButton: $("#jump-button"),
  crouchButton: $("#crouch-button"),
  isTyping: () => false,
  onJump: () => {},
  onToggleTorch: () => {},
});

// Mouse look (pointer lock) on a laptop, drag to look on a phone. The run
// installs its own look handler too.
const look = new Look({ target: canvas, onLook: () => {} });

const solo = new SoloGame({
  renderer,
  canvas,
  audio,
  input,
  look,
  onQuit: showTitle,
});

function showTitle() {
  title.classList.remove("hidden");
  touchControls.classList.add("hidden");
  showBest();
}

function play() {
  // Audio can only start from a click or a tap.
  audio.unlock();
  title.classList.add("hidden");
  touchControls.classList.remove("hidden");
  solo.start();
}

function showBest() {
  const el = $("#title-best");
  try {
    const best = Number(localStorage.getItem("killbook.solo.best"));
    if (best > 0) {
      el.textContent = `Best escape ${String(Math.floor(best / 60)).padStart(2, "0")}:${String(best % 60).padStart(2, "0")}`;
      el.classList.remove("hidden");
    }
  } catch {
    // Storage can be unavailable (private windows); the title works without it.
  }
}

$("#title-start").addEventListener("click", play);
window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !solo.active) play();
});

// Fetch the scream now rather than on the first death, so it is ready when
// it is needed.
solo.sound.loadScream();
showTitle();

// For poking at a running game from the console: add ?debug to the URL.
if (new URLSearchParams(location.search).has("debug")) {
  window.__escape = { solo, renderer, audio, input, look };
}
