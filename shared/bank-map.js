// The branch: Bharatiya Jugaad Bank, after hours.
//
// One fixed floor, drawn as a grid. The endless maze this replaced was
// generated; a bank is not — the fun here is learning one building well
// enough to cross it while your manager is not looking.
//
// Like the maze before it, this file knows nothing about three.js or the DOM,
// so the parts that can trap a player (a door that cannot be reached, a boss
// who cannot path to the washroom) are testable in Node.
//
// Everything is in map pixels: 32 to a metre, 24 to a grid cell (0.75m).
// North is -y. The street is north of the shutter.

export const TILE = 24; // map pixels per cell (0.75m)
export const U = 1 / 32; // metres per map pixel
export const WALL_H = 3.0;
export const PLAYER_RADIUS = 11;
export const W = 34;
export const H = 40;

// Cell legend:
//   #  wall
//   .  floor
//   g  glass partition — blocks movement, not sight
//   c  teller counter — waist high: blocks movement, and sight only to
//      someone crouched behind it
//   W  the wooden double doors   (inner)
//   G  the collapsible metal gate (middle) — a grille: never blocks sight
//   S  the rolling shutter       (outer)
function buildGrid() {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => "#"));
  const fill = (x0, y0, x1, y1, ch = ".") => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) grid[y][x] = ch;
  };

  // Front of house, from the street inwards.
  fill(13, 0, 20, 0, "S"); // shutter
  fill(12, 1, 21, 3); // ATM vestibule
  fill(13, 4, 20, 4, "G"); // collapsible gate
  fill(12, 5, 21, 6); // the landing between gate and doors
  fill(15, 7, 18, 7, "W"); // wooden doors

  // Banking hall: customers north of the counter, staff south of it.
  fill(1, 8, 32, 16);
  fill(1, 13, 24, 13, "c");
  fill(27, 13, 32, 13, "c");

  // The office floor, running on from the staff side of the counter.
  fill(1, 17, 32, 30);

  // The manager's cabin: glass on two sides so he can watch the floor, a
  // solid back wall against the corridor, and a doorway facing the desks.
  fill(23, 17, 32, 17, "g");
  fill(23, 17, 23, 28, "g");
  fill(23, 21, 23, 22, "."); // cabin doorway
  fill(23, 28, 32, 28, "#");

  // Back rooms off the rear corridor.
  fill(1, 32, 9, 38); // pantry
  fill(5, 31, 6, 31);
  fill(11, 32, 21, 38); // record room
  fill(15, 31, 16, 31);
  fill(24, 32, 32, 38); // washroom
  fill(26, 31, 27, 31);

  return grid;
}

export const GRID = buildGrid();

// Rooms, for "where is the player" questions: the boss treats someone in his
// cabin very differently from someone at the water cooler.
export const ROOMS = [
  { id: "street", x0: 12, y0: -4, x1: 21, y1: -1 },
  { id: "vestibule", x0: 12, y0: 0, x1: 21, y1: 3 },
  { id: "landing", x0: 12, y0: 4, x1: 21, y1: 7 },
  { id: "cabin", x0: 24, y0: 18, x1: 32, y1: 27 },
  { id: "hall", x0: 1, y0: 8, x1: 32, y1: 16 },
  { id: "pantry", x0: 1, y0: 31, x1: 9, y1: 38 },
  { id: "records", x0: 11, y0: 31, x1: 21, y1: 38 },
  { id: "washroom", x0: 24, y0: 31, x1: 32, y1: 38 },
  { id: "office", x0: 1, y0: 17, x1: 32, y1: 30 },
];

