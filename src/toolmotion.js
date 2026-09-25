// How each tool moves while you work with it.
//
// Holding E on a lock used to just jiggle whatever was in your hand. Now each
// kind of jugaad has its own little choreography, played out over the hold,
// and aimed at the real spot on the real door: the umbrella goes up to the
// tower bolt and yanks it across, the card slides edge-on into the latch
// gap, the hairpin rakes inside the padlock, the extinguisher swings.
//
// Everything here is in the first-person camera's space (metres; -z is
// straight ahead). `target` is where the work is happening, already pulled
// in along its sight line to arm's length, so a tool placed there sits
// exactly over the thing on screen. `p` runs 0 → 1 over the hold.

// Where on each door step the hands actually go, in metres off the floor.
export const WORK_HEIGHT = {
  bolt: 2.45, // right at the top of the door
  latch: 1.05,
  padlock: 1.1,
  oil: 0.05, // the gate's floor track
  lockLeft: 0.12, // the shutter's floor rings
  lockRight: 0.12,
  grease: 0.9,
};

// What kind of motion an action is.
export function motionKind(target, way) {
  switch (target.kind) {
    case "step": {
      const tag = way?.tag;
      if (tag === "hook") return "hook";
      if (tag === "card") return "card";
      if (tag === "blade") return "blade";
      if (tag === "masterkey" || tag === "gatekey") return "key";
      if (tag === "picks" || tag === "crudepick") return "picks";
      if (tag === "shim") return "shim";
      if (tag === "smash") return "smash";
      if (tag === "oil") return "oil";
      return "hands";
    }
    case "door":
      return target.door.id === "shutter" ? "heave" : target.door.id === "gate" ? "slide" : "push";
    case "container":
      return "rummage";
    case "decoy":
      return "press";
    case "floor":
      return "pickup";
    default:
      return null;
  }
}

// Kinds where the tool itself does the work; for the rest it drops out of
// view while your hands are busy.
export const TOOL_KINDS = new Set(["hook", "card", "blade", "key", "picks", "shim", "smash", "oil"]);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
// 0 before a, 1 after b, eased between.
const phase = (p, a, b) => smooth((p - a) / (b - a));
const mix = (a, b, k) => a + (b - a) * k;

