// The behaviour of the thing that shares the Lobby with you, with no rendering
// attached — so it can be tested in Node rather than only felt in a dark room.
//
// Two rules shape all of this:
//
//   1. It must be *seen* far more often than it is dangerous. A monster you
//      only ever meet at the moment it kills you is a trap, not a monster. It
//      wanders near you on purpose, in plain sight, minding its own business.
//   2. Being noticed has to be something you can watch happen and react to. It
//      turns, it stares, and only then does it come. And if you break away for
//      long enough, it genuinely gives up — no rubber-banding, no second wind.

import { TILE, PLAYER_RADIUS } from "./lobby.js";

const M = 32; // map pixels per metre

export const STALKER_SPEED = {
  WANDER: 74,
  SEARCH: 116,
  HUNT: 178, // the player's sprint: you can keep your distance, not gain it
  // Once the last fuse is pulled it stops pretending: 10% faster than its
  // chase speed before (178), and the only chase with no time limit.
  FINAL: 196,
};

export const RANGE = {
  // How far it can see — but only inside its cone, and only with a clear line.
  SIGHT: 20 * M,
  // Close enough that facing no longer matters. This is the "too close" rule.
  PROXIMITY: 5 * M,
  HEAR_WALK: 6 * M,
  HEAR_RUN: 14 * M,
  CATCH: 30,
  // Where the audio and the screen start reacting to it.
  DREAD: 18 * M,
  // While wandering it stays loosely in this band around the player.
  //
  // These have to sit *inside* the fog, or the whole design fails silently:
  // the player can only see about 22m, so a monster that patrols at 14–42m is
  // invisible almost all the time and the mode turns back into an empty maze
  // with a noise in it. The band is now well within sight, so wandering
  // genuinely means crossing corridors you are looking down.
  LEASH_MIN: 6 * M,
  LEASH_MAX: 20 * M,
};

export const TIMING = {
  // It turns and stares before it charges. This is the player's only warning,
  // and it has to be long enough to read the situation, find which way is out
  // and start moving — not just long enough to see that something happened.
  NOTICE_S: 1.7,
  // Two ways out of a chase, and either one is enough:
  //
  // Survive it. Keep ahead of it for this long and it gives up, even if it can
  // still see you plainly the whole time. A chase that only ends when you find
  // a corner to break line of sight is a chase you usually lose in a maze made
  // of long bays; this makes staying alive the thing that counts.
  CHASE_S: 10,
  // Or get out of its sight. No line of sight to you for this long and it
  // gives up — hearing does not reset this clock, so sprinting round a corner
  // still counts as getting away.
  OUT_OF_SIGHT_S: 5,
  // Once it cannot see you it stops chasing where you are and heads for where
  // it last saw you.
  SEARCH_AFTER_S: 1,
  // And afterwards it cannot notice you again for this long, so getting away
  // really does buy you safety rather than a one-second reprieve.
  BLIND_S: 5,
  // How often it picks a new heading while wandering. Every one of these is a
  // roll of the dice on whether it happens to look your way.
  TURN_MIN_S: 1.8,
  TURN_MAX_S: 4.5,
};

// Half-angle of its vision cone. Narrower than a person's, deliberately: it
// has to be looking fairly squarely at you to pick you out, which is what
// makes crossing behind it survivable and keeps the encounters something you
// walk into rather than something that happens to you.
const CONE = 0.5;

// Close enough to meet within a few seconds of walking, far enough that it is
// never simply standing there when it appears.
const MIN_SPAWN = 15 * M;
const MAX_SPAWN = 26 * M;
// After a death, though, it goes right out past the fog: waking up with it
// already in the room would make dying feel like a loop rather than a reset.
const MIN_BANISH = 30 * M;
const MAX_BANISH = 50 * M;

export class StalkerBrain {
  constructor(level, random = Math.random) {
    this.level = level;
    this.random = random;
    this.reset();
  }

  reset() {
    this.active = false;
    this.state = "wander";
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.stateFor = 0;
    this.chaseFor = 0; // how long this chase has been going
    // How long a chase lasts before it gives up. The solo run raises this
    // with every fuse pulled.
    this.chaseLimit = TIMING.CHASE_S;
    this.unseenFor = 0; // how long since it last had line of sight to you
    this.blindFor = 0;
    this.turnIn = 0;
    this.target = null; // where it is walking to
    this.final = false; // the power is on and it is done wandering
  }

