import { AnalysisCache } from './audio/AnalysisCache';
import { AnalysisClient } from './audio/AnalysisClient';
import { AudioEngine } from './audio/AudioEngine';
import { mixToMono } from './audio/MusicAnalyzer';
import { DEMO_TITLE } from './audio/demoTrack';
import type { AnalysisProgress } from './audio/analysisTypes';
import { Settings } from './core/Settings';
import { setUrlSeed } from './core/url';
import { Game, type MusicSource } from './game/Game';
import { Records } from './rhythm/Records';
import { Menu, randomSeed, type RunSummary } from './ui/Menu';

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
 * Application flow (GDD §10.2): import or pick a song → analysis → choose
 * the seed → race → results. Owns the menus and hands runs to the Game.
 */
export class App {
  private readonly settings = new Settings();
  private readonly audio = new AudioEngine();
  private readonly cache = new AnalysisCache();
  private readonly records = new Records();
  private client: AnalysisClient | null = null;
  private readonly game: Game;
  private readonly menu: Menu;
  private prepared: MusicSource | null = null;
  /** Incremented on every load so stale results are ignored after "back". */
  private loadId = 0;

  constructor(container: HTMLElement, private readonly initialSeed: number | null) {
    this.game = new Game(container, this.audio, this.settings, {
      onPauseRequest: () => {
        this.game.pause();
        this.menu.showPause();
      },
      onResumeRequest: () => this.resume(),
      onFinished: (summary) => this.showResults(summary),
    });
    this.menu = new Menu(
      container,
      {
        onFile: (file) => void this.loadFile(file),
        onDemo: () => void this.loadDemo(),
        onFreeDrive: () => this.startRun(this.initialSeed ?? randomSeed(), null),
        onStart: (seed) => this.startRun(seed, this.prepared),
        onBack: () => this.goHome(),
        onResume: () => this.resume(),
        onRestart: () => {
          this.menu.hide();
          this.game.restart();
        },
        onNewVariation: () => {
          this.menu.hide();
          const seed = randomSeed();
          setUrlSeed(seed);
          this.game.restart(seed);
        },
        onQuitToMenu: () => this.goHome(),
      },
      this.settings,
    );
    this.menu.onRunOptionsChange = () => this.refreshReadyRecord();
  }

  private showResults(summary: RunSummary): void {
    const rhythm = summary.rhythm;
    if (!rhythm) {
      this.menu.showResults(summary, null);
      return;
    }
    const key = Records.key(summary.songId, rhythm.difficulty, rhythm.obstacles && rhythm.difficulty !== 'easy');
    const record = this.records.submit(key, {
      score: rhythm.score.score,
      rank: rhythm.score.rank,
      maxCombo: rhythm.score.maxCombo,
      date: Date.now(),
    });
    this.menu.showResults(summary, record);
  }

  /** Best score for the prepared song with the currently selected options. */
  private refreshReadyRecord(): void {
    const v = this.settings.values;
    if (!this.prepared || v.mode !== 'rhythm') {
      this.menu.setReadyRecord(null);
      return;
    }
    this.menu.setReadyRecord(this.records.get(Records.key(this.prepared.songId, v.difficulty, v.obstacles && v.difficulty !== 'easy')));
  }

  start(): void {
    this.attract();
    this.menu.showHome();
    this.game.start();
  }

  private attract(): void {
    this.game.startRun({ seed: randomSeed(), interactive: false });
  }

  private goHome(error?: string): void {
    this.loadId++;
    if (this.game.currentRun.interactive) this.attract();
    this.menu.showHome(error);
  }

  private resume(): void {
    this.menu.hide();
    this.game.resume();
  }

  private startRun(seed: number, music: MusicSource | null): void {
    this.menu.hide();
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

  private async loadFile(file: File): Promise<void> {
    const id = ++this.loadId;
    const title = file.name.replace(/\.[^.]+$/, '');
    if (file.size > MAX_FILE_BYTES) return this.goHome('Arquivo muito grande (máximo de 200 MB).');
    this.menu.showLoading(title, 'Lendo o arquivo…', 0);
    try {
      const data = await file.arrayBuffer();
      if (id !== this.loadId) return;
      this.menu.updateLoading('Decodificando o áudio…', 0.02);
      const [key, buffer] = await Promise.all([AnalysisCache.keyFor(data), this.audio.decode(data)]);
      if (id !== this.loadId) return;
      if (buffer.duration < MIN_DURATION) return this.goHome(`Música muito curta (mínimo de ${MIN_DURATION} s).`);
      if (buffer.duration > MAX_DURATION) return this.goHome('Música muito longa (máximo de 20 minutos).');

      const cached = key ? await this.cache.get(key) : null;
      if (id !== this.loadId) return;
      let analysis = cached;
      if (!analysis) {
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        analysis = await this.analysisClient().analyze(mixToMono(channels), buffer.sampleRate, (p) => {
          if (id === this.loadId) this.menu.updateLoading(STAGES[p.stage], 0.05 + 0.95 * p.progress);
        });
        if (key) void this.cache.put(key, analysis);
      }
      if (id !== this.loadId) return;
      // Content hash identifies the song for records; fall back to name and length.
      this.prepared = { buffer, analysis, title, songId: key ?? `file:${title}:${buffer.duration.toFixed(1)}` };
      this.menu.showReady(title, analysis, this.initialSeed ?? randomSeed(), cached !== null);
      this.refreshReadyRecord();
    } catch (error) {
      if (id !== this.loadId) return;
      console.error(error);
      const decodeFailed = error instanceof DOMException || (error instanceof Error && /decod/i.test(error.message));
      this.goHome(
        decodeFailed
          ? 'Não foi possível decodificar este arquivo. Verifique se é um áudio válido em um formato suportado pelo navegador (MP3, WAV, OGG…).'
          : `Falha ao analisar a música: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadDemo(): Promise<void> {
    const id = ++this.loadId;
    this.menu.showLoading(DEMO_TITLE, 'Sintetizando a faixa…', 0);
    try {
      const context = this.audio.getContext();
      const result = await this.analysisClient().demo(context.sampleRate, (p) => {
        if (id === this.loadId) this.menu.updateLoading(STAGES[p.stage], p.progress);
      });
      if (id !== this.loadId) return;
      const buffer = context.createBuffer(1, result.samples.length, result.sampleRate);
      buffer.copyToChannel(result.samples as Float32Array<ArrayBuffer>, 0);
      this.prepared = { buffer, analysis: result.analysis, title: DEMO_TITLE, songId: 'demo:v1' };
      this.menu.showReady(DEMO_TITLE, result.analysis, this.initialSeed ?? randomSeed(), false);
      this.refreshReadyRecord();
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
