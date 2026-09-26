// The rules of jugaad: what is lying around the branch, what it can be bent
// into, and which of the locks between you and the street it will open.
//
// Items are described by what they *are* (thin and stiff, hooked, oily),
// not by which lock they belong to. A door step asks for a property, so a
// visiting card, an ID card and an old ATM card are all the same answer to
// the latch — and the player finds their own way through rather than the one
// the level designer had in mind.
//
// Pure data and functions: no DOM, no three.js. The game and the tests share
// it.

// ---------------------------------------------------------------------- items

export const ITEMS = {
  phone: {
    name: "Your phone",
    note: "8% battery. Select it and press F to set an alarm and leave it here as a decoy.",
    tags: ["phone"],
  },
  visiting_card: {
    name: "Visiting card",
    note: "'R. Sharma, Asst. Manager'. Thin, stiff — and it will bend after one go.",
    tags: ["card"],
    uses: 1,
  },
  id_card: { name: "Colleague's ID card", note: "Laminated. Slides into a latch nicely.", tags: ["card"] },
  atm_card: { name: "Old ATM card", note: "Expired in 2019. Still good for one thing.", tags: ["card"] },
  steel_ruler: { name: "Steel ruler", note: "30 cm. Thin enough for a latch, if a bit noisy.", tags: ["blade", "stick"] },
  butter_knife: { name: "Butter knife", note: "From the pantry. Forces a latch — loudly.", tags: ["blade"] },
  umbrella: { name: "Umbrella", note: "The handle is a perfect hook for a high bolt.", tags: ["hook"] },
  broom: { name: "Phool jhaadu", note: "Long enough to knock a tower bolt across.", tags: ["hook"] },
  hairpin: { name: "Hairpin", note: "Bent the right way, it picks a padlock — with something to hold tension.", tags: ["pin"] },
  safety_pin: { name: "Safety pin", note: "A worse pick than a hairpin, but a pick.", tags: ["pin"] },
  paperclip: { name: "Paperclip", note: "Straightened, it holds tension on a lock.", tags: ["clip"] },
  scissors: { name: "Scissors", note: "Sharp enough for thin metal.", tags: ["cutter"] },
  can: { name: "Empty Toofan Cola can", note: "Thin aluminium, crushed at one end.", tags: ["tin"] },
  coconut_oil: { name: "Nariyal tel bottle", note: "Somebody's hair oil. Enough to oil two tracks.", tags: ["oil"], uses: 2 },
  vaseline: { name: "Petroleum jelly tin", note: "For winter lips. Greases one track quiet.", tags: ["oil"], uses: 1 },
  achaar: { name: "Tiffin of achaar", note: "Mango pickle, swimming in mustard oil. It will do.", tags: ["oil"], uses: 1 },
  rubber_band: { name: "Rubber band", note: "Thick, office-issue. Snaps hard.", tags: ["band"] },
  drawer_key: { name: "Small key", note: "Too small for a door. A desk drawer, maybe.", tags: ["drawerkey"] },
  gate_key: { name: "Spare gate key", note: "Labelled 'GRILL' in marker.", tags: ["gatekey"] },
  key_bunch: { name: "Sir's key bunch", note: "Every key in the branch. He will notice.", tags: ["masterkey"] },
  fire_extinguisher: { name: "Fire extinguisher", note: "Heavy. One swing breaks a padlock — and the silence.", tags: ["smash"] },

  // Made, not found.
  pick_set: { name: "Hairpin lockpick", note: "Hairpin pick + paperclip wrench. Quiet and reusable.", tags: ["picks"] },
  crude_pick: { name: "Safety-pin pick", note: "Works. Slowly. Good for two locks.", tags: ["crudepick"], uses: 2 },
  shim: { name: "Can shim", note: "Slides down beside a padlock shackle. Tears after one use.", tags: ["shim"], uses: 1 },
  gulel: { name: "Ruler gulel", note: "Press F to flick an eraser across the room — a decoy noise where you aim.", tags: ["gulel"] },
};

// Things you find that are no use at all, for flavour. They are not picked up.
export const JUNK = [
  "A Parle-G packet. You eat one. It does not help.",
  "An old challan book and a dead pen.",
  "A rubber stamp: 'CANCELLED'. Relatable.",
  "Half a Hajmola strip.",
  "A Hanuman Chalisa booklet and a mobile recharge receipt.",
  "A calculator with a sticky 7.",
  "Cold chai in a paper cup.",
  "A Diwali greeting card from 2017.",
];

