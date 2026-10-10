import './style.css';
import { Game } from './game/Game';
import { hashSeed } from './core/rng';

function readSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param === null || param === '') return hashSeed(`${Date.now()}-${Math.random()}`);
  // Numeric seeds are used as-is so shared URLs stay readable; anything else is hashed.
  return /^\d+$/.test(param) ? Number(param) >>> 0 : hashSeed(param);
}

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

const game = new Game(container, readSeed());
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