// The tool's pose for this moment of the action. Returns position and
// rotation (both smoothed by the caller), plus a jitter that is added on top
// unsmoothed so fast motions stay crisp.
export function toolPose(kind, p, now, rest, target) {
  // Move from rest to the work spot (plus an offset) by k.
  const at = (k, ox = 0, oy = 0, oz = 0) => [
    mix(rest[0], target.x + ox, k),
    mix(rest[1], target.y + oy, k),
    mix(rest[2], target.z + oz, k),
  ];
  const none = [0, 0, 0];

  switch (kind) {
    // Up to the top of the door, crook over the bolt, a few tugs to catch it,
    // then one hard pull sideways — the bolt slides with it.
    case "hook": {
      const reach = phase(p, 0, 0.3);
      const pull = phase(p, 0.78, 1);
      const tug = p > 0.32 && p < 0.78 ? Math.sin(now * 15) * 0.012 : 0;
      return {
        pos: at(reach, 0.035 + pull * 0.08, -0.12 - pull * 0.02, 0.03),
        rot: [-0.2 * reach, 0.1 * reach, -0.95 * reach - pull * 0.3],
        jitter: [tug, Math.abs(tug) * 0.6, 0],
      };
    }

    // Edge-on into the gap at the latch, worked up and down against the
    // spring, then a flick as it gives.
    case "card": {
      const reach = phase(p, 0, 0.25);
      const insert = phase(p, 0.25, 0.42);
      const work = p > 0.42 && p < 0.9 ? Math.sin(now * 9) * 0.02 : 0;
      const flick = phase(p, 0.9, 1);
      return {
        pos: at(reach, -0.01, 0.01 - flick * 0.04, 0.05 - insert * 0.07),
        rot: [0.15 * reach, 1.8 * reach, 0.12 * reach - flick * 0.5],
        jitter: [0, work, 0],
      };
    }

    // A ruler or a knife: wedged in and levered — rougher than a card.
    case "blade": {
      const reach = phase(p, 0, 0.25);
      const insert = phase(p, 0.25, 0.4);
      const lever = p > 0.4 && p < 0.92 ? Math.sin(now * 13) : 0;
      const give = phase(p, 0.92, 1);
      return {
        pos: at(reach, 0, 0.005, 0.05 - insert * 0.08),
        rot: [0.1 * reach, 1.7 * reach + lever * 0.15, lever * 0.2 - give * 0.6],
        jitter: [lever * 0.006, 0, 0],
      };
    }

    // Into the keyhole, a push, a quarter turn.
    case "key": {
      const reach = phase(p, 0, 0.3);
      const insert = phase(p, 0.3, 0.5);
      const turn = phase(p, 0.6, 0.9);
      return {
        pos: at(reach, 0.02, -0.02, 0.05 - insert * 0.06),
        rot: [0, 0.95 * reach, -turn * 1.45],
        jitter: none,
      };
    }

    // In under the shackle, then fast raking with tension slowly building,
    // and the final twist when the pins set.
    case "picks": {
      const reach = phase(p, 0, 0.22);
      const raking = p > 0.22 && p < 0.9;
      const tension = phase(p, 0.22, 0.9) * 0.22;
      const twist = phase(p, 0.9, 1) * 0.7;
      return {
        pos: at(reach, 0.03, -0.015, 0.035),
        rot: [0.1 * reach, 0.7 * reach, -tension - twist],
        jitter: raking ? [Math.sin(now * 33) * 0.006, Math.sin(now * 27) * 0.004, Math.sin(now * 41) * 0.003] : none,
      };
    }

    // Down beside the shackle, pushed home, twisted.
    case "shim": {
      const reach = phase(p, 0, 0.3);
      const push = phase(p, 0.35, 0.8);
      const twist = phase(p, 0.85, 1);
      return {
        pos: at(reach, 0.01, 0.06 - push * 0.07, 0.03),
        rot: [0, 0.8 * reach, twist * 0.9],
        jitter: p > 0.35 && p < 0.8 ? [0, Math.sin(now * 20) * 0.003, 0] : none,
      };
    }

    // Wind up, swing, clang — twice.
    case "smash": {
      const reach = phase(p, 0, 0.12);
      const cycle = (p * 2) % 1;
      let back;
      if (cycle < 0.6) back = smooth(cycle / 0.6);
      else back = 1 - smooth((cycle - 0.6) / 0.12);
      return {
        pos: at(reach, 0.06, 0.1 * back - 0.02, 0.22 * back + 0.02),
        rot: [0.9 * back, -0.2 * back, 0.5 * back],
        jitter: none,
        impactCycle: cycle >= 0.72 ? Math.floor(p * 2) : -1,
      };
    }

    // Tip it over and sweep it along the track.
    case "oil": {
      const reach = phase(p, 0, 0.2);
      const tilt = phase(p, 0.12, 0.3) * (1 - phase(p, 0.9, 1));
      const sweep = Math.sin(clamp01((p - 0.2) / 0.7) * Math.PI * 2) * 0.11;
      return {
        pos: at(reach, sweep * reach, 0.06, 0.02),
        rot: [0, 0.3 * reach, 1.7 * tilt],
        jitter: tilt > 0.5 ? [0, Math.sin(now * 25) * 0.002, 0] : none,
      };
    }

    default:
      // Hands busy: the tool drops out of sight.
      return { pos: [rest[0], rest[1] - 0.55, rest[2]], rot: [0.4, 0, 0], jitter: none, lower: true };
  }
}

// What your body does: a lean into a door, a heave, a rummage. Offsets for
// the camera, in metres and radians.
export function bodyMotion(kind, p, now) {
  const swell = Math.sin(clamp01(p) * Math.PI);
  switch (kind) {
    case "push":
      return { forward: 0.1 * swell, up: 0, pitch: 0, roll: 0 };
    case "slide":
      return { forward: 0.04 * swell, up: 0, pitch: 0, roll: -0.04 * swell, side: 0.12 * swell };
    case "heave":
      // Down for the grip, then up with everything you have.
      return { forward: 0.05 * swell, up: p < 0.35 ? -0.25 * phase(p, 0, 0.35) : -0.25 + 0.45 * phase(p, 0.35, 1), pitch: 0.15 * phase(p, 0.35, 1), roll: 0 };
    case "rummage":
      return { forward: 0.06 * swell, up: -0.08 * swell + Math.sin(now * 17) * 0.006 * swell, pitch: -0.12 * swell, roll: Math.sin(now * 9) * 0.01 * swell };
    case "press":
    case "pickup":
      return { forward: 0.05 * swell, up: -0.05 * swell, pitch: -0.08 * swell, roll: 0 };
    case "smash":
      return { forward: 0.03 * swell, up: 0, pitch: 0, roll: 0 };
    default:
      return null;
  }
}