// Furniture, in cells. `tall` things (almirahs, racks, the fridge) block
// sight; everything else is waist high and only hides you if you crouch.
// `solid: false` pieces are drawn but can be walked through (the player's
// own chair — you have to be able to sit in it).
export const FURNITURE = [
  // Front of house
  { id: "atm", type: "atm", x: 12.1, y: 1.1, w: 1, h: 0.9, tall: true },
  { id: "bench-1", type: "bench", x: 3, y: 9.4, w: 3.4, h: 0.8 },
  { id: "bench-2", type: "bench", x: 3, y: 11.2, w: 3.4, h: 0.8 },
  { id: "bench-3", type: "bench", x: 8.4, y: 9.4, w: 3.4, h: 0.8 },
  { id: "reception", type: "reception", x: 24.2, y: 9, w: 3, h: 1.1 },
  { id: "cooler", type: "cooler", x: 31.1, y: 8.2, w: 0.8, h: 0.8, tall: true },
  { id: "coat-stand", type: "coatStand", x: 13.3, y: 8.2, w: 0.6, h: 0.6 },
  { id: "extinguisher", type: "extinguisher", x: 19.6, y: 8.1, w: 0.5, h: 0.45 },
  { id: "plant", type: "plant", x: 1.2, y: 8.2, w: 0.8, h: 0.8 },

  // Staff side of the counter
  { id: "teller-1", type: "tellerDesk", x: 3, y: 14.1, w: 2.4, h: 0.9 },
  { id: "teller-2", type: "tellerDesk", x: 8, y: 14.1, w: 2.4, h: 0.9 },
  { id: "teller-3", type: "tellerDesk", x: 13, y: 14.1, w: 2.4, h: 0.9 },
  { id: "teller-chair-1", type: "chair", x: 3.8, y: 15.3, w: 0.8, h: 0.8 },
  { id: "teller-chair-3", type: "chair", x: 13.8, y: 15.3, w: 0.8, h: 0.8 },
  { id: "stationery", type: "almirah", x: 20.3, y: 14.1, w: 2, h: 0.85, tall: true },

  // Office floor: two rows of three desks. Row B middle is yours.
  { id: "desk-a1", type: "desk", x: 2.5, y: 19, w: 2.4, h: 1.1 },
  { id: "desk-a2", type: "desk", x: 8.5, y: 19, w: 2.4, h: 1.1 },
  { id: "desk-a3", type: "desk", x: 14.5, y: 19, w: 2.4, h: 1.1 },
  { id: "desk-b1", type: "desk", x: 2.5, y: 24, w: 2.4, h: 1.1 },
  { id: "desk-b2", type: "desk", x: 8.5, y: 24, w: 2.4, h: 1.1 },
  { id: "desk-b3", type: "desk", x: 14.5, y: 24, w: 2.4, h: 1.1 },
  { id: "chair-a1", type: "chair", x: 3.3, y: 20.5, w: 0.8, h: 0.8 },
  { id: "chair-a2", type: "chair", x: 9.3, y: 20.5, w: 0.8, h: 0.8 },
  { id: "chair-a3", type: "chair", x: 15.3, y: 20.5, w: 0.8, h: 0.8 },
  { id: "chair-b1", type: "chair", x: 3.3, y: 25.5, w: 0.8, h: 0.8 },
  { id: "chair-b2", type: "chair", x: 9.3, y: 25.5, w: 0.8, h: 0.8, solid: false },
  { id: "chair-b3", type: "chair", x: 15.3, y: 25.5, w: 0.8, h: 0.8 },
  { id: "office-almirah-1", type: "almirah", x: 1.05, y: 17.4, w: 0.85, h: 2, tall: true, facing: "east" },
  { id: "office-almirah-2", type: "almirah", x: 1.05, y: 22, w: 0.85, h: 2, tall: true, facing: "east" },
  { id: "photocopier", type: "photocopier", x: 19.4, y: 17.3, w: 1.4, h: 1 },

  // The cabin
  { id: "boss-desk", type: "bossDesk", x: 26, y: 20.5, w: 1.2, h: 3 },
  { id: "boss-chair", type: "bossChair", x: 27.9, y: 21.5, w: 1, h: 1, solid: false },
  { id: "visitor-chair", type: "chair", x: 24.8, y: 24.6, w: 0.8, h: 0.8 },
  { id: "boss-almirah", type: "almirah", x: 31.9, y: 18.1, w: 0.95, h: 2.2, tall: true, facing: "west" },
  { id: "filing-cabinet", type: "filing", x: 31.95, y: 25.2, w: 0.9, h: 1.6, facing: "west" },

  // Pantry
  { id: "pantry-counter", type: "pantryCounter", x: 1.05, y: 32.4, w: 0.95, h: 4 },
  { id: "fridge", type: "fridge", x: 8.1, y: 32.1, w: 0.9, h: 0.95, tall: true },
  { id: "pantry-table", type: "table", x: 3.6, y: 35, w: 2, h: 1.3 },
  { id: "pantry-bin", type: "bin", x: 8.3, y: 37.8, w: 0.6, h: 0.6 },

  // Record room
  { id: "rack-1", type: "rack", x: 11.2, y: 32.9, w: 3.6, h: 0.8, tall: true },
  { id: "rack-2", type: "rack", x: 11.2, y: 35, w: 3.6, h: 0.8, tall: true },
  { id: "rack-3", type: "rack", x: 11.2, y: 37.1, w: 3.6, h: 0.8, tall: true },
  { id: "record-almirah", type: "almirah", x: 20.1, y: 32.1, w: 0.9, h: 2, tall: true, facing: "west" },

  // Washroom
  { id: "sinks", type: "sinks", x: 24.1, y: 33.4, w: 0.7, h: 2.2 },
  { id: "urinal", type: "urinal", x: 32.55, y: 35.5, w: 0.45, h: 0.9 },
  { id: "wc", type: "wc", x: 31.9, y: 32.2, w: 1.05, h: 1.1 },
  { id: "broom-corner", type: "broomCorner", x: 24.15, y: 37.5, w: 0.6, h: 0.5 },
];

