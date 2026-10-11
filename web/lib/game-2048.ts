// Garden 2048 game rules — pure (no db, no DOM, no "@/" alias) so the same
// code runs the board in the browser and replays a submitted game on the
// server (lib/games-server.ts), and is unit-testable under plain node:test.
//
// Determinism is the anti-cheat: a run's seed comes from its server-issued
// id, so the server can replay the submitted move list and compute the score
// itself instead of trusting one sent by the client.

export type Direction = "U" | "D" | "L" | "R";

export const SIZE = 4;
export const WIN_VALUE = 2048;

/** Garden stage names by tile value (2 → 2048); anything bigger is still a forest. */
export const GARDEN_STAGES: Record<number, string> = {
  2: "Seed",
  4: "Sprout",
  8: "Leaf",
  16: "Clover",
  32: "Tulip",
  64: "Blossom",
  128: "Rose",
  256: "Shrub",
  512: "Pine",
  1024: "Fruit",
  2048: "Forest",
};

export function gardenStage(value: number): string {
  return GARDEN_STAGES[value] ?? "Forest";
}

/** FNV-1a: turns a run id into a 32-bit seed. */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and identical in every JS engine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tile = { id: number; value: number };

/**
 * One tile as the UI should draw it after a move. `ghost` tiles are the two
 * halves of a merge sliding into place before they disappear; `merged` is
 * the tile they became; `spawned` is the new tile dropped in after a move.
 */
export type TileView = {
  id: number;
  value: number;
  index: number;
  kind: "static" | "spawned" | "merged" | "ghost";
};

// For each direction: the 4 lines of cell indexes, ordered from the edge
// tiles slide toward.
const LINES: Record<Direction, number[][]> = (() => {
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * SIZE + c));
  const cols = [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * SIZE + c));
  return {
    L: rows,
    R: rows.map((line) => [...line].reverse()),
    U: cols,
    D: cols.map((line) => [...line].reverse()),
  };
})();

export class Game2048 {
  grid: (Tile | null)[] = Array(SIZE * SIZE).fill(null);
  score = 0;
  maxTile = 0;
  /** Every accepted move, in order — exactly what gets submitted for replay. */
  moves = "";
  private nextId = 1;
  private rand: () => number;
  private lastViews: TileView[] = [];

  constructor(seed: number) {
    this.rand = mulberry32(seed);
    const a = this.spawn();
    const b = this.spawn();
    this.lastViews = this.grid.flatMap((tile, index) =>
      tile ? [{ id: tile.id, value: tile.value, index, kind: index === a || index === b ? "spawned" : "static" } as TileView] : [],
    );
  }

  views(): TileView[] {
    return this.lastViews;
  }

  /** Applies a move. A move that changes nothing is rejected (moved: false) and not recorded. */
  move(dir: Direction): { moved: boolean; gained: number } {
    const next: (Tile | null)[] = Array(SIZE * SIZE).fill(null);
    const views: TileView[] = [];
    let moved = false;
    let gained = 0;

    for (const line of LINES[dir]) {
      const tiles = line.flatMap((index) => {
        const tile = this.grid[index];
        return tile ? [{ tile, from: index }] : [];
      });
      let slot = 0;
      for (let i = 0; i < tiles.length; i++) {
        const target = line[slot++];
        const here = tiles[i];
        const after = tiles[i + 1];
        if (after && after.tile.value === here.tile.value) {
          const value = here.tile.value * 2;
          const merged = { id: this.nextId++, value };
          next[target] = merged;
          views.push({ id: here.tile.id, value: here.tile.value, index: target, kind: "ghost" });
          views.push({ id: after.tile.id, value: after.tile.value, index: target, kind: "ghost" });
          views.push({ id: merged.id, value, index: target, kind: "merged" });
          gained += value;
          this.maxTile = Math.max(this.maxTile, value);
          moved = true;
          i++;
        } else {
          next[target] = here.tile;
          views.push({ id: here.tile.id, value: here.tile.value, index: target, kind: "static" });
          if (here.from !== target) moved = true;
        }
      }
    }

    if (!moved) return { moved: false, gained: 0 };
    this.grid = next;
    this.score += gained;
    this.moves += dir;
    const spawned = this.spawn();
    if (spawned !== null) {
      const tile = this.grid[spawned]!;
      views.push({ id: tile.id, value: tile.value, index: spawned, kind: "spawned" });
    }
    this.lastViews = views;
    return { moved: true, gained };
  }

  canMove(): boolean {
    for (let i = 0; i < SIZE * SIZE; i++) {
      const tile = this.grid[i];
      if (!tile) return true;
      const right = i % SIZE < SIZE - 1 ? this.grid[i + 1] : null;
      const below = i + SIZE < SIZE * SIZE ? this.grid[i + SIZE] : null;
      if (right?.value === tile.value || below?.value === tile.value) return true;
    }
    return false;
  }

  private spawn(): number | null {
    const empty: number[] = [];
    this.grid.forEach((tile, index) => {
      if (!tile) empty.push(index);
    });
    if (empty.length === 0) return null;
    const index = empty[Math.floor(this.rand() * empty.length)];
    const value = this.rand() < 0.1 ? 4 : 2;
    this.grid[index] = { id: this.nextId++, value };
    this.maxTile = Math.max(this.maxTile, value);
    return index;
  }
}

/**
 * Replays a submitted game from its seed. `valid` is false if any move is
 * malformed or would not have changed the board (a real client never
 * records those), which means the moves weren't played on this seed.
 */
export function replay2048(seed: number, moves: string): { valid: boolean; score: number; maxTile: number } {
  const game = new Game2048(seed);
  for (const dir of moves) {
    if (dir !== "U" && dir !== "D" && dir !== "L" && dir !== "R") return { valid: false, score: 0, maxTile: 0 };
    if (!game.move(dir).moved) return { valid: false, score: 0, maxTile: 0 };
  }
  return { valid: true, score: game.score, maxTile: game.maxTile };
}
