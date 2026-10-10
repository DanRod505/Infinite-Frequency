import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Settings, SettingsData } from '../../core/Settings';
import type { Records } from '../../rhythm/Records';
import type { Store } from './store';
import type { MenuActions, MenuState } from './types';

export interface MenuDeps {
  store: Store<MenuState>;
  actions: MenuActions;
  settings: Settings;
  records: Records;
}

export const MenuContext = createContext<MenuDeps | null>(null);

export function useDeps(): MenuDeps {
  const deps = useContext(MenuContext);
  if (!deps) throw new Error('MenuContext missing');
  return deps;
}

export function useMenuState(): MenuState {
  const { store } = useDeps();
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Current settings, re-rendering on every change. */
export function useSettings(): Readonly<SettingsData> {
  const { settings } = useDeps();
  return useSyncExternalStore(
    (listener) => settings.subscribe(listener),
    () => settings.values,
  );
}