// Two things in, one thing out. `keep` survives the combining.
// `for` is what the result is good for, in a few words, for the hints.
export const RECIPES = [
  { a: "hairpin", b: "paperclip", out: "pick_set", for: "picks the padlocks, quietly" },
  { a: "safety_pin", b: "paperclip", out: "crude_pick", for: "picks a padlock or two" },
  { a: "can", b: "scissors", out: "shim", keep: ["scissors"], for: "slips a padlock open" },
  { a: "rubber_band", b: "steel_ruler", out: "gulel", for: "flicks a decoy noise across the room" },
];

// ----------------------------------------------------------------- containers

// Where things are hidden. `at` is in grid cells, the spot you stand near and
// look at. `noise` is how loud searching it is (an almirah door creaks), and
// `needs` is what has to be true before it will open at all.
export const CONTAINERS = [
  // Your own desk
  { id: "player-drawer", name: "Your desk drawer", at: [10.6, 25.2], time: 0.6, noise: 0.03 },
  // Colleagues
  { id: "gupta-drawer", name: "Gupta ji's drawer", at: [4.6, 20.2], time: 0.8, noise: 0.05 },
  { id: "gupta-bag", name: "Gupta ji's tiffin bag", at: [2.7, 20.5], time: 0.7, noise: 0.03 },
  { id: "priya-drawer", name: "Priya's drawer", at: [10.6, 20.2], time: 0.8, noise: 0.05 },
  { id: "verma-drawer", name: "Verma's drawer", at: [16.6, 20.2], time: 0.8, noise: 0.05 },
  { id: "anjali-drawer", name: "Anjali's drawer", at: [4.6, 25.2], time: 0.8, noise: 0.05 },
  { id: "anjali-bag", name: "Anjali's handbag", at: [2.7, 25.5], time: 0.9, noise: 0.03 },
  { id: "iyer-drawer", name: "Iyer's drawer", at: [16.6, 25.2], time: 0.8, noise: 0.05 },
  { id: "office-almirah-1", name: "Office almirah", at: [2.2, 18.4], time: 1.2, noise: 0.42 },
  { id: "office-almirah-2", name: "Office almirah", at: [2.2, 23], time: 1.2, noise: 0.42 },
  // Banking hall
  { id: "teller-drawer-1", name: "Cash counter drawer", at: [4.2, 15.2], time: 0.8, noise: 0.05 },
  { id: "teller-drawer-2", name: "Cash counter drawer", at: [9.2, 15.2], time: 0.8, noise: 0.05 },
  { id: "teller-drawer-3", name: "Cash counter drawer", at: [14.2, 15.2], time: 0.8, noise: 0.05 },
  { id: "stationery", name: "Stationery almirah", at: [21.3, 15.3], time: 1.1, noise: 0.42 },
  { id: "reception-drawer", name: "Enquiry desk drawer (lost & found)", at: [25.7, 10.4], time: 0.8, noise: 0.05 },
  { id: "coat-stand", name: "Coat stand", at: [13.6, 8.9], time: 0.4, noise: 0 },
  { id: "extinguisher", name: "Fire extinguisher bracket", at: [19.85, 8.9], time: 0.6, noise: 0.12 },
  // The cabin
  { id: "boss-penstand", name: "Sir's pen stand", at: [25.7, 21], time: 0.5, noise: 0 },
  { id: "boss-calendar", name: "Sir's desk calendar", at: [25.7, 23], time: 0.5, noise: 0 },
  { id: "boss-drawer", name: "Sir's desk drawer", at: [27.6, 23.2], time: 0.8, noise: 0.05, needs: { item: "drawer_key" } },
  { id: "boss-almirah", name: "Sir's Godrej almirah", at: [31.4, 19.6], time: 1.3, noise: 0.45 },
  { id: "key-box", name: "Key box (3-digit lock)", at: [31.4, 18.7], time: 0.9, noise: 0.03, needs: { code: true, opened: "boss-almirah" } },
  { id: "filing-cabinet", name: "Filing cabinet", at: [31.4, 26], time: 0.9, noise: 0.18 },
  // Sir leaves these on his desk when he goes to the washroom, and only then.
  { id: "boss-keys", name: "Sir's key bunch (on his desk)", at: [26.9, 22], time: 0.4, noise: 0.05, needs: { bossAway: true } },
  // Pantry
  { id: "fridge", name: "Pantry fridge", at: [8.5, 33.4], time: 0.8, noise: 0.08 },
  { id: "pantry-drawer", name: "Pantry drawer", at: [2.3, 34], time: 0.7, noise: 0.08 },
  { id: "pantry-bin", name: "Dustbin", at: [8.4, 37.4], time: 0.7, noise: 0.05 },
  // Record room
  { id: "record-almirah", name: "Record room almirah", at: [19.6, 33.1], time: 1.2, noise: 0.42 },
  { id: "file-rack", name: "Old file bundles", at: [15.1, 35.4], time: 1.4, noise: 0.05 },
  // Washroom
  { id: "washroom-shelf", name: "Shelf above the sink", at: [25.1, 34], time: 0.6, noise: 0.03 },
  { id: "cistern", name: "Cistern lid", at: [31.4, 33.6], time: 0.9, noise: 0.3 },
  { id: "broom-corner", name: "Mop and broom corner", at: [25.1, 37.4], time: 0.5, noise: 0.05 },
];

