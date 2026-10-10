import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MenuContext, useDeps, useMenuState, type MenuDeps } from './context';
import {
  GarageScreen,
  HowToScreen,
  LoadingScreen,
  MainMenu,
  PauseScreen,
  PlayScreen,
  ReadyScreen,
  RecordsScreen,
  ResultsScreen,
  SettingsScreen,
} from './screens';
import type { Screen } from './types';

/** Screens where Esc means "back" (the pause screen leaves Esc to the game: resume). */
const ESC_BACK: Screen[] = ['play', 'ready', 'settings', 'records', 'garage', 'howto'];

function MenuRoot() {
  const { actions } = useDeps();
  const { screen } = useMenuState();

  useEffect(() => {
    // Capture phase + stopPropagation: the game's own Esc handling (pause/resume)
    // must not also see a key that only meant "back" in a menu.
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && ESC_BACK.includes(screen)) {
        event.preventDefault();
        event.stopPropagation();
        actions.back();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [screen, actions]);

  if (screen === 'hidden') return null;
  return (
    <div className={screen === 'garage' ? 'menu menu--side' : 'menu'} data-screen={screen}>
      {screen === 'main' && <MainMenu />}
      {screen === 'play' && <PlayScreen />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'ready' && <ReadyScreen />}
      {screen === 'howto' && <HowToScreen />}
      {screen === 'pause' && <PauseScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'garage' && <GarageScreen />}
      {screen === 'records' && <RecordsScreen />}
      {screen === 'results' && <ResultsScreen />}
    </div>
  );
}

/** Mounts the React menu layer over the game canvas. */
export function mountMenu(container: HTMLElement, deps: MenuDeps): () => void {
  const host = document.createElement('div');
  host.className = 'menu-host';
  container.appendChild(host);
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <MenuContext.Provider value={deps}>
        <MenuRoot />
      </MenuContext.Provider>
    </StrictMode>,
  );
  return () => {
    root.unmount();
    host.remove();
  };
}
