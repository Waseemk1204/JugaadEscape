// Jugaad Escape: the host page.
//
// A title screen, a renderer, the audio context and the input handling, lent
// to the game (src/game.js) for as long as a shift lasts, and a way back to
// the title when it ends.

import * as THREE from "three";
import { JugaadGame } from "./game.js";
import { GameAudio } from "./audio.js";
import { Input, Look } from "./input.js";
import { TitleScene } from "./titlescene.js";
import { itemIcon } from "./three/items.js";
import { ITEMS } from "../shared/jugaad.js";

const $ = (selector) => document.querySelector(selector);

const canvas = $("#game-canvas");
const title = $("#screen-title");
const touchControls = $("#touch-controls");

// The game sizes the renderer and sets its pixel ratio itself.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setClearColor(0x000000);

// Phones drop the GPU context when memory runs short (often after being
// backgrounded). Three.js rebuilds on a restore; if none comes, say so
// rather than leaving a black screen.
let contextTimer = 0;
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  clearTimeout(contextTimer);
  contextTimer = setTimeout(() => document.querySelector("#gpu-lost")?.classList.remove("hidden"), 3000);
});
canvas.addEventListener("webglcontextrestored", () => {
  clearTimeout(contextTimer);
  document.querySelector("#gpu-lost")?.classList.add("hidden");
});

const audio = new GameAudio();

const input = new Input({
  joystick: $("#joystick"),
  knob: $("#joy-knob"),
  interactButton: $("#interact-button"),
  runButton: $("#run-button"),
  crouchButton: $("#crouch-button"),
  isTyping: () => false,
});

// Mouse look (pointer lock) on a laptop, drag to look on a phone.
const look = new Look({ target: canvas, onLook: () => {} });

const game = new JugaadGame({ renderer, canvas, audio, input, look, onQuit: showTitle });

// Behind the landing page: the branch itself, drifting past.
const backdrop = new TitleScene(renderer, $("#title-fade"));

// The toolkit strip: the real item models, rendered to icons.
const KIT = ["visiting_card", "hairpin", "umbrella", "achaar", "can", "coconut_oil", "fire_extinguisher", "key_bunch"];
function fillKit() {
  const grid = $("#title-kit");
  if (grid.childElementCount) return;
  for (const id of KIT) {
    const url = itemIcon(id);
    if (!url) continue;
    const tile = document.createElement("div");
    tile.className = "title-kit-item";
    tile.title = ITEMS[id].note;
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    const name = document.createElement("span");
    name.textContent = ITEMS[id].name.replace(/^(Empty |Colleague's |Sir's )/, "");
    tile.append(img, name);
    grid.append(tile);
  }
}

function showTitle() {
  title.classList.remove("hidden");
  touchControls.classList.add("hidden");
  showBest();
  fillKit();
  backdrop.start();
  // Focus stays behind on the game's (now hidden) buttons otherwise, and
  // Enter would do nothing.
  $("#title-start").focus({ preventScroll: true });
}

// Phones play in landscape only. Held upright, a card asks you to turn the
// phone and the game stands still underneath it.
const portraitPhone = matchMedia("(hover: none) and (pointer: coarse) and (orientation: portrait)");
const isPhone = matchMedia("(hover: none) and (pointer: coarse)");
function syncOrientation() {
  game.blocked = portraitPhone.matches;
}
portraitPhone.addEventListener?.("change", syncOrientation);
syncOrientation();

// On a phone, starting the shift also goes full screen and, where the
// browser allows it (Android), locks the screen sideways.
function goLandscape() {
  if (!isPhone.matches) return;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request || fullscreenElement()) {
    screen.orientation?.lock?.("landscape").catch(() => {});
    return;
  }
  Promise.resolve(request.call(root, { navigationUI: "hide" }))
    .then(() => screen.orientation?.lock?.("landscape"))
    .catch(() => {});
}

function play() {
  // One shift at a time: Enter on a focused Start button would otherwise fire
  // both the shortcut below and the button's own click.
  if (game.active) return;
  // Audio can only start from a click or a tap.
  audio.unlock();
  goLandscape();
  backdrop.stop();
  title.classList.add("hidden");
  touchControls.classList.remove("hidden");
  game.start();
}

function showBest() {
  const el = $("#title-best");
  try {
    const best = Number(localStorage.getItem("jugaad.escape.best"));
    if (best > 0) {
      el.textContent = `Fastest escape ${String(Math.floor(best / 60)).padStart(2, "0")}:${String(best % 60).padStart(2, "0")}`;
      el.classList.remove("hidden");
    }
  } catch {
    // Storage can be unavailable (private windows); the title works without it.
  }
}

// Full screen, from the landing page or the in-game HUD. Safari on iPhone
// cannot full-screen a page (only video), so the buttons hide themselves
// there; the web app manifest covers it once the game is added to the
// home screen.
const root = document.documentElement;
const fullscreenSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen() {
  if (fullscreenElement()) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    return;
  }
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  Promise.resolve(request?.call(root, { navigationUI: "hide" })).catch(() => {});
}
for (const button of document.querySelectorAll(".js-fullscreen")) {
  button.classList.toggle("unsupported", !fullscreenSupported);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFullscreen();
  });
}
const syncFullscreen = () => {
  const on = Boolean(fullscreenElement());
  for (const button of document.querySelectorAll(".js-fullscreen")) button.setAttribute("aria-pressed", String(on));
};
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);

$("#title-start").addEventListener("click", play);
window.addEventListener("keydown", (event) => {
  // A focused button handles its own Enter.
  if (event.target?.closest?.("button")) return;
  if (event.key === "Enter" && !game.active && !title.classList.contains("hidden")) play();
});

showTitle();

// For poking at a running game from the console: add ?debug to the URL.
if (new URLSearchParams(location.search).has("debug")) {
  window.__jugaad = { game, backdrop, renderer, audio, input, look };
}
