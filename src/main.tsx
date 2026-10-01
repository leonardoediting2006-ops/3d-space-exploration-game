import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { createDemoProject } from './core/demo';
import { serializeProject } from './core/serialize';
import { allAssetData } from './render/assets';
import * as actions from './state/actions';
import { appStore, timeStore } from './state/store';
import './styles.css';

const AUTOSAVE_KEY = 'keyframe-studio:autosave';

async function boot() {
  let restored = false;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) restored = await actions.openProjectText(saved, 'Autosave.kfs');
  } catch {
    // storage unavailable (private mode, quota) — start fresh
  }
  if (!restored) await actions.loadProjectInto(createDemoProject(), {}, 'Intro.kfs');

  // Autosave, debounced. Skipped when the project (with footage) would not fit in storage.
  let timer = 0;
  let last = appStore.get().project;
  appStore.subscribe(() => {
    const p = appStore.get().project;
    if (p === last) return;
    last = p;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const text = serializeProject(p, allAssetData());
        if (text.length < 4_000_000) localStorage.setItem(AUTOSAVE_KEY, text);
        else localStorage.removeItem(AUTOSAVE_KEY);
      } catch {
        // ignore quota errors
      }
    }, 800);
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  // Debug hook for the end-to-end tests: always on in dev, opt-in in builds with ?debug
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__ks = { appStore, timeStore, actions };
  }
}

void boot();