export const CONTAINER_BY_ID = Object.fromEntries(CONTAINERS.map((c) => [c.id, c]));

// Where each item may turn up. Fixed items have one home; the rest are dealt
// out by the run's seed, so a second run is a different search.
const PLACEMENT = [
  { item: "visiting_card", in: ["player-drawer"] },
  { item: "umbrella", in: ["coat-stand"] },
  { item: "broom", in: ["broom-corner"] },
  { item: "fire_extinguisher", in: ["extinguisher"] },
  { item: "gate_key", in: ["key-box"] },
  { item: "key_bunch", in: ["boss-keys"] },
  { item: "id_card", in: ["priya-drawer", "verma-drawer", "iyer-drawer", "teller-drawer-1", "teller-drawer-2"] },
  { item: "atm_card", in: ["anjali-bag", "reception-drawer"] },
  { item: "steel_ruler", in: ["gupta-drawer", "verma-drawer", "stationery", "iyer-drawer"] },
  { item: "butter_knife", in: ["pantry-drawer"] },
  { item: "hairpin", in: ["anjali-drawer", "anjali-bag", "washroom-shelf", "priya-drawer"] },
  { item: "safety_pin", in: ["file-rack", "teller-drawer-3", "gupta-drawer", "record-almirah"] },
  { item: "paperclip", in: ["stationery", "boss-penstand", "teller-drawer-1", "teller-drawer-2", "teller-drawer-3", "iyer-drawer"] },
  { item: "paperclip", in: ["file-rack", "office-almirah-1", "reception-drawer", "priya-drawer", "boss-penstand"] },
  { item: "scissors", in: ["stationery", "boss-penstand", "priya-drawer", "office-almirah-1"] },
  { item: "can", in: ["pantry-bin", "fridge"] },
  { item: "coconut_oil", in: ["anjali-drawer", "washroom-shelf", "priya-drawer"] },
  { item: "vaseline", in: ["verma-drawer", "boss-drawer", "iyer-drawer", "office-almirah-2"] },
  { item: "achaar", in: ["fridge", "gupta-bag"] },
  { item: "rubber_band", in: ["teller-drawer-1", "teller-drawer-2", "gupta-drawer", "reception-drawer", "verma-drawer"] },
  { item: "drawer_key", in: ["boss-penstand", "boss-calendar", "filing-cabinet"] },
  { item: "code_note", in: ["boss-calendar", "filing-cabinet", "reception-drawer"] },
];

// The sticky note is knowledge, not an item: reading it is enough.
export const CODE_NOTE = "code_note";

// Deal items into containers. Returns { containerId: [itemId, ...] }, plus a
// junk line for every container that ends up with nothing useful.
export function placeItems(random = Math.random) {
  const contents = Object.fromEntries(CONTAINERS.map((c) => [c.id, []]));
  for (const rule of PLACEMENT) {
    // Two paperclips should not end up in the same drawer.
    const options = rule.in.filter((id) => !contents[id].includes(rule.item));
    const pool = options.length ? options : rule.in;
    const pick = pool[Math.floor(random() * pool.length) % pool.length];
    contents[pick].push(rule.item);
  }
  const code = String(100 + Math.floor(random() * 900));
  const junk = {};
  const lines = [...JUNK];
  for (const container of CONTAINERS) {
    if (contents[container.id].length) continue;
    junk[container.id] = lines.length ? lines.splice(Math.floor(random() * lines.length), 1)[0] : "Nothing useful.";
  }
  return { contents, code, junk };
}

// ---------------------------------------------------------------------- doors

