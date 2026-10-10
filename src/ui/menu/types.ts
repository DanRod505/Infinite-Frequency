import type { MusicAnalysis } from '../../audio/analysisTypes';
import type { SongMeta } from '../../audio/SongLibrary';
import type { RecordEntry } from '../../rhythm/Records';
import type { RunScore } from '../../rhythm/ScoreKeeper';
import type { Difficulty } from '../../rhythm/types';

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

export type Screen = 'main' | 'play' | 'loading' | 'ready' | 'howto' | 'pause' | 'results' | 'settings' | 'records' | 'garage' | 'hidden';

export interface MenuState {
  screen: Screen;
  /** Where "back" goes from settings and how-to (main menu or pause). */
  returnTo: Screen;
  error: string | null;
  loading: { title: string; status: string; progress: number } | null;
  ready: { title: string; songId: string; analysis: MusicAnalysis; seed: number; cached: boolean } | null;
  results: { summary: RunSummary; record: RecordInfo | null } | null;
  library: SongMeta[];
  /** Seed waiting for the how-to screen to be dismissed before a first Rhythm Run. */
  pendingStart: number | null;
}

export interface MenuActions {
  navigate(screen: Screen): void;
  back(): void;
  importFile(file: File): void;
  playLibrarySong(id: string): void;
  removeLibrarySong(id: string): void;
  playDemo(): void;
  freeDrive(): void;
  start(seed: number): void;
  confirmHowTo(): void;
  resume(): void;
  restart(): void;
  newVariation(): void;
  quitToMenu(): void;
  clearRecords(): void;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
