import { LATENCY_LIMIT_MS, type Settings, type SettingsData } from '../core/Settings';
import type { MusicAnalysis } from '../audio/analysisTypes';
import type { RecordEntry } from '../rhythm/Records';
import type { RunScore } from '../rhythm/ScoreKeeper';
import { DIFFICULTY_LABELS, type Difficulty, type GameMode } from '../rhythm/types';

export interface MenuActions {
  onFile(file: File): void;
  onDemo(): void;
  onFreeDrive(): void;
  onStart(seed: number): void;
  onBack(): void;
  onResume(): void;
  onRestart(): void;
  onNewVariation(): void;
  onQuitToMenu(): void;
}

export interface RunSummary {
  title: string;
  duration: number;
  distance: number;
  bpm: number;
  seed: number;
  songId: string;
  /** Present for Rhythm Run. */
  rhythm?: { difficulty: Difficulty; obstacles: boolean; score: RunScore };
}

export interface RecordInfo {
  previous: RecordEntry | null;
  isNewBest: boolean;
}

type Screen = 'home' | 'loading' | 'ready' | 'pause' | 'results';

/**
 * DOM menus for the music flow (GDD §10). Plain DOM for now; React is
 * planned for the full menus of Phase 5.
 */
export class Menu {
  private readonly root: HTMLElement;
  private readonly screens = new Map<Screen, HTMLElement>();
  private readonly fileInput: HTMLInputElement;
  private readonly seedInput: HTMLInputElement;

