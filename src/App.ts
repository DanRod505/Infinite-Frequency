import { AnalysisCache, contentHash } from './audio/AnalysisCache';
import { AnalysisClient } from './audio/AnalysisClient';
import { AudioEngine } from './audio/AudioEngine';
import { mixToMono } from './audio/MusicAnalyzer';
import { SongLibrary } from './audio/SongLibrary';
import { DEMO_TITLE } from './audio/demoTrack';
import type { AnalysisProgress, MusicAnalysis } from './audio/analysisTypes';
import { ANALYZER_VERSION } from './audio/MusicAnalyzer';
import { Settings } from './core/Settings';
import { setUrlSeed } from './core/url';
import { Game, type MusicSource } from './game/Game';
import { Records } from './rhythm/Records';
import { mountMenu } from './ui/menu/MenuRoot';
import { Store } from './ui/menu/store';
import { randomSeed, type MenuActions, type MenuState, type RunSummary, type Screen } from './ui/menu/types';

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MIN_DURATION = 10;
const MAX_DURATION = 20 * 60;

const STAGES: Record<AnalysisProgress['stage'], string> = {
  spectrum: 'Analisando o espectro…',
  onsets: 'Detectando transientes…',
  tempo: 'Estimando o andamento…',
  beats: 'Acompanhando as batidas…',
  structure: 'Identificando seções…',
};

/**
 * Application flow (GDD §10): main menu → song selection → analysis →
 * mode, difficulty and seed → race → results. Owns the menu state and the
 * persistence services, and hands runs to the Game.
 */
export class App {
  private readonly settings = new Settings();
  private readonly audio = new AudioEngine();
  private readonly cache = new AnalysisCache();
  private readonly library = new SongLibrary();
  private readonly records = new Records();
  private client: AnalysisClient | null = null;
  private readonly game: Game;
  private readonly store = new Store<MenuState>({
    screen: 'main',
    returnTo: 'main',
    error: null,
    loading: null,
    ready: null,
    results: null,
    library: [],
    pendingStart: null,
  });
  private prepared: MusicSource | null = null;
  /** Incremented on every load so stale results are ignored after "back". */
  private loadId = 0;

  constructor(container: HTMLElement, private readonly initialSeed: number | null) {
    this.game = new Game(container, this.audio, this.settings, {
      onPauseRequest: () => {
        this.game.pause();
        this.show('pause');
      },
      onResumeRequest: () => {
        // Esc in a sub-screen of the pause menu means "back", handled by the menu.
        if (this.store.get().screen === 'pause') this.resume();
      },
      onFinished: (summary) => this.showResults(summary),
    });
    mountMenu(container, { store: this.store, actions: this.actions, settings: this.settings, records: this.records });
  }

  start(): void {
    this.attract();
    this.game.start();
    void this.refreshLibrary();
  }

  private readonly actions: MenuActions = {
    navigate: (screen) => {
      const current = this.store.get().screen;
      const returnTo = screen === 'settings' || screen === 'howto' ? current : this.store.get().returnTo;
      this.store.set({ screen, returnTo, error: null, pendingStart: screen === 'howto' ? null : this.store.get().pendingStart });
    },
    back: () => {
      const { screen, returnTo } = this.store.get();
      const targets: Partial<Record<Screen, Screen>> = { play: 'main', ready: 'play', loading: 'play', records: 'main', garage: 'main' };
      if (screen === 'ready' || screen === 'loading') this.loadId++;
      this.store.set({ screen: screen === 'settings' || screen === 'howto' ? returnTo : (targets[screen] ?? 'main'), pendingStart: null });
    },
    importFile: (file) => void this.loadFile(file),
    playLibrarySong: (id) => void this.loadLibrarySong(id),
    removeLibrarySong: (id) => void this.library.remove(id).then(() => this.refreshLibrary()),
    playDemo: () => void this.loadDemo(),
    freeDrive: () => this.startRun(this.initialSeed ?? randomSeed(), null),
    start: (seed) => {
      const v = this.settings.values;
      if (v.mode === 'rhythm' && !v.seenTutorial) {
        // First Rhythm Run: explain the game once (GDD Fase 5: "sem assistência").
        this.store.set({ screen: 'howto', returnTo: 'ready', pendingStart: seed });
        return;
      }
      this.startRun(seed, this.prepared);
    },
    confirmHowTo: () => {
      const seed = this.store.get().pendingStart;
      this.settings.update({ seenTutorial: true });
      if (seed !== null) this.startRun(seed, this.prepared);
    },
    resume: () => this.resume(),
    restart: () => {
      this.show('hidden');
      this.game.restart();
    },
    newVariation: () => {
      this.show('hidden');
      const seed = randomSeed();
      setUrlSeed(seed);
      this.game.restart(seed);
    },
    quitToMenu: () => this.goHome(),
    clearRecords: () => this.records.clear(),
  };

  private show(screen: Screen, patch: Partial<MenuState> = {}): void {
    this.store.set({ screen, ...patch });
  }

  private attract(): void {
    this.game.startRun({ seed: randomSeed(), interactive: false });
  }

  /** Back to the menus; with an error, to the song selection where it can be fixed. */
  private goHome(error?: string): void {
    this.loadId++;
    if (this.game.currentRun.interactive) this.attract();
    this.show(error ? 'play' : 'main', { error: error ?? null, pendingStart: null });
  }

  private resume(): void {
    this.show('hidden');
    this.game.resume();
  }

