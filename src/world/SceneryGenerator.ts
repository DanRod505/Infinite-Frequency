import { Rng, mixSeed } from '../core/rng';
import { SAMPLE_FIELDS, SAMPLE_STRIDE, type TrackGenerator } from '../track/TrackGenerator';

const { P, T } = SAMPLE_FIELDS;

export type PropType = 'post' | 'pillar' | 'tower' | 'mountain' | 'crystal';

/** One scenery object, in world space. Base sits at `y`; `yaw` turns it around the vertical axis. */
export interface Prop {
  type: PropType;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Height of the ground plane, below the lowest road section. */
export const GROUND_LEVEL = -45;

/** Chunks checked on each side when keeping props off the road (covers everything visible). */
const CLEARANCE_CHUNKS_BEHIND = 8;
const CLEARANCE_CHUNKS_AHEAD = 7;
/** Free space kept between any off-road prop and the road edge, in metres. */
const ROAD_CLEARANCE = 4;
const POST_SPACING = 12;
const PILLAR_SPACING = 30;

/**
 * Procedural Neon Dreams scenery for one track chunk (GDD §5.1–§5.3).
 *
 * The track and the scenery are separate systems: props are placed from the
 * chunk's centreline frames and never enter the road corridor, including
 * where a later or earlier part of the track curves back nearby.
 * `density` in [0, 1] (from musical intensity) scales how many structures
 * appear and how tall they are. Deterministic per seed and chunk.
 */
export function generateChunkScenery(generator: TrackGenerator, chunkIndex: number, seed: number, density: number): Prop[] {
  generator.ensureChunk(chunkIndex + CLEARANCE_CHUNKS_AHEAD);
  const chunk = generator.getChunk(chunkIndex);
  if (!chunk) return [];
  const s = chunk.samples;
  const segments = chunk.sampleCount - 1;
  const roadHalf = generator.roadWidth / 2;
  const rng = new Rng(mixSeed(mixSeed(seed, chunkIndex), 0x5cee));
  const props: Prop[] = [];

  const at = (j: number) => {
    const o = j * SAMPLE_STRIDE;
    const tx = s[o + T];
    const tz = s[o + T + 2];
    const flat = Math.hypot(tx, tz) || 1;
    // Horizontal right vector (ignores banking: props stand vertical).
    return { x: s[o + P], y: s[o + P + 1], z: s[o + P + 2], rx: -tz / flat, rz: tx / flat, yaw: Math.atan2(-tx, -tz) };
  };

  // Light posts lining both road edges: steady visual rhythm and speed cue.
  for (let j = 0; j < segments; j += POST_SPACING) {
    const p = at(j);
    for (const side of [-1, 1]) {
      const lateral = side * (roadHalf + 0.8);
      props.push({ type: 'post', x: p.x + p.rx * lateral, y: p.y - 0.6, z: p.z + p.rz * lateral, yaw: p.yaw, sx: 1, sy: 5.2, sz: 1 });
    }
  }

  // Pillars holding up the elevated road.
  for (let j = 0; j < segments; j += PILLAR_SPACING) {
    const p = at(j);
    const height = p.y - 1.2 - GROUND_LEVEL;
    if (height > 4) props.push({ type: 'pillar', x: p.x, y: GROUND_LEVEL, z: p.z, yaw: p.yaw, sx: 2.6, sy: height, sz: 2.6 });
  }

  const blocked = roadSampler(generator, chunkIndex);
  const place = (lateralMin: number, lateralMax: number, radius: number, build: (p: ReturnType<typeof at>, x: number, z: number) => Prop) => {
    // All random draws happen before the check, so a rejection never shifts later props.
    const j = rng.int(0, segments - 1);
    const side = rng.sign();
    const lateral = side * rng.range(lateralMin, lateralMax);
    const p = at(j);
    const x = p.x + p.rx * lateral;
    const z = p.z + p.rz * lateral;
    const prop = build(p, x, z);
    if (!blocked(x, z, roadHalf + ROAD_CLEARANCE + radius)) props.push(prop);
  };

  const scale = 0.7 + 0.6 * density;

  // Neon towers and monoliths in the middle distance.
  const towers = Math.round(1 + density * 5) + rng.int(0, 2);
  for (let i = 0; i < towers; i++) {
    const width = rng.range(5, 13);
    const height = rng.range(30, 110) * scale;
    const yaw = rng.range(0, Math.PI);
    place(30, 120, width * 0.75, (_, x, z) => ({ type: 'tower', x, y: GROUND_LEVEL, z, yaw, sx: width, sy: height, sz: width * rng.range(0.6, 1.2) }));
  }

  // Geometric mountains on the horizon.
  const mountains = 1 + Math.round(density * 2) + rng.int(0, 1);
  for (let i = 0; i < mountains; i++) {
    const height = rng.range(60, 180) * scale;
    const radius = height * rng.range(0.9, 1.5);
    const yaw = rng.range(0, Math.PI);
    place(180, 460, radius, (_, x, z) => ({ type: 'mountain', x, y: GROUND_LEVEL, z, yaw, sx: radius, sy: height, sz: radius }));
  }

  // Floating crystals close to the road, above eye level.
  const crystals = Math.round(density * 4) + rng.int(0, 1);
  for (let i = 0; i < crystals; i++) {
    const size = rng.range(1.5, 4);
    const lift = rng.range(7, 24);
    const yaw = rng.range(0, Math.PI * 2);
    place(16, 50, size, (p, x, z) => ({ type: 'crystal', x, y: p.y + lift, z, yaw, sx: size, sy: size, sz: size }));
  }

  return props;
}

/** Returns a test telling whether a horizontal point is within `distance` of the nearby road centreline. */
function roadSampler(generator: TrackGenerator, chunkIndex: number): (x: number, z: number, distance: number) => boolean {
  const arrays: Float64Array[] = [];
  for (let i = Math.max(0, chunkIndex - CLEARANCE_CHUNKS_BEHIND); i <= chunkIndex + CLEARANCE_CHUNKS_AHEAD; i++) {
    const chunk = generator.getChunk(i);
    if (chunk) arrays.push(chunk.samples);
  }
  return (x, z, distance) => {
    const limit = distance * distance;
    for (const s of arrays) {
      for (let o = 0; o < s.length; o += SAMPLE_STRIDE) {
        const dx = s[o + P] - x;
        const dz = s[o + P + 2] - z;
        if (dx * dx + dz * dz < limit) return true;
      }
    }
    return false;
  };
}
