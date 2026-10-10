/** Minimal DOM overlay for the prototype (GDD §9.3). */
export interface HudStats {
  speed: number;
  distance: number;
  seed: number;
  fps: number;
  chunks: number;
  drawCalls: number;
  triangles: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly hint: HTMLElement;
  private debugVisible = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-speed"><span data-speed>0</span><small>km/h</small></div>
      <div class="hud-distance" data-distance>0 m</div>
      <pre class="hud-debug" data-debug hidden></pre>
      <div class="hud-hint" data-hint>A / D ou ← / → para dirigir · Esc pausa · N nova seed · F3 debug</div>
      <div class="hud-pause" data-pause hidden>
        <h1>Pausado</h1>
        <p>Pressione Esc para continuar</p>
      </div>`;
    container.appendChild(this.root);
    this.speed = this.query('[data-speed]');
    this.distance = this.query('[data-distance]');
    this.debug = this.query('[data-debug]');
    this.pause = this.query('[data-pause]');
    this.hint = this.query('[data-hint]');
    window.setTimeout(() => this.hint.classList.add('hud-hint--hidden'), 6000);
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debug.hidden = !this.debugVisible;
  }

  setPaused(paused: boolean): void {
    this.pause.hidden = !paused;
  }

  update(stats: HudStats): void {
    this.speed.textContent = Math.round(stats.speed * 3.6).toString();
    this.distance.textContent = `${(stats.distance / 1000).toFixed(2)} km`;
    if (this.debugVisible) {
      this.debug.textContent =
        `seed      ${stats.seed}\n` +
        `fps       ${stats.fps.toFixed(0)}\n` +
        `chunks    ${stats.chunks}\n` +
        `draws     ${stats.drawCalls}\n` +
        `triangles ${stats.triangles}`;
    }
  }

  private query(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`HUD element ${selector} missing`);
    return element;
  }
}
