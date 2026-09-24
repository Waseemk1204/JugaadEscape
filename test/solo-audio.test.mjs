// The solo game calls into its sound module from inside the frame loop, where a
// missing method throws and freezes the whole run. This catches that in Node,
// without a browser: every `this.sound.x(...)` in solo.js must exist on SoloAudio.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SoloAudio } from "../src/soloaudio.js";

test("every sound the solo game plays exists", async () => {
  const source = await readFile(new URL("../src/solo.js", import.meta.url), "utf8");
  const called = new Set([...source.matchAll(/this\.sound\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  assert.ok(called.size > 5, "found the sound calls");
  const missing = [...called].filter((name) => typeof SoloAudio.prototype[name] !== "function");
  assert.deepEqual(missing, []);
});
