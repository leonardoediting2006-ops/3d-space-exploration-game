import { snapToFrame } from '../core/time';
import {
  applyKeyEase,
  copySelection,
  cutSelection,
  deleteKeys,
  deleteLayers,
  duplicateLayers,
  goToKeyframe,
  moveLayersInTime,
  nudgeSelection,
  openDialog,
  pasteClipboard,
  precompose,
  removePathVertex,
  revealProps,
  saveProjectFile,
  selectAllLayers,
  setTime,
  setWorkArea,
  stackMove,
  splitLayers,
  stepFrames,
  togglePlay,
  trimLayer,
} from '../state/actions';
import { activeComp, appStore, redo, timeStore, undo } from '../state/store';
import { OPEN_PROJECT_EVENT } from './MenuBar';
import { editTarget } from './pathEdit';
import { isPenActive, setSpaceHeld } from './Viewer';

const REVEAL: Record<string, string> = {
  p: 'transform.position',
  s: 'transform.scale',
  r: 'transform.rotation',
  t: 'transform.opacity',
  a: 'transform.anchor',
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function installShortcuts(): () => void {
  const down = (e: KeyboardEvent) => {
    // the command palette is reachable from anywhere, even while typing in a field
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const open = appStore.get().dialog;
      if (!open) openDialog({ kind: 'palette' });
      else if (open.kind === 'palette') appStore.set({ dialog: null });
      return;
    }
    if (isTyping(e.target)) return;
    const s = appStore.get();
    if (s.dialog) return;
    const comp = activeComp(s);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const t = timeStore.get().t;
    const sel = s.selection;
    const prevent = () => e.preventDefault();
    // while drawing with the pen, Enter / Esc / Backspace belong to the pen
    if (isPenActive() && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Backspace')) return;

    if (mod) {
      if (key === 'z') {
        prevent();
        return e.shiftKey ? redo() : undo();
      }
      if (key === 'y') {
        prevent();
        return redo();
      }
      if (key === 's') {
        prevent();
        return saveProjectFile();
      }
      if (key === 'o') {
        prevent();
        return void window.dispatchEvent(new Event(OPEN_PROJECT_EVENT));
      }
      if (key === 'm') {
        prevent();
        return openDialog({ kind: 'export' });
      }
      if (key === 'k') {
        prevent();
        return openDialog({ kind: 'compSettings', compId: comp.id });
      }
      if (key === 'd' && sel.length) {
        prevent();
        return e.shiftKey ? splitLayers(sel) : duplicateLayers(sel);
      }
      if (key === 'c' && !e.shiftKey) {
        prevent();
        return void copySelection();
      }
      if (key === 'x') {
        prevent();
        return cutSelection();
      }
      if (key === 'v') {
        prevent();
        return pasteClipboard();
      }
      if (e.code === 'F9' && e.shiftKey) {
        prevent();
        return applyKeyEase(s.selKeys, 'out');
      }
      if (key === 'a') {
        prevent();
        return selectAllLayers();
      }
      if (key === 'c' && e.shiftKey && sel.length) {
        prevent();
        return precompose(sel);
      }
      if (e.code === 'BracketRight' && sel.length) {
        prevent();
        return stackMove(sel, e.shiftKey ? 'top' : 'up');
      }
      if (e.code === 'BracketLeft' && sel.length) {
        prevent();
        return stackMove(sel, e.shiftKey ? 'bottom' : 'down');
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        prevent();
        return stepFrames(e.key === 'ArrowRight' ? 1 : -1);
      }
      return;
    }

    switch (e.code) {
      case 'Space':
        prevent();
        if (e.target instanceof HTMLButtonElement) e.target.blur();
        if (!e.repeat) {
          setSpaceHeld(true);
          togglePlay();
        }
        return;
      case 'Home':
        prevent();
        return setTime(0);
      case 'End':
        prevent();
        return setTime(comp.duration);
      case 'PageDown':
        prevent();
        return stepFrames(e.shiftKey ? 10 : 1);
      case 'PageUp':
        prevent();
        return stepFrames(e.shiftKey ? -10 : -1);
      case 'Comma':
        return stepFrames(-1);
      case 'Period':
        return stepFrames(1);
      case 'F9':
        prevent();
        applyKeyEase(s.selKeys, e.shiftKey ? 'in' : 'both');
        return;
      case 'F3':
        if (!e.shiftKey) return;
        prevent();
        appStore.set({ graphOpen: !s.graphOpen });
        return;
      case 'BracketLeft':
      case 'BracketRight': {
        if (!sel.length) return;
        prevent();
        const left = e.code === 'BracketLeft';
        for (const l of comp.layers) {
          if (!sel.includes(l.id)) continue;
          if (e.altKey) trimLayer(l.id, left ? 'in' : 'out', t);
          else moveLayersInTime([l.id], snapToFrame(t - (left ? l.inPoint : l.outPoint), comp.fps));
        }
        return;
      }
      case 'Escape':
        if (s.selection.length || s.selKeys.length) appStore.set({ selection: [], selKeys: [] });
        return;
      case 'Delete':
      case 'Backspace': {
        prevent();
        const target = s.selVertex !== null ? editTarget(comp, sel, s.activeMask) : null;
        if (target && s.selVertex !== null) removePathVertex(target.layer.id, target.group, target.key, s.selVertex);
        else if (s.selKeys.length) deleteKeys(s.selKeys);
        else if (sel.length) deleteLayers(sel);
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!sel.length) return;
        prevent();
        const n = e.shiftKey ? 10 : 1;
        nudgeSelection(e.code === 'ArrowLeft' ? -n : e.code === 'ArrowRight' ? n : 0, e.code === 'ArrowUp' ? -n : e.code === 'ArrowDown' ? n : 0);
        return;
      }
    }

    if (e.key === '?') return openDialog({ kind: 'shortcuts' });
    if (e.altKey) return;
    if (key === 'j') return goToKeyframe(-1);
    if (key === 'k') return goToKeyframe(1);
    if (key === 'u') return revealProps('animated', e.shiftKey);
    if (REVEAL[key]) return revealProps([REVEAL[key]], e.shiftKey);
    if (key === 'b') return setWorkArea(t, comp.workEnd > t ? comp.workEnd : comp.duration);
    if (key === 'n') return setWorkArea(comp.workStart < t ? comp.workStart : 0, t);
    if (key === 'v') return appStore.set({ tool: 'select' });
    if (key === 'h') return appStore.set({ tool: 'hand' });
    if (key === 'z') return appStore.set({ tool: 'zoom' });
    if (key === 'q') return appStore.set({ tool: 'shape' });
    if (key === 'y') return appStore.set({ tool: 'anchor' });
    if (key === 'g') return appStore.set({ tool: 'pen' });
  };

  const up = (e: KeyboardEvent) => {
    if (e.code === 'Space') setSpaceHeld(false);
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}
