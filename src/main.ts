import './style.css';
import { App } from './App';
import { hashSeed } from './core/rng';

declare global {
  interface Window {
    __infiniteFrequencyBooted?: boolean;
    __infiniteFrequencyFailed?: boolean;
  }
}

/** Optional `?seed=` from the URL; numeric seeds are used as-is, others hashed. */
function readSeed(): number | null {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param === null || param === '') return null;
  return /^\d+$/.test(param) ? Number(param) >>> 0 : hashSeed(param);
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Replaces the loading screen with an explanation instead of failing silently. */
function showBootError(html: string): void {
  window.__infiniteFrequencyFailed = true;
  const message = document.getElementById('boot-message');
  if (message) message.innerHTML = html;
  document.getElementById('boot')?.removeAttribute('hidden');
}

function boot(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container not found');
  if (!hasWebGL()) {
    showBootError(
      'Seu navegador não conseguiu ativar o WebGL, necessário para os gráficos 3D.<br />' +
        'Verifique se a aceleração por hardware está ativada nas configurações do navegador ' +
        'ou tente outro navegador.',
    );
    return;
  }
  try {
    new App(container, readSeed()).start();
  } catch (error) {
    console.error(error);
    showBootError(
      `O jogo não conseguiu iniciar: <code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code><br />` +
        'Recarregue a página ignorando o cache (Ctrl+Shift+R) ou tente outro navegador.',
    );
    return;
  }
  window.__infiniteFrequencyBooted = true;
  document.getElementById('boot')?.remove();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

boot();
