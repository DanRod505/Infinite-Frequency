import type { Rank } from './ScoreKeeper';
import type { Difficulty } from './types';

export interface RecordEntry {
  /** Song title at the time of the record (for the records screen). */
  title: string;
  score: number;
  rank: Rank;
  maxCombo: number;
  date: number;
}

const STORAGE_KEY = 'infinite-frequency.records.v1';
const RANKS: Rank[] = ['S', 'A', 'B', 'C', 'D'];

/** Local best scores per song, difficulty and obstacle setting (GDD §7.1, §10.3). */
export class Records {
  private data: Record<string, RecordEntry>;

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    this.data = this.load();
  }

  static key(songId: string, difficulty: Difficulty, obstacles: boolean): string {
    return `${songId}|${difficulty}|${obstacles ? 'obstacles' : 'clear'}`;
  }

  /** Every record, newest first, with its key decoded. */
  list(): (RecordEntry & { key: string; difficulty: Difficulty; obstacles: boolean })[] {
    return Object.entries(this.data)
      .map(([key, entry]) => {
        const [, difficulty, obstacles] = key.split('|');
        return { ...entry, key, difficulty: difficulty as Difficulty, obstacles: obstacles === 'obstacles' };
      })
      .sort((a, b) => b.date - a.date);
  }

  clear(): void {
    this.data = {};
    this.save();
  }

  get(key: string): RecordEntry | null {
    return this.data[key] ?? null;
  }

  /** Stores the entry if it beats the previous best. Returns the previous best. */
  submit(key: string, entry: RecordEntry): { previous: RecordEntry | null; isNewBest: boolean } {
    const previous = this.get(key);
    const isNewBest = !previous || entry.score > previous.score;
    if (isNewBest) {
      this.data[key] = entry;
      this.save();
    }
    return { previous, isNewBest };
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or disabled: records live for this session only.
    }
  }

  private load(): Record<string, RecordEntry> {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}');
      if (!parsed || typeof parsed !== 'object') return {};
      const out: Record<string, RecordEntry> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, Partial<RecordEntry>>)) {
        if (typeof value?.score === 'number' && Number.isFinite(value.score) && RANKS.includes(value.rank as Rank)) {
          out[key] = {
            title: typeof value.title === 'string' ? value.title : 'Música sem título',
            score: value.score,
            rank: value.rank as Rank,
            maxCombo: typeof value.maxCombo === 'number' ? value.maxCombo : 0,
            date: typeof value.date === 'number' ? value.date : 0,
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