  constructor(
    container: HTMLElement,
    private readonly actions: MenuActions,
    private readonly settings: Settings,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = TEMPLATE;
    container.appendChild(this.root);

    for (const screen of ['home', 'loading', 'ready', 'pause', 'results'] as Screen[]) {
      this.screens.set(screen, this.el(`[data-screen="${screen}"]`));
    }
    this.fileInput = this.el<HTMLInputElement>('[data-file]');
    this.seedInput = this.el<HTMLInputElement>('[data-seed]');

    this.root.addEventListener('click', this.onClick);
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) this.actions.onFile(file);
    });
    this.setupDropZone();
    for (const panel of this.root.querySelectorAll<HTMLElement>('[data-settings]')) this.setupSettings(panel);
    this.setupRunOptions();
  }

  hide(): void {
    this.root.hidden = true;
    // Return keyboard focus to the game; a focused menu button would swallow the steering keys.
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  showHome(error?: string): void {
    const message = this.el('[data-error]');
    message.textContent = error ?? '';
    message.hidden = !error;
    this.show('home');
  }

  showLoading(title: string, status: string, progress: number): void {
    this.el('[data-loading-title]').textContent = title;
    this.updateLoading(status, progress);
    this.show('loading');
  }

  updateLoading(status: string, progress: number): void {
    this.el('[data-loading-status]').textContent = status;
    this.el('[data-loading-bar]').style.width = `${Math.round(progress * 100)}%`;
  }

  showReady(title: string, analysis: MusicAnalysis, seed: number, cached: boolean): void {
    this.el('[data-ready-title]').textContent = title;
    const tempo = analysis.tempo.reliable
      ? `${analysis.tempo.bpm.toFixed(1)} BPM <small>(estimado · confiança ${Math.round(analysis.tempo.confidence * 100)}%)</small>`
      : 'Pulso não identificado <small>(usando transientes)</small>';
    const levels = { low: 'calma', mid: 'média', high: 'intensa' };
    this.el('[data-ready-details]').innerHTML = `
      <dt>Duração</dt><dd>${formatTime(analysis.duration)}</dd>
      <dt>Andamento</dt><dd>${tempo}</dd>
      <dt>Batidas</dt><dd>${analysis.beats.length}</dd>
      <dt>Seções</dt><dd>${analysis.sections.map((s) => levels[s.level]).join(' → ')}</dd>
      <dt>Drops</dt><dd>${analysis.drops.length > 0 ? analysis.drops.map(formatTime).join(', ') : 'nenhum'} <small>(estimado)</small></dd>
      ${cached ? '<dt>Análise</dt><dd>recuperada do cache</dd>' : ''}`;
    this.seedInput.value = String(seed);
    this.show('ready');
  }

  showPause(): void {
    this.show('pause');
  }

  showResults(summary: RunSummary, record: RecordInfo | null): void {
    this.el('[data-results-title]').textContent = summary.title;
    const scorePanel = this.el('[data-results-score]');
    const rhythm = summary.rhythm;
    const rows: string[] = [];
    if (rhythm) {
      const r = rhythm.score;
      scorePanel.hidden = false;
      const rank = this.el('[data-rank]');
      rank.textContent = r.rank;
      rank.dataset.rank = r.rank;
      this.el('[data-points]').textContent = r.score.toLocaleString('pt-BR');
      const recordLine = this.el('[data-record]');
      if (record?.isNewBest) recordLine.textContent = record.previous ? `Novo recorde! (anterior: ${record.previous.score.toLocaleString('pt-BR')})` : 'Primeiro recorde!';
      else if (record?.previous) recordLine.textContent = `Recorde: ${record.previous.score.toLocaleString('pt-BR')} (${record.previous.rank})`;
      else recordLine.textContent = '';
      recordLine.classList.toggle('results-record--new', Boolean(record?.isNewBest));
      rows.push(
        `<dt>Dificuldade</dt><dd>${DIFFICULTY_LABELS[rhythm.difficulty]}${rhythm.obstacles && rhythm.difficulty !== 'easy' ? ' · com obstáculos' : ''}</dd>`,
        `<dt>Notas</dt><dd>${r.collected} / ${r.totalNotes} <small>(${percent(r.totalNotes > 0 ? r.collected / r.totalNotes : 0)})</small></dd>`,
        `<dt>Perfeitas</dt><dd>${r.perfects}</dd>`,
        `<dt>Maior combo</dt><dd>${r.maxCombo}</dd>`,
        `<dt>Precisão</dt><dd>${percent(r.precision)} <small>(estimada)</small></dd>`,
        `<dt>Colisões</dt><dd>${r.obstaclesHit}</dd>`,
      );
    } else {
      scorePanel.hidden = true;
    }
    rows.push(
      `<dt>Duração</dt><dd>${formatTime(summary.duration)}</dd>`,
      `<dt>Distância</dt><dd>${(summary.distance / 1000).toFixed(2)} km</dd>`,
      `<dt>Andamento</dt><dd>${summary.bpm > 0 ? `${summary.bpm.toFixed(1)} BPM` : '—'}</dd>`,
      `<dt>Seed</dt><dd>${summary.seed}</dd>`,
    );
    this.el('[data-results-details]').innerHTML = rows.join('');
    this.show('results');
  }

  /** Shows the best score for the current song and options on the ready screen. */
  setReadyRecord(entry: RecordEntry | null): void {
    this.el('[data-ready-record]').textContent = entry ? `Recorde: ${entry.score.toLocaleString('pt-BR')} (${entry.rank})` : '';
  }

  private show(screen: Screen): void {
    this.root.hidden = false;
    for (const [name, element] of this.screens) element.hidden = name !== screen;
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'choose-file':
        this.fileInput.click();
        break;
      case 'demo':
        this.actions.onDemo();
        break;
      case 'free-drive':
        this.actions.onFreeDrive();
        break;
      case 'start': {
        const seed = Number.parseInt(this.seedInput.value, 10);
        this.actions.onStart(Number.isFinite(seed) && seed >= 0 ? seed >>> 0 : randomSeed());
        break;
      }
      case 'random-seed':
        this.seedInput.value = String(randomSeed());
        break;
      case 'back':
        this.actions.onBack();
        break;
      case 'resume':
        this.actions.onResume();
        break;
      case 'restart':
        this.actions.onRestart();
        break;
      case 'new-variation':
        this.actions.onNewVariation();
        break;
      case 'menu':
        this.actions.onQuitToMenu();
        break;
    }
  };

  private setupDropZone(): void {
    const zone = this.el('[data-dropzone]');
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('dropzone--active');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dropzone--active'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('dropzone--active');
      const file = event.dataTransfer?.files[0];
      if (file) this.actions.onFile(file);
    });
  }

  /** Mode, difficulty and obstacles on the ready screen, persisted with the settings. */
  private setupRunOptions(): void {
    const panel = this.el('[data-run-options]');
    const inputs = panel.querySelectorAll<HTMLInputElement>('input[name]');
    const render = (data: Readonly<SettingsData>) => {
      for (const input of inputs) {
        if (input.name === 'mode') input.checked = input.value === data.mode;
        else if (input.name === 'difficulty') input.checked = input.value === data.difficulty;
        else if (input.name === 'obstacles') {
          input.checked = data.obstacles;
          input.disabled = data.difficulty === 'easy';
        }
      }
      for (const element of panel.querySelectorAll<HTMLElement>('[data-rhythm-only]')) element.hidden = data.mode !== 'rhythm';
      this.onRunOptionsChange?.();
    };
    for (const input of inputs) {
      input.addEventListener('change', () => {
        if (input.name === 'mode') this.settings.update({ mode: input.value as GameMode });
        else if (input.name === 'difficulty') this.settings.update({ difficulty: input.value as Difficulty });
        else if (input.name === 'obstacles') this.settings.update({ obstacles: input.checked });
      });
    }
    render(this.settings.values);
    this.settings.subscribe(render);
  }

  /** Called when mode, difficulty or obstacles change (to refresh the record line). */
  onRunOptionsChange: (() => void) | null = null;

  private setupSettings(panel: HTMLElement): void {
    panel.innerHTML = SETTINGS_TEMPLATE;
    const inputs = panel.querySelectorAll<HTMLInputElement>('input[name]');
    const render = (data: Readonly<SettingsData>) => {
      for (const input of inputs) {
        const key = input.name as keyof SettingsData;
        if (input.type === 'checkbox') input.checked = Boolean(data[key]);
        else input.value = String(key === 'volume' || key === 'effects' ? Math.round((data[key] as number) * 100) : data[key]);
      }
      panel.querySelector('[data-latency-value]')!.textContent = `${data.latencyMs > 0 ? '+' : ''}${data.latencyMs} ms`;
    };
    for (const input of inputs) {
      input.addEventListener('input', () => {
        const key = input.name as keyof SettingsData;
        if (input.type === 'checkbox') this.settings.update({ [key]: input.checked });
        else if (key === 'volume' || key === 'effects') this.settings.update({ [key]: Number(input.value) / 100 });
        else this.settings.update({ [key]: Number(input.value) });
      });
    }
    render(this.settings.values);
    this.settings.subscribe(render);
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Menu element ${selector} missing`);
    return element;
  }
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SETTINGS_TEMPLATE = `
  <label>Volume <input type="range" name="volume" min="0" max="100" step="1" /></label>
  <label>Latência <span data-latency-value></span>
    <input type="range" name="latencyMs" min="${-LATENCY_LIMIT_MS}" max="${LATENCY_LIMIT_MS}" step="5" />
    <small>Se as pulsações parecerem adiantadas em relação ao som, aumente. Durante a corrida: [ e ].</small>
  </label>
  <label>Intensidade dos efeitos <input type="range" name="effects" min="0" max="100" step="5" /></label>
  <label class="check"><input type="checkbox" name="reduceFlashes" /> Reduzir flashes</label>
  <label class="check"><input type="checkbox" name="cameraShake" /> Tremor de câmera</label>
  <label class="check"><input type="checkbox" name="bloom" /> Brilho neon (bloom) <small>— desligue se o jogo ficar lento</small></label>`;

const TEMPLATE = `
  <section class="menu-card" data-screen="home">
    <h1 class="menu-title">Infinite <span>Frequency</span></h1>
    <p class="menu-subtitle">Transforme sua música em uma viagem.</p>
    <div class="dropzone" data-dropzone>
      <p>Arraste um arquivo de áudio aqui</p>
      <button class="primary" data-action="choose-file">Escolher música</button>
      <small>MP3, WAV, OGG… (o que o navegador decodificar). O arquivo não sai do seu computador.</small>
      <input type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac" data-file hidden />
    </div>
    <p class="menu-error" data-error hidden></p>
    <div class="menu-row">
      <button data-action="demo">Faixa de demonstração</button>
      <button data-action="free-drive">Dirigir sem música</button>
    </div>
    <details class="menu-settings"><summary>Configurações</summary><div data-settings></div></details>
  </section>

  <section class="menu-card" data-screen="loading" hidden>
    <h2 data-loading-title></h2>
    <p data-loading-status></p>
    <div class="progress"><div data-loading-bar></div></div>
  </section>

  <section class="menu-card" data-screen="ready" hidden>
    <h2 data-ready-title></h2>
    <dl class="menu-details" data-ready-details></dl>
    <div class="run-options" data-run-options>
      <fieldset class="segmented">
        <legend>Modo</legend>
        <label><input type="radio" name="mode" value="rhythm" /><span>Rhythm Run<small>notas, combos e pontuação</small></span></label>
        <label><input type="radio" name="mode" value="free" /><span>Free Ride<small>só a música e a estrada</small></span></label>
      </fieldset>
      <fieldset class="segmented" data-rhythm-only>
        <legend>Dificuldade</legend>
        <label><input type="radio" name="difficulty" value="easy" /><span>Fácil</span></label>
        <label><input type="radio" name="difficulty" value="normal" /><span>Normal</span></label>
        <label><input type="radio" name="difficulty" value="hard" /><span>Difícil</span></label>
      </fieldset>
      <label class="check" data-rhythm-only data-obstacles-option><input type="checkbox" name="obstacles" /> Obstáculos <small>(Normal e Difícil)</small></label>
      <p class="record-line" data-ready-record></p>
    </div>
    <label class="seed">Seed do percurso
      <span><input type="number" min="0" step="1" data-seed /><button data-action="random-seed" title="Seed aleatória">🎲</button></span>
    </label>
    <div class="menu-row">
      <button data-action="back">Voltar</button>
      <button class="primary" data-action="start">Iniciar corrida</button>
    </div>
  </section>

  <section class="menu-card" data-screen="pause" hidden>
    <h2>Pausado</h2>
    <div class="menu-row">
      <button class="primary" data-action="resume">Continuar</button>
      <button data-action="restart">Reiniciar</button>
      <button data-action="menu">Menu principal</button>
    </div>
    <details class="menu-settings" open><summary>Configurações</summary><div data-settings></div></details>
  </section>

  <section class="menu-card" data-screen="results" hidden>
    <h2>Música concluída</h2>
    <p class="menu-subtitle" data-results-title></p>
    <div class="results-score" data-results-score hidden>
      <div class="rank" data-rank></div>
      <div>
        <div class="results-points" data-points></div>
        <div class="results-record" data-record></div>
      </div>
    </div>
    <dl class="menu-details" data-results-details></dl>
    <div class="menu-row">
      <button class="primary" data-action="restart">Repetir percurso</button>
      <button data-action="new-variation">Nova variação</button>
      <button data-action="menu">Outra música</button>
    </div>
  </section>`;