// The three doors, inside out. Each step lists every way it can be done:
// the tag an item needs, how long you hold E for, and how loud it is (0..1,
// where 1 is heard from anywhere in the branch).
//
// `hands` is always available. `consume` uses the item up; `breaks` leaves
// the lock visibly broken — anyone walking past will see it.
export const DOORS = [
  {
    id: "wooden",
    name: "Wooden doors",
    steps: [
      {
        id: "bolt",
        name: "Tower bolt",
        at: [16.9, 7.5],
        hint: "Bolted at the very top. You need something long with a hook.",
        ways: {
          hook: { time: 2.2, noise: 0.08, verb: "Hook the bolt open" },
        },
      },
      {
        id: "latch",
        name: "Latch",
        at: [16.9, 7.5],
        hint: "A spring latch. Something thin and stiff slides it back.",
        ways: {
          card: { time: 4, noise: 0.04, verb: "Slip the latch" },
          blade: { time: 2.4, noise: 0.32, verb: "Force the latch" },
          masterkey: { time: 1, noise: 0.03, verb: "Unlock the latch" },
        },
      },
    ],
    open: { quiet: 0.22, verb: "Open the wooden doors", close: "Pull the doors shut" },
  },
  {
    id: "gate",
    name: "Collapsible gate",
    steps: [
      {
        id: "padlock",
        name: "Gate padlock",
        at: [16.9, 4.5],
        hint: "A big Godrej padlock. Pick it, shim it, find a key — or break it.",
        ways: {
          picks: { time: 6, noise: 0.06, verb: "Pick the padlock" },
          crudepick: { time: 9, noise: 0.08, verb: "Pick the padlock (slowly)" },
          shim: { time: 2.5, noise: 0.04, verb: "Shim the padlock" },
          gatekey: { time: 1, noise: 0.03, verb: "Unlock the padlock" },
          masterkey: { time: 1.2, noise: 0.03, verb: "Unlock the padlock" },
          smash: { time: 1, noise: 1, verb: "Smash the padlock", breaks: true },
        },
      },
      {
        id: "oil",
        name: "Oil the track",
        optional: true,
        at: [14.2, 4.5],
        hint: "The track is rusted. Sliding it dry will screech.",
        ways: {
          oil: { time: 2.5, noise: 0.03, verb: "Oil the gate track", consume: true },
        },
      },
    ],
    open: { quiet: 0.14, loud: 0.85, verb: "Slide the gate open", close: "Slide the gate shut" },
  },
  {
    id: "shutter",
    name: "Shutter",
    steps: [
      {
        id: "lockLeft",
        name: "Left shutter lock",
        at: [13.8, 0.55],
        hint: "Padlocked to the floor ring. Same trick as the gate.",
        ways: {
          picks: { time: 6, noise: 0.06, verb: "Pick the left lock" },
          crudepick: { time: 9, noise: 0.08, verb: "Pick the left lock (slowly)" },
          shim: { time: 2.5, noise: 0.04, verb: "Shim the left lock" },
          masterkey: { time: 1.2, noise: 0.03, verb: "Unlock the left lock" },
          smash: { time: 1, noise: 1, verb: "Smash the left lock", breaks: true },
        },
      },
      {
        id: "lockRight",
        name: "Right shutter lock",
        at: [20.2, 0.55],
        hint: "Padlocked to the floor ring. Same trick as the gate.",
        ways: {
          picks: { time: 6, noise: 0.06, verb: "Pick the right lock" },
          crudepick: { time: 9, noise: 0.08, verb: "Pick the right lock (slowly)" },
          shim: { time: 2.5, noise: 0.04, verb: "Shim the right lock" },
          masterkey: { time: 1.2, noise: 0.03, verb: "Unlock the right lock" },
          smash: { time: 1, noise: 1, verb: "Smash the right lock", breaks: true },
        },
      },
      {
        id: "grease",
        name: "Grease the channels",
        optional: true,
        at: [16.9, 0.55],
        hint: "A dry shutter going up sounds like a train.",
        ways: {
          oil: { time: 3, noise: 0.03, verb: "Grease the shutter channels", consume: true },
        },
      },
    ],
    open: { quiet: 0.4, loud: 1, verb: "Heave the shutter up" },
  },
];

export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d]));

// A fresh, fully locked set of door states.
export function lockedDoors() {
  return Object.fromEntries(
    DOORS.map((door) => [door.id, { open: false, broken: false, done: Object.fromEntries(door.steps.map((s) => [s.id, false])) }]),
  );
}

export function doorUnlocked(doorId, state) {
  const door = DOOR_BY_ID[doorId];
  return door.steps.every((step) => step.optional || state[doorId].done[step.id]);
}

