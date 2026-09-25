// Motu Sir: the branch manager, and the reason nobody has gone home.
//
// He is not a monster that hunts you. He is a man with a routine, and the
// game is learning it:
//
//   * He sits in his glass cabin, mostly staring at his monitor, now and then
//     glancing up at the floor.
//   * A minute after he sits down he gets up again and walks a round of the
//     branch — past your desk, out to the front doors and back.
//   * Every other time, instead of a round, he goes to the washroom, and for
//     the best part of a minute his cabin is empty.
//   * A noise brings him out: "Kaun hai?!", then 10–15 seconds while he heaves
//     himself up, then he walks to where it came from. Be at your desk.
//   * On the way back from anything he walks past your desk. If you are not
//     in your chair, he goes looking for you.
//
// Being seen is not instant. A meter fills while he can see you — slowly while
// he is looking at his screen, quickly when he is looking for you — and you
// can break it by ducking out of sight. When it fills, he has caught you.
//
// Pure logic, no rendering, so it can be tested in Node.

import { BankMap, SPOTS, ROUTES, cellPoint, roomAt } from "./bank-map.js";

const M = 32; // map pixels per metre

export const BOSS = {
  WALK: 68, // he is not a fast man
  HURRY: 84,
  RADIUS: 15,
  OUTING_EVERY_S: 60,
  OUTING_MIN_S: 34, // how short the gap gets once he is suspicious
  SUSPICION_STEP_S: 7,
  PEE_S: 25,
  ALERT_MIN_S: 10,
  ALERT_MAX_S: 15,
  ALERT_LOUD_S: 2, // something really loud gets him up at once
  PEE_ALERT_S: 5,
  PHONE_S: 25,
  SEARCH_S: 22,
  LOCK_S: 3, // at the door, locking it back up
  LOOK_S: 3.2,
  // Eyes
  CABIN_RANGE: 15 * M,
  WALK_RANGE: 12 * M,
  PHONE_RANGE: 2.6 * M,
  FOV: 1.05, // half-angle, radians (~60°)
  BUSY_FOV: 0.55,
  BUSY_FACTOR: 0.32, // how much less he notices while staring at his screen
  GLANCE_EVERY_S: [8, 14],
  GLANCE_S: 3,
  NOTICE_AT: 0.3, // meter level where he stops and stares
  TOO_CLOSE: 1.7 * M, // at this range he notices you whichever way he faces
  // Ears
  HEAR: 30 * M, // how far a noise of loudness 1 carries
  WALL_MUFFLE: 0.8, // through walls and doors a noise carries this much as far
};

const WALKING_MODES = new Set(["round", "washroom", "investigate", "search", "return", "relock"]);

// Where he stands to lock each door again — on the inside, facing it.
const LOCK_AT = { wooden: [16.9, 8.9], gate: [16.9, 5.7] };

export class BossBrain {
  constructor(map = new BankMap(), random = Math.random) {
    this.map = map;
    this.random = random;
    this.reset();
  }

  reset() {
    this.x = SPOTS.bossChair.x;
    this.y = SPOTS.bossChair.y;
    this.angle = Math.PI; // facing west, out through the glass
    this.headTurn = 0;
    this.mode = "cabin";
    this.suspicion = 0;
    this.meter = 0;
    this.noticing = false;
    this.outingIn = BOSS.OUTING_EVERY_S;
    this.nextOuting = "round";
    this.plan = [];
    this.path = [];
    this.action = null;
    this.timer = 0;
    this.peeing = false;
    this.glanceIn = this.glanceGap();
    this.glancing = 0;
    this.noise = null;
    this.searchLeft = 0;
    this.wantsWord = false; // he has been looking for you; he will have words
    this.moving = false;
    this.events = [];
  }

  glanceGap() {
    const [a, b] = BOSS.GLANCE_EVERY_S;
    return a + this.random() * (b - a);
  }

  outingGap() {
    return Math.max(BOSS.OUTING_MIN_S, BOSS.OUTING_EVERY_S - this.suspicion * BOSS.SUSPICION_STEP_S);
  }

  get inCabin() {
    return this.mode === "cabin" || this.mode === "phone" || (this.mode === "alerted" && roomAt(this.x, this.y) === "cabin");
  }

