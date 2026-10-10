import './style.css';
import { App } from './App';
import { hashSeed } from './core/rng';

/** Optional `?seed=` from the URL; numeric seeds are used as-is, others hashed. */
function readSeed(): number | null {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param === null || param === '') return null;
  return /^\d+$/.test(param) ? Number(param) >>> 0 : hashSeed(param);
}

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

const app = new App(container, readSeed());
app.start();