  private startRun(seed: number, music: MusicSource | null): void {
    this.show('hidden', { pendingStart: null });
    setUrlSeed(seed);
    // Creating the audio context here, inside the click, satisfies autoplay policies.
    if (music) this.audio.getContext();
    const v = this.settings.values;
    this.game.startRun({
      seed,
      interactive: true,
      music: music ?? undefined,
      rhythm: music && v.mode === 'rhythm' ? { difficulty: v.difficulty, obstacles: v.obstacles } : undefined,
    });
  }

  private showResults(summary: RunSummary): void {
    const rhythm = summary.rhythm;
    let record = null;
    if (rhythm) {
      const key = Records.key(summary.songId, rhythm.difficulty, rhythm.obstacles && rhythm.difficulty !== 'easy');
      record = this.records.submit(key, {
        title: summary.title,
        score: rhythm.score.score,
        rank: rhythm.score.rank,
        maxCombo: rhythm.score.maxCombo,
        date: Date.now(),
      });
    }
    this.show('results', { results: { summary, record } });
  }

  private async refreshLibrary(): Promise<void> {
    this.store.set({ library: await this.library.list() });
  }

  private setLoading(title: string, status: string, progress: number): void {
    this.show('loading', { loading: { title, status, progress }, error: null });
  }

  private async loadFile(file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) return this.goHome('Arquivo muito grande (máximo de 200 MB).');
    const id = ++this.loadId;
    const title = file.name.replace(/\.[^.]+$/, '');
    this.setLoading(title, 'Lendo o arquivo…', 0);
    try {
      const data = await file.arrayBuffer();
      if (id !== this.loadId) return;
      await this.loadBytes(id, data, title, true);
    } catch (error) {
      this.loadFailed(id, error);
    }
  }

  private async loadLibrarySong(songId: string): Promise<void> {
    const meta = this.store.get().library.find((s) => s.id === songId);
    const id = ++this.loadId;
    const title = meta?.title ?? 'Música';
    this.setLoading(title, 'Carregando da biblioteca…', 0);
    try {
      const data = await this.library.load(songId);
      if (id !== this.loadId) return;
      if (!data) {
        await this.library.remove(songId);
        await this.refreshLibrary();
        return this.goHome('Esta música não está mais disponível na biblioteca. Importe o arquivo novamente.');
      }
      void this.library.touch(songId);
      await this.loadBytes(id, data, title, false);
    } catch (error) {
      this.loadFailed(id, error);
    }
  }

  /** Decode → validate → analyse (or reuse the cache) → ready screen. */
  private async loadBytes(id: number, data: ArrayBuffer, title: string, addToLibrary: boolean): Promise<void> {
    this.setLoading(title, 'Decodificando o áudio…', 0.02);
    const [hash, buffer] = await Promise.all([contentHash(data), this.audio.decode(data)]);
    if (id !== this.loadId) return;
    if (buffer.duration < MIN_DURATION) return this.goHome(`Música muito curta (mínimo de ${MIN_DURATION} s).`);
    if (buffer.duration > MAX_DURATION) return this.goHome('Música muito longa (máximo de 20 minutos).');

    const key = hash ? `v${ANALYZER_VERSION}:${hash}` : null;
    const cached = key ? await this.cache.get(key) : null;
    if (id !== this.loadId) return;
    let analysis: MusicAnalysis | null = cached;
    if (!analysis) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      analysis = await this.analysisClient().analyze(mixToMono(channels), buffer.sampleRate, (p) => {
        if (id === this.loadId) this.setLoading(title, STAGES[p.stage], 0.05 + 0.95 * p.progress);
      });
      if (key) void this.cache.put(key, analysis);
    }
    if (id !== this.loadId) return;

    if (addToLibrary && hash) {
      void this.library.add({ id: hash, title, duration: buffer.duration }, data).then(() => this.refreshLibrary());
    }
    // Content hash identifies the song for records; fall back to name and length.
    const songId = key ?? `file:${title}:${buffer.duration.toFixed(1)}`;
    this.prepared = { buffer, analysis, title, songId };
    this.show('ready', { ready: { title, songId, analysis, seed: this.initialSeed ?? randomSeed(), cached: cached !== null } });
  }

  private loadFailed(id: number, error: unknown): void {
    if (id !== this.loadId) return;
    console.error(error);
    const decodeFailed = error instanceof DOMException || (error instanceof Error && /decod/i.test(error.message));
    this.goHome(
      decodeFailed
        ? 'Não foi possível decodificar este arquivo. Verifique se é um áudio válido em um formato suportado pelo navegador (MP3, WAV, OGG…).'
        : `Falha ao analisar a música: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private async loadDemo(): Promise<void> {
    const id = ++this.loadId;
    this.setLoading(DEMO_TITLE, 'Sintetizando a faixa…', 0);
    try {
      const context = this.audio.getContext();
      const result = await this.analysisClient().demo(context.sampleRate, (p) => {
        if (id === this.loadId) this.setLoading(DEMO_TITLE, STAGES[p.stage], p.progress);
      });
      if (id !== this.loadId) return;
      const buffer = context.createBuffer(1, result.samples.length, result.sampleRate);
      buffer.copyToChannel(result.samples as Float32Array<ArrayBuffer>, 0);
      this.prepared = { buffer, analysis: result.analysis, title: DEMO_TITLE, songId: 'demo:v1' };
      this.show('ready', {
        ready: { title: DEMO_TITLE, songId: 'demo:v1', analysis: result.analysis, seed: this.initialSeed ?? randomSeed(), cached: false },
      });
    } catch (error) {
      if (id !== this.loadId) return;
      console.error(error);
      this.goHome('Não foi possível gerar a faixa de demonstração.');
    }
  }

  private analysisClient(): AnalysisClient {
    this.client ??= new AnalysisClient();
    return this.client;
  }
}
