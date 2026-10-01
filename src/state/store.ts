import { useSyncExternalStore } from 'react';
import { createProject } from '../core/factory';
import type { Comp, Layer, Project, ShapeKind } from '../core/types';

/* A deliberately small external store: one document (undoable) plus UI state (not undoable),
 * and a separate fast-changing clock so the playhead can tick at 60 fps without re-rendering
 * every panel. */

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

export type Tool = 'select' | 'hand' | 'zoom' | 'shape' | 'text' | 'anchor' | 'pen';
export type RightTab = 'effects' | 'controls' | 'layer';
export type Quality = 'auto' | 1 | 0.5 | 0.33 | 0.25;

export type Dialog =
  | { kind: 'compSettings'; compId: string | null }
  | { kind: 'solid' }
  | { kind: 'export' }
  | { kind: 'shortcuts' }
  | { kind: 'about' };

export interface AppState {
  project: Project;
  fileName: string;
  dirty: boolean;
  undoCount: number;
  redoCount: number;

  openComps: string[];
  activeCompId: string;
  selection: string[];
  selKeys: string[];

  tool: Tool;
  shapeTool: ShapeKind;
  /** Shape and pen tools cut a mask on the selected layer instead of making a shape layer. */
  toolMakesMask: boolean;
  activeMask: string | null;
  selVertex: number | null;
  expanded: Record<string, boolean>;
  showOnly: Record<string, string[] | 'animated'>;
  pps: number;
  tlHeight: number;
  snap: boolean;

  playing: boolean;
  loopPlayback: boolean;

  zoom: number | 'fit';
  quality: Quality;
  panX: number;
  panY: number;
  checkerboard: boolean;
  safeMargins: boolean;

  rightTab: RightTab;
  dialog: Dialog | null;
  toast: { id: number; text: string } | null;
  assetVersion: number;
}

const first = createProject();

export const appStore = createStore<AppState>({
  project: first,
  fileName: 'Untitled.kfs',
  dirty: false,
  undoCount: 0,
  redoCount: 0,
  openComps: [first.compOrder[0]],
  activeCompId: first.compOrder[0],
  selection: [],
  selKeys: [],
  tool: 'select',
  shapeTool: 'rect',
  toolMakesMask: false,
  activeMask: null,
  selVertex: null,
  expanded: {},
  showOnly: {},
  pps: 90,
  tlHeight: 330,
  snap: true,
  playing: false,
  loopPlayback: true,
  zoom: 'fit',
  quality: 'auto',
  panX: 0,
  panY: 0,
  checkerboard: false,
  safeMargins: false,
  rightTab: 'effects',
  dialog: null,
  toast: null,
  assetVersion: 0,
});

export const timeStore = createStore({ t: 0 });

export const useApp = <S,>(selector: (s: AppState) => S): S => useStore(appStore, selector);
export const useTime = (): number => useStore(timeStore, (s) => s.t);

export const activeComp = (s: AppState = appStore.get()): Comp => s.project.comps[s.activeCompId];
export const useActiveComp = (): Comp => useApp((s) => s.project.comps[s.activeCompId]);

export function findLayer(comp: Comp, id: string): Layer | undefined {
  return comp.layers.find((l) => l.id === id);
}

/* ------------------------------------------------------------------------- history */

const past: Project[] = [];
const future: Project[] = [];
const HISTORY_LIMIT = 200;
let gestureOpen = false;
let gestureSnapshot: Project | null = null;

function syncHistoryCounts(): void {
  appStore.set({ undoCount: past.length, redoCount: future.length });
}

/**
 * Apply an edit to a clone of the document. Each call is one undo step, except inside a
 * gesture (a drag), where everything up to endGesture() collapses into a single step.
 */
export function commit(edit: (draft: Project) => void): void {
  const prev = appStore.get().project;
  const next = structuredClone(prev);
  edit(next);
  if (gestureOpen) {
    if (gestureSnapshot) {
      past.push(gestureSnapshot);
      gestureSnapshot = null;
      future.length = 0;
    }
  } else {
    past.push(prev);
    future.length = 0;
  }
  if (past.length > HISTORY_LIMIT) past.shift();
  appStore.set({ project: next, dirty: true, undoCount: past.length, redoCount: future.length });
}

export function beginGesture(): void {
  gestureOpen = true;
  gestureSnapshot = appStore.get().project;
}

export function endGesture(): void {
  gestureOpen = false;
  gestureSnapshot = null;
  syncHistoryCounts();
}

function restore(project: Project): void {
  const s = appStore.get();
  const compIds = new Set(project.compOrder);
  const openComps = s.openComps.filter((id) => compIds.has(id));
  const activeCompId = compIds.has(s.activeCompId) ? s.activeCompId : (openComps[0] ?? project.compOrder[0]);
  if (!openComps.includes(activeCompId)) openComps.push(activeCompId);
  const layers = new Set(project.comps[activeCompId].layers.map((l) => l.id));
  appStore.set({
    project,
    dirty: true,
    openComps,
    activeCompId,
    selection: s.selection.filter((id) => layers.has(id)),
    selKeys: [],
  });
}

export function undo(): void {
  const prev = past.pop();
  if (!prev) return;
  future.push(appStore.get().project);
  restore(prev);
  syncHistoryCounts();
}

export function redo(): void {
  const next = future.pop();
  if (!next) return;
  past.push(appStore.get().project);
  restore(next);
  syncHistoryCounts();
}

export function resetHistory(): void {
  past.length = 0;
  future.length = 0;
  gestureOpen = false;
  gestureSnapshot = null;
  syncHistoryCounts();
}

let toastId = 0;
export function toast(text: string): void {
  const id = ++toastId;
  appStore.set({ toast: { id, text } });
  setTimeout(() => {
    if (appStore.get().toast?.id === id) appStore.set({ toast: null });
  }, 4000);
}