// Where people and things are, in cells. Converted to map pixels below.
const SPOTS_CELLS = {
  playerChair: [9.7, 25.9],
  bossChair: [28.4, 22],
  cabinDoorIn: [24.6, 22],
  cabinDoorOut: [22.1, 22],
  deskCheck: [9.7, 27.9],
  hallDoors: [16.9, 9.9],
  counterGap: [25.95, 13],
  washroomDoor: [26.95, 30.2],
  urinal: [31.7, 35.95],
  street: [16.5, -1.2],
};

export const SPOTS = Object.fromEntries(
  Object.entries(SPOTS_CELLS).map(([key, [x, y]]) => [key, { x: x * TILE, y: y * TILE }]),
);

// The routes the boss walks, as cell waypoints. Paths between them are found
// on the grid, so these only need to say *where he goes*, not how.
export const ROUTES = {
  round: [
    [22.1, 22], [19.5, 27.9],
    { at: [9.7, 27.9], action: "checkDesk" },
    [12.5, 22.8], [19.9, 16.6], [25.95, 15.4], [25.95, 12.2],
    { at: [16.9, 9.9], action: "checkDoors", face: -Math.PI / 2 },
    [25.95, 11.4], [25.95, 15.4], [22.1, 22],
  ],
  washroom: [
    [22.1, 22], [21, 28.6], [26.95, 30.2],
    { at: [31.7, 35.95], action: "pee", face: 0 },
    [26.95, 30.2],
    { at: [9.7, 27.9], action: "checkDesk" },
    [22.1, 22],
  ],
  // Where he looks when he is hunting for you and has nothing better to go on.
  search: [
    [12.5, 22.8], [5.5, 27.9], [19.5, 27.9], [5, 35.5], [17.5, 35.2], [26.5, 33.5],
    [20, 10.6], [8, 16.4], [19.9, 18.6], [6, 22.8],
  ],
};

export function cellPoint([x, y]) {
  return { x: x * TILE, y: y * TILE };
}

export function roomAt(x, y) {
  const cx = x / TILE;
  const cy = y / TILE;
  for (const room of ROOMS) {
    if (cx >= room.x0 && cx < room.x1 + 1 && cy >= room.y0 && cy < room.y1 + 1) return room.id;
  }
  return null;
}

// ------------------------------------------------------------------- queries

