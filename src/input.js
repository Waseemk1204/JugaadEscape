// Keyboard, virtual joystick and touch action buttons. Produces a normalised
// movement vector plus run/crouch/hold flags read by the game loop each frame.

export class Input {
  constructor({ joystick, knob, interactButton, runButton, crouchButton, isTyping }) {
    this.keys = new Set();
    this.x = 0;
    this.y = 0;
    // Run and crouch are sticky: you press once and stay that way, rather than
    // holding a key or a thumb down for a whole match.
    this.runOn = false;
    this.crouchOn = false;
    this.hold = false;
    this.locked = false;
    // Game-specific keys (inventory slots, use, combine…). Return true if the
    // key was handled.
    this.onKey = () => false;
    this.runButton = runButton;
    this.crouchButton = crouchButton;
    this.isTyping = isTyping || (() => false);
    this.pointer = { active: false, id: null };
    this.joystick = joystick;
    this.knob = knob;

    window.addEventListener("keydown", (event) => {
      if (this.isTyping()) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (event.repeat) return;
      if (key === "shift") this.toggleRun();
      else if (key === "c") this.toggleCrouch();
      else this.onKey(key);
      this.keys.add(key);
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.resetJoystick();
      this.hold = false;
    });

    joystick.addEventListener("pointerdown", (event) => {
      this.pointer.active = true;
      this.pointer.id = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      this.updateJoystick(event.clientX, event.clientY);
    });
    joystick.addEventListener("pointermove", (event) => {
      if (this.pointer.active && event.pointerId === this.pointer.id) this.updateJoystick(event.clientX, event.clientY);
    });
    joystick.addEventListener("pointerup", () => this.resetJoystick());
    joystick.addEventListener("pointercancel", () => this.resetJoystick());

    const holdOn = (event) => {
      event.preventDefault();
      this.hold = true;
      interactButton.classList.add("active");
    };
    const holdOff = () => {
      this.hold = false;
      interactButton.classList.remove("active");
    };
    interactButton.addEventListener("pointerdown", holdOn);
    interactButton.addEventListener("pointerup", holdOff);
    interactButton.addEventListener("pointercancel", holdOff);
    interactButton.addEventListener("pointerleave", holdOff);
    interactButton.addEventListener("contextmenu", (event) => event.preventDefault());

    runButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.toggleRun();
    });
    runButton.addEventListener("contextmenu", (event) => event.preventDefault());

    if (crouchButton) {
      crouchButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.toggleCrouch();
      });
      crouchButton.addEventListener("contextmenu", (event) => event.preventDefault());
    }
  }

  toggleRun() {
    this.runOn = !this.runOn;
    if (this.runOn) this.crouchOn = false;
    this.syncStanceButtons();
  }

  toggleCrouch() {
    this.crouchOn = !this.crouchOn;
    if (this.crouchOn) this.runOn = false;
    this.syncStanceButtons();
  }

  syncStanceButtons() {
    this.runButton?.classList.toggle("active", this.runOn);
    this.crouchButton?.classList.toggle("active", this.crouchOn);
  }

  // Called once per frame; merges keyboard and joystick.
  poll() {
    if (this.locked) {
      this.x = 0;
      this.y = 0;
      return;
    }
    const kx = (this.keys.has("arrowright") || this.keys.has("d") ? 1 : 0) - (this.keys.has("arrowleft") || this.keys.has("a") ? 1 : 0);
    const ky = (this.keys.has("arrowdown") || this.keys.has("s") ? 1 : 0) - (this.keys.has("arrowup") || this.keys.has("w") ? 1 : 0);
    if (kx || ky) {
      const length = Math.hypot(kx, ky) || 1;
      this.x = kx / length;
      this.y = ky / length;
    } else if (!this.pointer.active) {
      this.x = 0;
      this.y = 0;
    }
  }

  get running() {
    return this.runOn && !this.crouchOn;
  }

  get crouching() {
    return this.crouchOn;
  }

  get holding() {
    return this.hold || this.keys.has("e");
  }

  updateJoystick(clientX, clientY) {
    const bounds = this.joystick.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const max = bounds.width * 0.32;
    const distance = Math.min(Math.hypot(dx, dy), max);
    const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    const dead = 0.12;
    const magnitude = distance / max;
    if (magnitude < dead) {
      this.x = 0;
      this.y = 0;
      return;
    }
    this.x = (x / max) * Math.min(1, magnitude / 0.85);
    this.y = (y / max) * Math.min(1, magnitude / 0.85);
    const norm = Math.hypot(this.x, this.y);
    if (norm > 1) {
      this.x /= norm;
      this.y /= norm;
    }
  }

  resetJoystick() {
    this.pointer.active = false;
    this.pointer.id = null;
    this.knob.style.transform = "translate(-50%, -50%)";
    this.x = 0;
    this.y = 0;
  }
}

// Look controls for the first-person camera.
//
// Desktop uses pointer lock so the mouse can turn freely. Phones drag anywhere
// on the canvas — the joystick and action buttons are DOM elements layered on
// top, so their touches never reach here and moving never fights looking.
export class Look {
  constructor({ target, onLook, onLockChange }) {
    this.target = target;
    this.onLook = onLook;
    this.onLockChange = onLockChange || (() => {});
    this.mouseSensitivity = 0.0023;
    this.touchSensitivity = 0.0052;
    this.enabled = false;
    // Off while the cursor is needed on screen (a meeting's ballot): dragging
    // still turns the view.
    this.lockable = true;
    this.pointers = new Map();
    this.invertY = false;

    target.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      if (event.pointerType === "mouse") {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        // Pointer lock is refused in some embedded contexts; failing quietly is
        // fine, the player can still look by dragging.
        if (!this.locked && this.lockable) Promise.resolve(target.requestPointerLock?.()).catch(() => {});
        return;
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      target.setPointerCapture?.(event.pointerId);
    });

    target.addEventListener("pointermove", (event) => {
      if (!this.enabled) return;
      if (event.pointerType === "mouse") {
        if (this.locked) {
          this.onLook(event.movementX * this.mouseSensitivity, this.signedY(event.movementY) * this.mouseSensitivity);
          return;
        }
        // No pointer lock: fall back to click-and-drag looking.
        const held = this.pointers.get(event.pointerId);
        if (!held) return;
        const dx = event.clientX - held.x;
        const dy = event.clientY - held.y;
        held.x = event.clientX;
        held.y = event.clientY;
        this.onLook(dx * this.mouseSensitivity, this.signedY(dy) * this.mouseSensitivity);
        return;
      }
      const last = this.pointers.get(event.pointerId);
      if (!last) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      last.x = event.clientX;
      last.y = event.clientY;
      this.onLook(dx * this.touchSensitivity, this.signedY(dy) * this.touchSensitivity);
    });

    const release = (event) => {
      this.pointers.delete(event.pointerId);
    };
    target.addEventListener("pointerup", release);
    target.addEventListener("pointercancel", release);
    target.addEventListener("pointerleave", release);

    document.addEventListener("pointerlockchange", () => {
      this.onLockChange(this.locked);
    });
  }

  signedY(dy) {
    return this.invertY ? -dy : dy;
  }

  get locked() {
    return document.pointerLockElement === this.target;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.pointers.clear();
    if (this.locked) document.exitPointerLock?.();
  }
}
