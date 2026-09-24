// The stalker: a StalkerBrain driving a Monster body.
//
// Keeping the two apart is what lets the behaviour be tested in Node while the
// thing that actually frightens people stays in the renderer.

import { Monster } from "./monster.js";
import { StalkerBrain, RANGE } from "../../shared/stalker-ai.js";

export { RANGE } from "../../shared/stalker-ai.js";

export class Stalker {
  constructor(scene, level) {
    this.scene = scene;
    this.brain = new StalkerBrain(level);
    this.body = new Monster(scene);
    this.visible = false;
  }

  get active() {
    return this.brain.active;
  }

  get x() {
    return this.brain.x;
  }

  get y() {
    return this.brain.y;
  }

  spawn(px, py) {
    const ok = this.brain.spawn(px, py);
    if (ok) this.body.place(this.brain.x, this.brain.y, this.brain.angle);
    this.body.setVisible(ok);
    return ok;
  }

  banish(px, py, blindFor) {
    const ok = this.brain.banish(px, py, blindFor);
    if (ok) this.body.place(this.brain.x, this.brain.y, this.brain.angle);
    this.body.setVisible(ok);
    return ok;
  }

  update(dt, player, time) {
    const result = this.brain.update(dt, player);
    this.animate(dt, time, result);
    this.visible =
      result.distance < RANGE.SIGHT * 1.6 &&
      this.brain.level.hasLineOfSight(this.brain.x, this.brain.y, player.x, player.y);
    return result;
  }

  animate(dt, time, result = {}) {
    const { x, y, angle, state, final } = this.brain;
    const charging = state === "hunt" || state === "notice" || final;
    this.body.update({
      x,
      y,
      angle,
      charging,
      dt,
      time,
      // It moves harder the closer it is, so a distant sighting is eerie and a
      // near one is frantic.
      intensity: 0.7 + (result.proximity ?? 0) * 0.9,
    });
  }

  dispose() {
    this.body.dispose();
  }
}