  // Is his cabin empty, with his keys lying on the desk? Only while he is in
  // the washroom or on the way there and back.
  get away() {
    return this.mode === "washroom" || (this.mode === "alerted" && this.peeing);
  }

  say(text, mood = "normal") {
    this.events.push({ type: "say", text, mood });
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  // ------------------------------------------------------------------ plans

  setPlan(mode, steps) {
    this.mode = mode;
    this.plan = steps.map((step) => {
      if (Array.isArray(step)) return { ...cellPoint(step) };
      if (step.at) return { ...cellPoint(step.at), action: step.action, face: step.face };
      return { ...step };
    });
    this.path = [];
    this.action = null;
    if (mode !== "washroom") this.peeing = false;
  }

  homeSteps() {
    return [SPOTS.cabinDoorOut, { ...SPOTS.bossChair, action: "sit" }];
  }

  leaveCabinSteps() {
    return roomAt(this.x, this.y) === "cabin" ? [SPOTS.cabinDoorIn, SPOTS.cabinDoorOut] : [];
  }

  startOuting() {
    const kind = this.nextOuting;
    this.nextOuting = kind === "round" ? "washroom" : "round";
    this.emit("standUp");
    if (kind === "washroom") this.say("Ek minute, abhi aaya…", "aside");
    else this.say("Chalo, dekhta hoon sab kaam kar rahe hain ya nahi.", "aside");
    this.setPlan(kind, [...ROUTES[kind], { at: [SPOTS.bossChair.x / 24, SPOTS.bossChair.y / 24], action: "sit" }]);
  }

  startInvestigate() {
    const target = this.noise || { x: this.x, y: this.y };
    this.setPlan("investigate", [
      ...this.leaveCabinSteps(),
      { x: target.x, y: target.y, action: "look" },
      { ...SPOTS.deskCheck, action: "checkDesk" },
      ...this.homeSteps(),
    ]);
  }

  startRelock(id) {
    if (this.mode === "alerted") this.emit("standUp");
    this.peeing = false;
    this.setPlan("relock", [
      ...this.leaveCabinSteps(),
      { ...cellPoint(LOCK_AT[id]), action: "lockDoor", face: -Math.PI / 2, door: id },
    ]);
  }

  startSearch(fromX = this.x, fromY = this.y) {
    this.searchLeft = BOSS.SEARCH_S;
    this.wantsWord = true;
    // The nearest few search spots first, then wherever.
    const spots = ROUTES.search
      .map(cellPoint)
      .sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY));
    const pick = spots.slice(0, 3).concat(spots.slice(3).sort(() => this.random() - 0.5)).slice(0, 5);
    this.setPlan("search", [
      ...this.leaveCabinSteps(),
      ...pick.map((p) => ({ ...p, action: "glance" })),
      { ...SPOTS.deskCheck, action: "checkDesk" },
      ...this.homeSteps(),
    ]);
  }

  // ----------------------------------------------------------------- inputs

  // Something went bang. Returns true if he heard it.
  hearNoise(x, y, loudness) {
    if (this.mode === "confront" || loudness <= 0) return false;
    const distance = Math.hypot(x - this.x, y - this.y);
    const clear = this.map.hasLineOfSight(this.x, this.y, x, y);
    // Walls muffle, but a bank is not a big building — and a padlock being
    // smashed or a dry shutter going up is heard from anywhere in it.
    const reach = loudness * BOSS.HEAR * (clear ? 1 : BOSS.WALL_MUFFLE);
    if (distance > reach && loudness < 0.95) return false;
    this.noise = { x, y };
    const loud = loudness >= 0.95;

    if (this.mode === "washroom" && this.peeing) {
      this.mode = "alerted";
      this.timer = loud ? 1 : BOSS.PEE_ALERT_S;
      this.say("Kaun hai bahar?!", "shout");
      this.emit("alerted");
      return true;
    }
    if (this.mode === "cabin" || this.mode === "phone") {
      this.mode = "alerted";
      this.timer = loud
        ? BOSS.ALERT_LOUD_S
        : BOSS.ALERT_MIN_S + (1 - Math.min(1, loudness)) * (BOSS.ALERT_MAX_S - BOSS.ALERT_MIN_S);
      this.say(loud ? "YEH KYA THA?!" : "Kaun hai?!", "shout");
      this.emit("alerted");
      return true;
    }
    if (this.mode === "alerted") {
      if (loud) this.timer = Math.min(this.timer, BOSS.ALERT_LOUD_S);
      return true;
    }
    // On his way to lock a door: that comes first.
    if (this.mode === "relock") return true;
    // Already on his feet: straight there.
    this.say(loud ? "YEH KYA THA?!" : "Yeh kya awaaz thi?", loud ? "shout" : "normal");
    this.startInvestigate();
    return true;
  }

  // The landline on his desk rings. He answers — it is his wife, it is always
  // his wife — and for half a minute he sees nothing but the desk.
  phoneCall() {
    if (this.mode !== "cabin") return false;
    this.mode = "phone";
    this.timer = BOSS.PHONE_S;
    this.say("Haan ji… haan ji, madam… nahi, abhi nahi aa sakta…", "aside");
    this.emit("phone");
    return true;
  }

  // After a slap he is back behind his desk, pleased with himself.
  afterSlap() {
    this.x = SPOTS.bossChair.x;
    this.y = SPOTS.bossChair.y;
    this.angle = Math.PI;
    this.mode = "cabin";
    this.meter = 0;
    this.noticing = false;
    this.peeing = false;
    this.plan = [];
    this.path = [];
    this.action = null;
    this.suspicion = Math.min(4, this.suspicion + 1);
    this.outingIn = this.outingGap();
    this.wantsWord = false;
  }

  // ----------------------------------------------------------------- update

  // player: { x, y, seated, crouching, running, moving }
  // world:  { doors: [{ id, x, y, tampered }], keysTaken }
  update(dt, player, world = {}) {
    this.events = [];
    this.moving = false;
    if (this.mode === "confront") return this.result(false);

    // --- eyes
    const seen = this.look(dt, player);
    if (this.meter >= 1) {
      this.mode = "confront";
      this.say("OYE! SHARMA! IDHAR AAO!", "shout");
      this.emit("caught");
      return this.result(true);
    }

    // --- doors he can see standing open, or a broken lock: he goes over
    // and locks them himself (see runAction), then looks for whoever did it.
    if (!this.peeing && world.doors && this.mode !== "relock") {
      for (const door of world.doors) {
        if (!door.tampered) continue;
        const d = Math.hypot(door.x - this.x, door.y - this.y);
        if (d > 11 * M || !this.inView(door.x, door.y, BOSS.FOV)) continue;
        if (!this.map.hasLineOfSight(this.x, this.y, door.x, door.y)) continue;
        this.say("Yeh darwaza kisne khola?! Koi bhaagne ki koshish kar raha hai!", "shout");
        this.emit("spottedDoor", { id: door.id });
        this.suspicion = Math.min(4, this.suspicion + 1);
        this.startRelock(door.id);
        break;
      }
    }

    // His minute only runs while he is at his desk: it starts when he sits
    // back down, so a long round never eats into your time. A phone call
    // counts — he is still in his chair.
    if (this.mode === "cabin" || this.mode === "phone") this.outingIn -= dt;

    switch (this.mode) {
      case "cabin":
        this.updateCabin(dt);
        break;
      case "phone":
        this.timer -= dt;
        this.headTurn += (0 - this.headTurn) * Math.min(1, dt * 3);
        if (this.timer <= 0) {
          this.mode = "cabin";
          this.say("Achha, rakhta hoon. Haan. Haan. Rakhta hoon.", "aside");
        }
        break;
      case "alerted":
        this.timer -= dt;
        if (this.noticing) this.faceToward(player.x, player.y, dt);
        if (this.timer <= 0) {
          this.peeing = false;
          this.emit("standUp");
          this.say("Dekhta hoon kaun hai!", "normal");
          this.startInvestigate();
        }
        break;
      default:
        if (WALKING_MODES.has(this.mode)) this.updatePlan(dt, player, world);
    }
    return this.result(seen);
  }

  updateCabin(dt) {
    // Mostly at the screen; now and then a long look out over the floor.
    this.glanceIn -= dt;
    if (this.glancing > 0) {
      this.glancing -= dt;
      const sweep = Math.sin((1 - this.glancing / BOSS.GLANCE_S) * Math.PI * 2) * 0.55;
      this.headTurn += (sweep - this.headTurn) * Math.min(1, dt * 4);
      if (this.glancing <= 0) this.glanceIn = this.glanceGap();
    } else {
      this.headTurn += (0 - this.headTurn) * Math.min(1, dt * 3);
      if (this.glanceIn <= 0) {
        this.glancing = BOSS.GLANCE_S;
        this.emit("glance");
      }
    }
    this.angle = Math.PI;
    if (this.outingIn <= 0 && !this.noticing) this.startOuting();
  }

  updatePlan(dt, player, world) {
    if (this.mode === "search") {
      this.searchLeft -= dt;
      // Out of patience: straight to your desk, then home.
      if (this.searchLeft <= 0 && this.plan.length > 3) {
        this.plan = [{ ...SPOTS.deskCheck, action: "checkDesk" }, ...this.homeSteps()];
        this.path = [];
        this.action = null;
      }
    }

    // Something caught his eye: stop and stare until it resolves.
    if (this.noticing) {
      this.faceToward(player.x, player.y, dt);
      return;
    }

    if (this.action) {
      this.runAction(dt, player, world);
      return;
    }

    const node = this.plan[0];
    if (!node) {
      this.plan = this.homeSteps();
      return;
    }
    if (!this.path.length) {
      this.path = this.map.findPath(this.x, this.y, node.x, node.y, BOSS.RADIUS);
      if (!this.path.length) this.path = [{ x: node.x, y: node.y }];
    }
    const speed = this.mode === "search" || this.mode === "investigate" || this.mode === "relock" ? BOSS.HURRY : BOSS.WALK;
    const next = this.path[0];
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= Math.max(step, 2)) {
      this.x = next.x;
      this.y = next.y;
      this.path.shift();
      if (!this.path.length) this.arrive(node);
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.moving = true;
      this.turnTo(Math.atan2(dy, dx), dt, 5);
    }
    this.headTurn += (0 - this.headTurn) * Math.min(1, dt * 3);
  }

  arrive(node) {
    if (!node.action) {
      this.plan.shift();
      return;
    }
    const durations = { look: BOSS.LOOK_S, glance: 1.8, checkDoors: 2.6, pee: BOSS.PEE_S, checkDesk: 1.1, sit: 0, lockDoor: BOSS.LOCK_S };
    this.action = { type: node.action, t: durations[node.action] ?? 1, face: node.face, base: this.angle, door: node.door };
    if (node.action === "pee") {
      this.peeing = true;
      this.emit("pee");
    }
    if (node.action === "look") this.emit("arrived", { x: this.x, y: this.y });
  }

  runAction(dt, player, world) {
    const action = this.action;
    action.t -= dt;
    const type = action.type;

    if (type === "look" || type === "glance") {
      // Look left, look right: a slow scan of the room.
      const phase = Math.sin(action.t * 1.9);
      this.angle = action.base + phase * 1.1;
    } else if (type === "checkDoors" || type === "pee" || type === "lockDoor") {
      if (action.face !== undefined) this.turnTo(action.face, dt, 4);
    } else if (type === "checkDesk") {
      this.faceToward(SPOTS.playerChair.x, SPOTS.playerChair.y, dt);
    }

    if (action.t > 0) return;
    this.action = null;
    const node = this.plan.shift();

    if (type === "pee") {
      this.peeing = false;
      this.emit("flush");
    } else if (type === "lockDoor") {
      // Only if he actually got there: a door shut in his face on the way
      // (the path ending short) leaves him locking nothing.
      if (Math.hypot(this.x - node.x, this.y - node.y) < 1.5 * M) {
        this.emit("relock", { id: action.door });
        this.say("Ab koi nahi niklega. Aur jisne khola — main dhoondh ke rahunga.", "shout");
      }
      this.startSearch(this.x, this.y);
    } else if (type === "checkDesk") {
      if (!player.seated) {
        this.say("Sharma kahan gaya?! SHARMA!", "shout");
        this.emit("emptyDesk");
        this.suspicion = Math.min(4, this.suspicion + 1);
        this.startSearch(node?.x ?? this.x, node?.y ?? this.y);
      } else if (this.wantsWord) {
        this.say("Kahan the tum? …Chalo, kaam karo. Main dekh raha hoon.", "normal");
        this.wantsWord = false;
      } else {
        this.say(pick(this.random, ["Hmm. Kaam karo, kaam.", "File khatam hui?", "Shabaash. Lage raho."]), "aside");
      }
      // After checking on you he is going home, not finishing a stale search.
      if (this.mode === "search" && player.seated) this.mode = "return";
    } else if (type === "sit") {
      this.mode = "cabin";
      this.angle = Math.PI;
      // A full minute at his desk before the next outing, every time.
      this.outingIn = this.outingGap();
      this.glanceIn = this.glanceGap();
      this.emit("sitDown");
      if (world.keysTaken && !this.keysMissed) {
        this.keysMissed = true;
        this.say("Arre… meri chaabi kahan gayi?! Kisi ne dekhi?", "shout");
        this.suspicion = Math.min(4, this.suspicion + 1);
        this.startSearch();
      }
    }
  }

  // ------------------------------------------------------------------- eyes

  // How he sees right now: range, cone and how quickly he twigs.
  eyes() {
    if (this.peeing || this.mode === "confront") return null;
    if (this.mode === "phone") return { range: BOSS.PHONE_RANGE, fov: BOSS.FOV, factor: 0.6 };
    if (this.mode === "cabin") {
      return this.glancing > 0
        ? { range: BOSS.CABIN_RANGE, fov: BOSS.FOV, factor: 0.85 }
        : { range: BOSS.CABIN_RANGE, fov: BOSS.BUSY_FOV, factor: BOSS.BUSY_FACTOR };
    }
    if (this.mode === "alerted") return { range: BOSS.CABIN_RANGE, fov: BOSS.FOV, factor: 1 };
    if (this.mode === "search") return { range: BOSS.WALK_RANGE, fov: BOSS.FOV, factor: 1.25 };
    return { range: BOSS.WALK_RANGE, fov: BOSS.FOV, factor: 1 };
  }

  look(dt, player) {
    const eyes = this.eyes();
    let visible = false;
    if (eyes && !player.seated) {
      const d = Math.hypot(player.x - this.x, player.y - this.y);
      const close = d < BOSS.TOO_CLOSE;
      if (d < eyes.range && (close || this.inView(player.x, player.y, eyes.fov))) {
        visible = this.map.hasLineOfSight(this.x, this.y, player.x, player.y, { crouched: player.crouching && !close });
      }
      if (visible) {
        let rate = eyes.factor / (0.4 + 1.6 * (d / eyes.range));
        if (player.crouching) rate *= 0.45;
        if (player.running) rate *= 1.5;
        if (close) rate = Math.max(rate, 2.2);
        this.meter = Math.min(1, this.meter + rate * dt);
      }
    }
    if (!visible) this.meter = Math.max(0, this.meter - 0.28 * dt);

    const wasNoticing = this.noticing;
    this.noticing = this.meter >= BOSS.NOTICE_AT || (wasNoticing && this.meter > BOSS.NOTICE_AT * 0.5);
    if (this.noticing && !wasNoticing) {
      this.say(pick(this.random, ["Hmm? Kaun hai wahan?", "Ruko… wahan kaun hai?", "Hmm?"]), "normal");
      this.emit("noticing");
    } else if (!this.noticing && wasNoticing) {
      this.say(pick(this.random, ["…Shayad kuch nahi.", "Hmph. Chashma badalna padega."]), "aside");
    }
    return visible;
  }

  inView(x, y, fov) {
    const facing = this.angle + this.headTurn;
    const to = Math.atan2(y - this.y, x - this.x);
    return Math.abs(wrap(to - facing)) <= fov;
  }

  faceToward(x, y, dt) {
    this.turnTo(Math.atan2(y - this.y, x - this.x), dt, 4);
  }

  turnTo(target, dt, rate) {
    this.angle += wrap(target - this.angle) * Math.min(1, dt * rate);
  }

  result(seen) {
    return {
      events: this.events,
      seen,
      meter: this.meter,
      mode: this.mode,
      noticing: this.noticing,
      peeing: this.peeing,
    };
  }
}

function wrap(a) {
  return ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}
