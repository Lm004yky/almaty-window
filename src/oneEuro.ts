// One Euro Filter (Casiez et al. 2012): сильно давит шум в покое,
// открывается на быстром движении.

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(private minCutoff: number, private beta: number, private dCutoff: number) {}

  filter(value: number, timeMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = timeMs;
      return value;
    }
    const dt = Math.max(1e-3, (timeMs - this.t) / 1000);
    this.t = timeMs;
    const dRaw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}