export class BankMap {
  constructor() {
    this.grid = GRID;
    this.doors = { wooden: false, gate: false, shutter: false }; // true = open
    // The shutter only goes up half way: you crawl out under it.
    this.furniture = FURNITURE.map((f) => ({
      ...f,
      px: { x0: f.x * TILE, y0: f.y * TILE, x1: (f.x + f.w) * TILE, y1: (f.y + f.h) * TILE },
    }));
    // Per-cell furniture occupancy, for sight lines and path finding.
    this.cover = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    for (const f of this.furniture) {
      // Shrunk a touch so a piece that merely brushes a cell does not claim it.
      const x0 = Math.floor(f.x + 0.08);
      const y0 = Math.floor(f.y + 0.08);
      const x1 = Math.floor(f.x + f.w - 0.08);
      const y1 = Math.floor(f.y + f.h - 0.08);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (y < 0 || y >= H || x < 0 || x >= W) continue;
          const prev = this.cover[y][x];
          const kind = f.tall ? "tall" : f.solid === false ? "soft" : "low";
          if (prev === "tall") continue;
          if (prev === "low" && kind === "soft") continue;
          this.cover[y][x] = kind;
        }
      }
    }
  }

  setDoorOpen(id, open) {
    this.doors[id] = Boolean(open);
  }

  cell(tx, ty) {
    if (ty < 0 && tx >= 13 && tx <= 20 && ty >= -4) return "street";
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return "#";
    return this.grid[ty][tx];
  }

  // Can a body stand in this cell at all (ignoring furniture)?
  blocksMove(tx, ty) {
    const ch = this.cell(tx, ty);
    switch (ch) {
      case ".":
        return false;
      case "street":
        return !this.doors.shutter;
      case "W":
        return !this.doors.wooden;
      case "G":
        return !this.doors.gate;
      case "S":
        return !this.doors.shutter;
      default:
        return true;
    }
  }

  // Does this cell stop someone seeing through it? `crouched` means the
  // person being looked for is keeping their head below desk height.
  blocksSight(tx, ty, crouched) {
    const ch = this.cell(tx, ty);
    if (ch === "#") return true;
    if (ch === "W") return !this.doors.wooden;
    if (ch === "S") return !this.doors.shutter;
    if (ch === "c" && crouched) return true;
    if (ty >= 0 && ty < H && tx >= 0 && tx < W) {
      const cover = this.cover[ty][tx];
      if (cover === "tall") return true;
      if (cover === "low" && crouched) return true;
    }
    return false;
  }

  // Collision in map pixels: walls, closed doors and solid furniture.
  isBlocked(x, y, radius = PLAYER_RADIUS) {
    const minCol = Math.floor((x - radius) / TILE);
    const maxCol = Math.floor((x + radius) / TILE);
    const minRow = Math.floor((y - radius) / TILE);
    const maxRow = Math.floor((y + radius) / TILE);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (!this.blocksMove(col, row)) continue;
        if (circleHitsRect(x, y, radius, col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE)) return true;
      }
    }
    for (const f of this.furniture) {
      if (f.solid === false) continue;
      const r = f.px;
      if (circleHitsRect(x, y, radius, r.x0, r.y0, r.x1, r.y1)) return true;
    }
    return false;
  }

  // Sight line from an observer to a target. Low cover only counts away from
  // the observer — his own desk does not hide the office from him.
  hasLineOfSight(ax, ay, bx, by, { crouched = false } = {}) {
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / (TILE * 0.33)));
    const ownCover = 1.25 * TILE;
    let lastCol = null;
    let lastRow = null;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const col = Math.floor((ax + (bx - ax) * t) / TILE);
      const row = Math.floor((ay + (by - ay) * t) / TILE);
      if (col === lastCol && row === lastRow) continue;
      lastCol = col;
      lastRow = row;
      const nearObserver = t * length < ownCover;
      if (this.blocksSight(col, row, crouched && !nearObserver)) return false;
    }
    return true;
  }

  // A body of `radius` can walk between two points in a straight line.
  canWalkStraight(ax, ay, bx, by, radius) {
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / 6));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (this.isBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, radius)) return false;
    }
    return true;
  }

  // A cell the boss can walk through: no wall, no closed door, no furniture.
  walkableCell(tx, ty) {
    if (this.blocksMove(tx, ty)) return false;
    if (ty < 0 || ty >= H || tx < 0 || tx >= W) return this.cell(tx, ty) === "street";
    const cover = this.cover[ty][tx];
    return cover === null || cover === "soft";
  }

  // A* over the cell grid. Cells next to walls cost more, so a wide body keeps
  // to the middle of an aisle rather than scraping along the desks. If the
  // goal cannot be reached (a locked door in the way) the path ends at the
  // reachable cell nearest to it. Returns map-pixel points, first to last,
  // smoothed so a straight walk is a straight line.
  findPath(ax, ay, bx, by, radius = 14) {
    const start = this.nearestWalkable(Math.floor(ax / TILE), Math.floor(ay / TILE));
    const goal = this.nearestWalkable(Math.floor(bx / TILE), Math.floor(by / TILE));
    if (!start || !goal) return [{ x: bx, y: by }];
    const key = (x, y) => (y + 8) * (W + 16) + (x + 8);
    const open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
    const came = new Map();
    const cost = new Map([[key(start.x, start.y), 0]]);
    const h = (x, y) => Math.hypot(goal.x - x, goal.y - y);
    let best = { x: start.x, y: start.y, d: h(start.x, start.y) };
    let found = false;
    let guard = 0;
    while (open.length && guard < 6000) {
      guard += 1;
      let bi = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
      const node = open.splice(bi, 1)[0];
      if (node.x === goal.x && node.y === goal.y) {
        found = true;
        break;
      }
      const d = h(node.x, node.y);
      if (d < best.d) best = { x: node.x, y: node.y, d };
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = node.x + dx;
          const ny = node.y + dy;
          if (!this.walkableCell(nx, ny)) continue;
          // No cutting corners past a wall.
          if (dx && dy && (!this.walkableCell(node.x + dx, node.y) || !this.walkableCell(node.x, node.y + dy))) continue;
          const step = (dx && dy ? Math.SQRT2 : 1) + this.crowding(nx, ny);
          const g = node.g + step;
          const k = key(nx, ny);
          if (cost.has(k) && cost.get(k) <= g) continue;
          cost.set(k, g);
          came.set(k, node);
          open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
        }
      }
    }
    const end = found ? goal : best;
    const cells = [];
    let cur = { x: end.x, y: end.y };
    while (cur) {
      cells.push(cur);
      if (cur.x === start.x && cur.y === start.y) break;
      cur = came.get(key(cur.x, cur.y));
    }
    cells.reverse();
    const points = cells.map((c) => ({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE }));
    if (found) points.push({ x: bx, y: by });
    return this.smooth([{ x: ax, y: ay }, ...points], radius).slice(1);
  }

  crowding(tx, ty) {
    let blocked = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if ((dx || dy) && !this.walkableCell(tx + dx, ty + dy)) blocked += 1;
      }
    }
    return blocked * 0.35;
  }

  smooth(points, radius) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    let anchor = 0;
    for (let i = 2; i < points.length; i += 1) {
      const a = points[anchor];
      const b = points[i];
      if (!this.canWalkStraight(a.x, a.y, b.x, b.y, radius * 0.8)) {
        out.push(points[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  nearestWalkable(tx, ty) {
    for (let ring = 0; ring < 8; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (ring && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          if (this.walkableCell(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }
}

function circleHitsRect(x, y, r, x0, y0, x1, y1) {
  const cx = Math.max(x0, Math.min(x, x1));
  const cy = Math.max(y0, Math.min(y, y1));
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

// For eyeballing the layout from a terminal: node -e "import('./shared/bank-map.js').then(m=>console.log(m.asciiMap()))"
export function asciiMap() {
  const map = new BankMap();
  return map.grid
    .map((row, y) =>
      row
        .map((ch, x) => {
          if (ch !== ".") return ch;
          const cover = map.cover[y][x];
          return cover === "tall" ? "T" : cover === "low" ? "l" : cover === "soft" ? "s" : ".";
        })
        .join(""),
    )
    .join("\n");
}
