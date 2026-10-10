/** Minimal in-race overlay (GDD §9.3): must never obstruct the road. */
export interface HudStats {
  speed: number;
  distance: number;
  /** Song progress in [0, 1], or null without music. */
  progress: number | null;
  /** Beat pulse in [0, 1] for the beat indicator. */
  beatPulse: number;
  bpm: number;
  /** Seconds left before the song starts (lead-in), or 0. */
  countdown: number;
  debug: Record<string, string>;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly title: HTMLElement;
  private readonly beat: HTMLElement;
  private readonly beatDot: HTMLElement;
  private readonly bpm: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly toast: HTMLElement;
  private debugVisible = false;
  private toastTimer = 0;
  private hintTimer = 0;
  private lastCountdown = -1;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-progress" data-progress hidden><div data-progress-bar></div></div>
      <div class="hud-title" data-title></div>
      <div class="hud-beat" data-beat hidden><span data-beat-dot></span><span data-bpm></span></div>
      <div class="hud-speed"><span data-speed>0</span><small>km/h</small></div>
      <div class="hud-distance" data-distance>0 m</div>
      <div class="hud-countdown" data-countdown hidden></div>
      <div class="hud-toast" data-toast hidden></div>
      <pre class="hud-debug" data-debug hidden></pre>
      <div class="hud-hint hud-hint--hidden" data-hint></div>`;
    container.appendChild(this.root);
    const q = (selector: string) => {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`HUD element ${selector} missing`);
      return element;
    };
    this.speed = q('[data-speed]');
    this.distance = q('[data-distance]');
    this.debug = q('[data-debug]');
    this.hint = q('[data-hint]');
    this.progress = q('[data-progress]');
    this.progressBar = q('[data-progress-bar]');
    this.title = q('[data-title]');
    this.beat = q('[data-beat]');
    this.beatDot = q('[data-beat-dot]');
    this.bpm = q('[data-bpm]');
    this.countdown = q('[data-countdown]');
    this.toast = q('[data-toast]');
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hud--hidden', !visible);
  }

  /** Configures the HUD for a run. */
  setRun(title: string | null, interactive: boolean): void {
    this.title.textContent = title ?? '';
    this.progress.hidden = title === null;
    this.beat.hidden = title === null;
    this.countdown.hidden = true;
    this.lastCountdown = -1;
    if (interactive) {
      this.hint.textContent =
        title === null
          ? 'A / D ou ← / → para dirigir · Esc pausa · N nova pista · F3 debug'
          : 'A / D ou ← / → para dirigir · Esc pausa · [ ] ajustam a latência · F3 debug';
      this.hint.classList.remove('hud-hint--hidden');
      window.clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => this.hint.classList.add('hud-hint--hidden'), 6000);
    } else {
      this.hint.classList.add('hud-hint--hidden');
    }
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debug.hidden = !this.debugVisible;
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 1500);
  }

  update(stats: HudStats): void {
    this.speed.textContent = Math.round(stats.speed * 3.6).toString();
    this.distance.textContent = `${(stats.distance / 1000).toFixed(2)} km`;

    if (stats.progress !== null) {
      this.progressBar.style.width = `${(stats.progress * 100).toFixed(2)}%`;
      this.beatDot.style.transform = `scale(${(0.6 + 0.8 * stats.beatPulse).toFixed(3)})`;
      this.beatDot.style.opacity = (0.35 + 0.65 * stats.beatPulse).toFixed(3);
      this.bpm.textContent = stats.bpm > 0 ? `${Math.round(stats.bpm)} BPM` : '';
    }

    const count = stats.countdown > 0 ? Math.ceil(stats.countdown) : 0;
    if (count !== this.lastCountdown) {
      this.lastCountdown = count;
      this.countdown.hidden = count === 0;
      this.countdown.textContent = String(count);
      // Restart the pop animation on every number.
      this.countdown.classList.remove('hud-countdown--pop');
      void this.countdown.offsetWidth;
      this.countdown.classList.add('hud-countdown--pop');
    }

    if (this.debugVisible) {
      const width = Math.max(...Object.keys(stats.debug).map((k) => k.length));
      this.debug.textContent = Object.entries(stats.debug)
        .map(([key, value]) => `${key.padEnd(width)}  ${value}`)
        .join('\n');
    }
  }
}
