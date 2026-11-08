export type VisionUnit = { x: number; y: number };
export type TowerVision = VisionUnit & { range: number };
export type FogState = 0 | 1 | 2; // unexplored, explored, currently visible

const SAMPLES_PER_TILE = 4;
export const INFANTRY_VISION = 5.5;
export const ENGINEER_VISION = 4.5;

/** Persistent ground exploration plus a fresh ring of vision around living troops and completed towers. */
export class FogOfWar {
  readonly width: number;
  readonly height: number;
  readonly explored: Uint8Array;
  readonly visible: Uint8Array;

  constructor(mapWidth: number, mapHeight: number) {
    this.width = mapWidth * SAMPLES_PER_TILE;
    this.height = mapHeight * SAMPLES_PER_TILE;
    this.explored = new Uint8Array(this.width * this.height);
    this.visible = new Uint8Array(this.width * this.height);
  }

  /** Reveal the initial drop-scan area before any ground units have landed. */
  revealArea(x: number, y: number, radius: number) {
    this.reveal(x, y, radius);
  }

  update(infantry: VisionUnit[], engineers: VisionUnit[], towers: TowerVision[] = []) {
    this.visible.fill(0);
    for (const p of infantry) this.reveal(p.x, p.y, INFANTRY_VISION);
    for (const e of engineers) this.reveal(e.x, e.y, ENGINEER_VISION);
    for (const t of towers) this.reveal(t.x, t.y, t.range);
  }

  private reveal(x: number, y: number, radius: number) {
    const minX = Math.max(0, Math.floor((x - radius) * SAMPLES_PER_TILE));
    const maxX = Math.min(this.width - 1, Math.ceil((x + radius) * SAMPLES_PER_TILE));
    const minY = Math.max(0, Math.floor((y - radius) * SAMPLES_PER_TILE));
    const maxY = Math.min(this.height - 1, Math.ceil((y + radius) * SAMPLES_PER_TILE));
    const rr = radius * radius;
    for (let sy = minY; sy <= maxY; sy++) for (let sx = minX; sx <= maxX; sx++) {
      const wx = (sx + 0.5) / SAMPLES_PER_TILE, wy = (sy + 0.5) / SAMPLES_PER_TILE;
      if ((wx - x) ** 2 + (wy - y) ** 2 > rr) continue;
      const i = sy * this.width + sx;
      this.visible[i] = 1;
      this.explored[i] = 1;
    }
  }

  stateAt(x: number, y: number, satellite: boolean): FogState {
    if (satellite) return 2;
    const sx = Math.floor(x * SAMPLES_PER_TILE), sy = Math.floor(y * SAMPLES_PER_TILE);
    if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) return 0;
    const i = sy * this.width + sx;
    return this.visible[i] ? 2 : this.explored[i] ? 1 : 0;
  }
}