// Every way the player could do `step` right now, with what they carry.
// Sorted quietest first, then fastest. `preferUid` floats the currently
// selected item to the top if it works.
export function waysFor(step, inventory, preferUid = null) {
  const out = [];
  for (const [tag, way] of Object.entries(step.ways)) {
    if (tag === "hands") {
      out.push({ ...way, tag, item: null });
      continue;
    }
    for (const item of inventory) {
      if (ITEMS[item.id]?.tags.includes(tag)) out.push({ ...way, tag, item });
    }
  }
  out.sort((a, b) => {
    if (preferUid) {
      const pa = a.item?.uid === preferUid ? 0 : 1;
      const pb = b.item?.uid === preferUid ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return a.noise - b.noise || a.time - b.time;
  });
  return out;
}

// What would satisfy a step at all, as item names — for the hint when you
// have nothing that fits.
export function tagsFor(step) {
  return Object.keys(step.ways);
}

// ------------------------------------------------------------------ inventory

export const SLOTS = 5;

let uidCounter = 0;
export function makeItem(id) {
  uidCounter += 1;
  return { uid: `${id}-${uidCounter}`, id, uses: ITEMS[id]?.uses ?? null };
}

// Spend one use of an item; returns the inventory without it if it is spent.
export function spend(inventory, uid) {
  return inventory.flatMap((item) => {
    if (item.uid !== uid) return [item];
    if (item.uses === null) return [item];
    const uses = item.uses - 1;
    return uses > 0 ? [{ ...item, uses }] : [];
  });
}

// Try to combine. Prefers a recipe that uses `selectedUid`. Returns
// { inventory, made, recipe } or null if nothing in the bag goes together.
export function combine(inventory, selectedUid = null) {
  const has = (id) => inventory.find((item) => item.id === id);
  const candidates = RECIPES.filter((r) => has(r.a) && has(r.b));
  if (!candidates.length) return null;
  const selected = inventory.find((item) => item.uid === selectedUid);
  const recipe = candidates.find((r) => selected && (r.a === selected.id || r.b === selected.id)) || candidates[0];
  const keep = recipe.keep || [];
  const used = [recipe.a, recipe.b].filter((id) => !keep.includes(id)).map((id) => has(id).uid);
  const made = makeItem(recipe.out);
  const next = inventory.filter((item) => !used.includes(item.uid));
  next.push(made);
  return { inventory: next, made, recipe };
}

// What an item could be combined with: every recipe it is part of, the
// partner it needs, and whether that partner is already in the bag.
export function combineOptions(inventory, uid) {
  const item = inventory.find((i) => i.uid === uid);
  if (!item) return [];
  return RECIPES.filter((r) => r.a === item.id || r.b === item.id).map((recipe) => {
    const partner = recipe.a === item.id ? recipe.b : recipe.a;
    return { recipe, partner, ready: inventory.some((i) => i.id === partner && i.uid !== uid) };
  });
}

// Recipes the bag is one item short of, for hints.
export function nearRecipes(inventory) {
  const ids = new Set(inventory.map((item) => item.id));
  return RECIPES.filter((r) => ids.has(r.a) !== ids.has(r.b));
}

// ---------------------------------------------------------------------- score

// How much of a jugaadu you were. Improvised answers score more than keys,
// keys more than brute force, and brute force more than nothing.
const WAY_POINTS = {
  card: 150,
  blade: 110,
  hook: 140,
  picks: 170,
  crudepick: 160,
  shim: 180,
  oil: 120,
  gatekey: 60,
  masterkey: 40,
  smash: 20,
  hands: 0,
};

export function jugaadScore({ log = [], crafted = 0, decoys = 0, slaps = 0, spotted = 0, seconds = 0, escaped = false }) {
  let score = escaped ? 500 : 0;
  for (const entry of log) score += WAY_POINTS[entry.tag] ?? 0;
  score += crafted * 100 + Math.min(decoys, 6) * 40;
  score -= slaps * 120 + spotted * 25;
  if (escaped) score += Math.max(0, 600 - seconds);
  return Math.max(0, Math.round(score));
}

// How the shift went, in a phrase. A shift that ends inside is named for how
// it ended: slapped three times, or still there at 11.
export function jugaadTitle(score, escaped, failKind = "slaps") {
  if (!escaped) {
    if (score > 600) return "Almost Home";
    return failKind === "eleven" ? "Record room ka naya karmchari" : "Paanch thappad club";
  }
  if (score >= 2400) return "Certified Jugaadu";
  if (score >= 1800) return "Desi MacGyver";
  if (score >= 1200) return "Chalu Clerk";
  return "Lucky Babu";
}
