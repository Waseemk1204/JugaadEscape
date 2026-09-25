// The promise of the theme is "there is never only one way". These tests hold
// every seed to it: each lock step must be doable at least two different ways
// with what that run actually hides around the branch.

import test from "node:test";
import assert from "node:assert/strict";
import {
  ITEMS, RECIPES, DOORS, CONTAINERS, placeItems, waysFor, combine, spend, makeItem, lockedDoors, doorUnlocked, jugaadScore, jugaadTitle,
} from "../shared/jugaad.js";

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Everything a thorough player could end up holding in a run.
function obtainable(contents) {
  const have = new Set(["phone"]);
  for (const ids of Object.values(contents)) for (const id of ids) if (id !== "code_note") have.add(id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of RECIPES) {
      if (have.has(r.a) && have.has(r.b) && !have.has(r.out)) {
        have.add(r.out);
        grew = true;
      }
    }
  }
  return have;
}

test("every item lands somewhere it is allowed, and nothing locks away its own key", () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const { contents, code } = placeItems(seeded(seed));
    assert.match(code, /^\d{3}$/);
    assert.ok(!contents["boss-drawer"].includes("drawer_key"), "drawer key inside the drawer it opens");
    assert.ok(!contents["key-box"].includes("code_note"), "code inside the box it opens");
    const all = Object.values(contents).flat();
    assert.equal(all.filter((id) => id === "paperclip").length, 2);
    for (const id of all) assert.ok(id === "code_note" || ITEMS[id], `unknown item ${id}`);
  }
});

test("every required lock step has at least two ways through, on every seed", () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const { contents } = placeItems(seeded(seed));
    const have = obtainable(contents);
    for (const door of DOORS) {
      for (const step of door.steps) {
        if (step.optional) continue;
        // A way is a thing you can do it with: an umbrella and a broom are two.
        const ways = [...have].filter((id) => ITEMS[id].tags.some((tag) => step.ways[tag]));
        if (step.ways.hands) ways.push("bare hands");
        assert.ok(ways.length >= 2, `seed ${seed}: ${door.id}/${step.id} only has ${ways.join(", ")}`);
      }
    }
  }
});

test("there is enough oil to open both the gate and the shutter quietly", () => {
  const oil = Object.values(ITEMS).filter((i) => i.tags.includes("oil")).reduce((n, i) => n + (i.uses ?? 1), 0);
  assert.ok(oil >= 2);
});

test("combining makes the tool and keeps the scissors", () => {
  let bag = [makeItem("can"), makeItem("scissors"), makeItem("phone")];
  const result = combine(bag, bag[0].uid);
  assert.ok(result);
  assert.equal(result.made.id, "shim");
  assert.deepEqual(result.inventory.map((i) => i.id).sort(), ["phone", "scissors", "shim"]);
  bag = [makeItem("hairpin"), makeItem("phone")];
  assert.equal(combine(bag), null);
});

test("a visiting card bends after one latch; an ID card does not", () => {
  const card = makeItem("visiting_card");
  const id = makeItem("id_card");
  assert.deepEqual(spend([card, id], card.uid).map((i) => i.id), ["id_card"]);
  assert.equal(spend([card, id], id.uid).length, 2);
});

test("the selected item is offered first, otherwise the quietest", () => {
  const latch = DOORS[0].steps.find((s) => s.id === "latch");
  const ruler = makeItem("steel_ruler");
  const card = makeItem("id_card");
  assert.equal(waysFor(latch, [ruler, card])[0].item.id, "id_card");
  assert.equal(waysFor(latch, [ruler, card], ruler.uid)[0].item.id, "steel_ruler");
  assert.equal(waysFor(latch, [makeItem("phone")]).length, 0);
});

test("a door is unlocked when its required steps are done; oiling is optional", () => {
  const state = lockedDoors();
  assert.equal(doorUnlocked("gate", state), false);
  state.gate.done.padlock = true;
  assert.equal(doorUnlocked("gate", state), true);
});

test("escaping with improvised tools beats escaping with keys", () => {
  const improvised = jugaadScore({ escaped: true, seconds: 400, log: [{ tag: "card" }, { tag: "hook" }, { tag: "picks" }, { tag: "shim" }, { tag: "picks" }], crafted: 2 });
  const keys = jugaadScore({ escaped: true, seconds: 400, log: [{ tag: "masterkey" }, { tag: "hook" }, { tag: "masterkey" }, { tag: "masterkey" }, { tag: "masterkey" }] });
  assert.ok(improvised > keys);
  assert.ok(CONTAINERS.length > 20);
});

test("a shift that ends inside is titled for how it ended", () => {
  assert.equal(jugaadTitle(0, false, "eleven"), "Record room ka naya karmchari");
  assert.equal(jugaadTitle(0, false, "slaps"), "Paanch thappad club");
  assert.equal(jugaadTitle(900, false, "eleven"), "Almost Home");
  assert.notEqual(jugaadTitle(0, true), "Record room ka naya karmchari");
});