  spawn(px, py, min = MIN_SPAWN, max = MAX_SPAWN) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance = min + this.random() * (max - min);
      const x = px + Math.cos(angle) * distance;
      const y = py + Math.sin(angle) * distance;
      if (this.level.isBlocked(x, y, PLAYER_RADIUS)) continue;
      if (this.level.hasLineOfSight(x, y, px, py)) continue;
      this.reset();
      this.x = x;
      this.y = y;
      this.angle = this.random() * Math.PI * 2;
      this.active = true;
      return true;
    }
    return false;
  }

  // Used after the player dies and wakes somewhere else: it has to find them
  // again from scratch, rather than being wherever the body fell.
  banish(px, py, blindFor = 6) {
    const placed = this.spawn(px, py, MIN_BANISH, MAX_BANISH);
    this.blindFor = blindFor;
    return placed;
  }

  distanceTo(px, py) {
    return Math.hypot(px - this.x, py - this.y);
  }

  // Is the player inside its vision cone?
  facingToward(px, py) {
    const bearing = Math.atan2(py - this.y, px - this.x);
    const delta = Math.abs(((bearing - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return delta < CONE;
  }

  // What, if anything, gives the player away this frame.
  //
  // The order matters: proximity and sound work regardless of where it is
  // looking, sight does not. That is the whole stealth game — stay out of its
  // cone, stay quiet, and it walks straight past you.
  sense(player) {
    if (this.final) return "final";
    if (this.blindFor > 0) return null;

    const distance = this.distanceTo(player.x, player.y);
    if (distance < RANGE.PROXIMITY && this.level.hasLineOfSight(this.x, this.y, player.x, player.y)) {
      return "close";
    }

    const hearRange = player.running
      ? RANGE.HEAR_RUN
      : player.crouching
        ? RANGE.HEAR_WALK * 0.35
        : RANGE.HEAR_WALK;
    if (player.moving && distance < hearRange) return "heard";

    // A lit torch is a beacon. This is the whole reason the torch has a switch:
    // it buys you sight and costs you cover, and the player chooses which.
    const sightRange = player.torchOn ? RANGE.SIGHT * 1.5 : RANGE.SIGHT;
    if (
      distance < sightRange &&
      this.facingToward(player.x, player.y) &&
      this.level.hasLineOfSight(this.x, this.y, player.x, player.y)
    ) {
      return "seen";
    }
    return null;
  }

  // Can it actually see you — a clear line, and near enough that the fog has
  // not swallowed you? Deliberately ignores its vision cone: once it is
  // chasing, it is looking at you.
  canSee(player) {
    return (
      this.distanceTo(player.x, player.y) < RANGE.SIGHT * 1.5 &&
      this.level.hasLineOfSight(this.x, this.y, player.x, player.y)
    );
  }

  goFinal() {
    this.final = true;
    this.state = "hunt";
    this.stateFor = 0;
    this.blindFor = 0;
  }

  update(dt, player) {
    if (!this.active) {
      return { caught: false, distance: Infinity, proximity: 0, hunting: false, state: "gone" };
    }

    this.stateFor += dt;
    this.blindFor = Math.max(0, this.blindFor - dt);
    const sensed = this.sense(player);

    switch (this.state) {
      case "wander":
        if (sensed) {
          // It stops and looks at you first. That pause is the player's cue to
          // break line of sight, and it is the moment the mode lives or dies
          // on: no warning is unfair, a long warning is no threat.
          this.state = "notice";
          this.stateFor = 0;
          this.target = { x: player.x, y: player.y };
        } else {
          this.wanderNear(dt, player);
        }
        break;

      case "notice":
        this.target = { x: player.x, y: player.y };
        if (!sensed && this.stateFor > TIMING.NOTICE_S * 0.5) {
          // Broken line of sight during the stare: it goes to look, but it
          // never saw where you went, and the out-of-sight clock is running.
          this.state = "search";
          this.stateFor = 0;
          this.chaseFor = 0;
          this.unseenFor = 0;
        } else if (this.stateFor >= TIMING.NOTICE_S) {
          this.state = "hunt";
          this.stateFor = 0;
          this.chaseFor = 0;
          this.unseenFor = 0;
        }
        break;

      // Two clocks, and either one ending the chase is enough. `chaseFor` only
      // ever counts up — being seen again does not reset it, so a chase has a
      // hard ceiling. `unseenFor` resets whenever it has line of sight to you,
      // and only line of sight: hearing you round a corner tells it where to
      // go, but does not keep the chase alive.
      //
      // Neither applies once the power is out. From then on it knows where you
      // are, and the last run to the exit is the one chase that does not end.
      case "hunt":
      case "search": {
        this.chaseFor += dt;
        if (this.canSee(player)) this.unseenFor = 0;
        else this.unseenFor += dt;
        if (sensed) this.target = { x: player.x, y: player.y };

        const survived = this.chaseFor >= this.chaseLimit;
        const hidden = this.unseenFor >= TIMING.OUT_OF_SIGHT_S;
        if (!this.final && (survived || hidden)) {
          this.giveUp(player);
        } else if (sensed && this.unseenFor < TIMING.SEARCH_AFTER_S) {
          this.state = "hunt";
        } else if (this.unseenFor >= TIMING.SEARCH_AFTER_S) {
          this.state = "search";
        }
        break;
      }

      default:
        this.state = "wander";
    }

    const speed = this.speedFor();
    // It stands still while it stares. Nothing is worse than being looked at.
    if (this.state !== "notice") this.steer(dt, speed);
    else this.turnToward(dt, this.target, 6);

    const distance = this.distanceTo(player.x, player.y);
    return {
      caught: distance < RANGE.CATCH,
      distance,
      // 0 far away, 1 on top of you. Drives the audio and the screen.
      proximity: Math.max(0, 1 - distance / RANGE.DREAD),
      hunting: this.state === "hunt" || this.state === "notice",
      staring: this.state === "notice",
      state: this.state,
      speed,
      sensed,
    };
  }

  speedFor() {
    if (this.final) return STALKER_SPEED.FINAL;
    if (this.state === "hunt") {
      // It lurches into the chase rather than snapping to full speed. Together
      // with the stare this gives about two and a half seconds between being
      // seen and being run down, which is the difference between a warning and
      // a formality.
      return STALKER_SPEED.HUNT * Math.min(1, 0.45 + this.stateFor / 1.5);
    }
    if (this.state === "search") return STALKER_SPEED.SEARCH;
    return STALKER_SPEED.WANDER;
  }

  // It has genuinely lost you. Running away worked.
  //
  // It does not drift off in whatever direction it happened to be facing — it
  // turns and goes the other way, which is the part the player can actually
  // see and the only way they learn that outrunning it is a thing that works.
  giveUp(player) {
    this.state = "wander";
    this.stateFor = 0;
    this.chaseFor = 0;
    this.unseenFor = 0;
    this.blindFor = TIMING.BLIND_S;
    const away = Math.atan2(this.y - player.y, this.x - player.x) + (this.random() - 0.5) * 1.2;
    const reach = (12 + this.random() * 10) * 32;
    this.target = { x: this.x + Math.cos(away) * reach, y: this.y + Math.sin(away) * reach };
    this.angle = away;
    // And it does not immediately reconsider: the next turn is a while off.
    this.turnIn = TIMING.TURN_MAX_S;
  }

  // Wandering is not aimless: it keeps itself loosely around the player so you
  // keep catching sight of it crossing a doorway two rooms over. That is where
  // almost all of the dread in this mode actually comes from.
  wanderNear(dt, player) {
    this.turnIn -= dt;
    const distance = this.distanceTo(player.x, player.y);
    const needsTarget = !this.target || Math.hypot(this.target.x - this.x, this.target.y - this.y) < TILE * 1.5;

    if (this.turnIn <= 0 || needsTarget) {
      this.turnIn = TIMING.TURN_MIN_S + this.random() * (TIMING.TURN_MAX_S - TIMING.TURN_MIN_S);
      // Outside the band it heads back toward you; well inside it, it drifts
      // off; in between it goes anywhere, which is what makes it sometimes
      // turn and look straight at you for no reason at all.
      let bias;
      let spread;
      if (distance > RANGE.LEASH_MAX) {
        bias = Math.atan2(player.y - this.y, player.x - this.x);
        spread = 1.0;
      } else if (distance < RANGE.LEASH_MIN) {
        bias = Math.atan2(this.y - player.y, this.x - player.x);
        spread = 1.6;
      } else {
        bias = this.random() * Math.PI * 2;
        spread = Math.PI * 2;
      }
      const angle = bias + (this.random() - 0.5) * spread;
      // Short hops. Long ones carry it out of sight between decisions, which
      // is the other half of why it was never seen.
      const reach = (5 + this.random() * 9) * 32;
      this.target = { x: this.x + Math.cos(angle) * reach, y: this.y + Math.sin(angle) * reach };
    }
  }

  turnToward(dt, target, rate) {
    if (!target) return;
    const desired = Math.atan2(target.y - this.y, target.x - this.x);
    const delta = ((desired - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.angle += delta * Math.min(1, dt * rate);
  }

  // Movement is greedy rather than a real path search: head for the goal, and
  // when a wall is in the way, slide along it. In a level made of open bays
  // with stub walls this reads as something groping its way toward you, which
  // is more unsettling than perfect pathing anyway.
  steer(dt, speed) {
    if (this.target) {
      this.turnToward(dt, this.target, this.state === "wander" ? 2.2 : 4.5);
    }

    const step = speed * dt;
    const tryMove = (angle) => {
      const nx = this.x + Math.cos(angle) * step;
      const ny = this.y + Math.sin(angle) * step;
      if (this.level.isBlocked(nx, ny, PLAYER_RADIUS + 2)) return false;
      this.x = nx;
      this.y = ny;
      return true;
    };

    if (!tryMove(this.angle)) {
      // Blocked: slide either way before giving up and turning around. Without
      // the fallback it can wedge itself in a corner and stop being a threat.
      let moved = false;
      for (const offset of [0.6, -0.6, 1.3, -1.3, 2.4, -2.4]) {
        if (tryMove(this.angle + offset)) {
          this.angle += offset * 0.5;
          moved = true;
          break;
        }
      }
      if (!moved) {
        this.angle += Math.PI * (0.6 + this.random() * 0.8);
        this.target = null;
      }
    }

    if (this.target && Math.hypot(this.target.x - this.x, this.target.y - this.y) < TILE) {
      this.target = null;
    }
  }
}
