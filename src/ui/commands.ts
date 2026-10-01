import { EFFECTS } from '../core/effectDefs';
import {
  addAdjustment,
  addEffect,
  addNull,
  addShape,
  addStarterMask,
  addText,
  alignLayers,
  applyKeyEase,
  clearMotionPathCurves,
  copySelection,
  cutSelection,
  deleteLayers,
  distributeLayers,
  duplicateLayers,
  newProject,
  openComp,
  openDialog,
  pasteClipboard,
  pause,
  play,
  precompose,
  resetTransform,
  saveProjectFile,
  selectAllLayers,
  selectLayers,
  sequenceLayers,
  setTime,
  setWorkArea,
  smoothMotionPath,
  splitLayers,
  stackMove,
  staggerAnimations,
  timeReverseKeys,
  updateComp,
  type AlignMode,
} from '../state/actions';
import { applyLibraryItem } from '../state/templateActions';
import { activeComp, appStore, redo, timeStore, toast, undo } from '../state/store';
import { CATEGORY_LABELS, LIBRARY, LIBRARY_ORDER } from '../templates';
import { OPEN_PROJECT_EVENT } from './MenuBar';

export interface Command {
  id: string;
  title: string;
  section: string;
  /** Shortcut or short note shown on the right. */
  hint?: string;
  /** Extra words that should find this command. */
  keywords?: string;
  run: () => void;
  disabled?: boolean;
}

const center = (): [number, number] => {
  const c = activeComp();
  return [c.width / 2, c.height / 2];
};

/** Everything the palette can do right now. Built fresh each time it opens, so enabled states are current. */
export function buildCommands(): Command[] {
  const s = appStore.get();
  const comp = activeComp(s);
  const sel = s.selection;
  const hasSel = sel.length > 0;
  const keys = s.selKeys;
  const out: Command[] = [];
  const add = (section: string, title: string, run: () => void, extra: Partial<Command> = {}) => out.push({ id: `${section}:${title}`, section, title, run, ...extra });

  // add things
  add('Add', 'Add text', () => addText('Your text', center()), { keywords: 'title type words' });
  add('Add', 'Add rectangle', () => addShape('rect', [420, 300], center()), { keywords: 'shape box square' });
  add('Add', 'Add ellipse', () => addShape('ellipse', [320, 320], center()), { keywords: 'shape circle oval' });
  add('Add', 'Add star', () => addShape('star', [320, 320], center()), { keywords: 'shape' });
  add('Add', 'Add polygon', () => addShape('polygon', [320, 320], center()), { keywords: 'shape hexagon' });
  add('Add', 'Add solid…', () => openDialog({ kind: 'solid' }), { keywords: 'color background' });
  add('Add', 'Add adjustment layer', () => void addAdjustment(), { keywords: 'grade effect all' });
  add('Add', 'Add null object', () => void addNull(), { keywords: 'parent control' });
  add('Add', 'Add composition…', () => openDialog({ kind: 'compSettings', compId: null }), { keywords: 'new scene' });
  add('Add', 'Add rectangle mask', () => addStarterMask(sel[0], 'rect'), { disabled: sel.length !== 1 });
  add('Add', 'Add ellipse mask', () => addStarterMask(sel[0], 'ellipse'), { disabled: sel.length !== 1 });

  // edit
  add('Edit', 'Undo', undo, { hint: 'Ctrl+Z', disabled: s.undoCount === 0 });
  add('Edit', 'Redo', redo, { hint: 'Ctrl+Shift+Z', disabled: s.redoCount === 0 });
  add('Edit', 'Copy', () => void copySelection(), { hint: 'Ctrl+C' });
  add('Edit', 'Cut', cutSelection, { hint: 'Ctrl+X' });
  add('Edit', 'Paste', pasteClipboard, { hint: 'Ctrl+V' });
  add('Edit', 'Duplicate layer', () => duplicateLayers(sel), { hint: 'Ctrl+D', disabled: !hasSel });
  add('Edit', 'Delete layer', () => deleteLayers(sel), { hint: 'Del', disabled: !hasSel, keywords: 'remove' });
  add('Edit', 'Select all layers', selectAllLayers, { hint: 'Ctrl+A' });
  add('Edit', 'Split layer at playhead', () => splitLayers(sel), { hint: 'Ctrl+Shift+D', disabled: !hasSel, keywords: 'cut' });
  add('Edit', 'Pre-compose layers…', () => precompose(sel), { hint: 'Ctrl+Shift+C', disabled: !hasSel, keywords: 'group nest' });
  add('Edit', 'Reset transform', () => resetTransform(sel), { disabled: !hasSel, keywords: 'position scale rotation opacity' });
  add('Edit', 'Bring to front', () => stackMove(sel, 'top'), { hint: 'Ctrl+Shift+]', disabled: !hasSel });
  add('Edit', 'Send to back', () => stackMove(sel, 'bottom'), { hint: 'Ctrl+Shift+[', disabled: !hasSel });
  add('Edit', 'Sequence layers', () => sequenceLayers(sel), { disabled: sel.length < 2, keywords: 'one after another' });

  // arrange
  const aligns: [AlignMode, string][] = [['left', 'left'], ['centerH', 'horizontal center'], ['right', 'right'], ['top', 'top'], ['middle', 'vertical center'], ['bottom', 'bottom']];
  for (const [mode, label] of aligns) add('Arrange', `Align ${label}`, () => alignLayers(sel, mode), { disabled: !hasSel, keywords: 'center middle' });
  add('Arrange', 'Stagger entrance animations (0.1 s)', () => void staggerAnimations(sel, 0.1), { disabled: sel.length < 2, keywords: 'offset delay cascade' });
  add('Arrange', 'Stagger entrance animations (0.25 s)', () => void staggerAnimations(sel, 0.25), { disabled: sel.length < 2, keywords: 'offset delay cascade' });
  add('Arrange', 'Distribute horizontally', () => distributeLayers(sel, 'h'), { disabled: sel.length < 3, keywords: 'space evenly' });
  add('Arrange', 'Distribute vertically', () => distributeLayers(sel, 'v'), { disabled: sel.length < 3, keywords: 'space evenly' });

  // keyframes
  add('Keyframes', 'Easy ease', () => applyKeyEase(keys, 'both'), { hint: 'F9', disabled: !keys.length, keywords: 'smooth curve' });
  add('Keyframes', 'Easy ease in', () => applyKeyEase(keys, 'in'), { hint: 'Shift+F9', disabled: !keys.length });
  add('Keyframes', 'Easy ease out', () => applyKeyEase(keys, 'out'), { hint: 'Ctrl+Shift+F9', disabled: !keys.length });
  add('Keyframes', 'Linear keyframes', () => applyKeyEase(keys, 'linear'), { disabled: !keys.length });
  add('Keyframes', 'Hold keyframes', () => applyKeyEase(keys, 'hold'), { disabled: !keys.length, keywords: 'step' });
  add('Keyframes', 'Smooth motion path', () => smoothMotionPath(keys), { disabled: !keys.length, keywords: 'bezier curve' });
  add('Keyframes', 'Straighten motion path', () => clearMotionPathCurves(keys), { disabled: !keys.length });
  add('Keyframes', 'Reverse keyframes in time', () => timeReverseKeys(keys), { disabled: keys.length < 2 });

  // playback & view
  add('Playback', s.playing ? 'Pause' : 'Play', () => (s.playing ? pause() : play()), { hint: 'Space' });
  add('Playback', 'Go to start', () => setTime(0), { hint: 'Home' });
  add('Playback', 'Go to end', () => setTime(comp.duration), { hint: 'End' });
  add('Playback', 'Set work area start to playhead', () => setWorkArea(timeStore.get().t, comp.workEnd), { hint: 'B' });
  add('Playback', 'Set work area end to playhead', () => setWorkArea(comp.workStart, timeStore.get().t), { hint: 'N' });
  add('Playback', 'Reset work area', () => setWorkArea(0, comp.duration));
  add('Playback', s.loopPlayback ? 'Turn looping off' : 'Turn looping on', () => appStore.set({ loopPlayback: !s.loopPlayback }));
  add('View', 'Fit in window', () => appStore.set({ zoom: 'fit', panX: 0, panY: 0 }));
  add('View', 'Zoom to 100%', () => appStore.set({ zoom: 1, panX: 0, panY: 0 }));
  add('View', 'Zoom to 50%', () => appStore.set({ zoom: 0.5, panX: 0, panY: 0 }));
  add('View', 'Zoom to 200%', () => appStore.set({ zoom: 2, panX: 0, panY: 0 }));
  add('View', s.checkerboard ? 'Hide transparency grid' : 'Show transparency grid', () => appStore.set({ checkerboard: !s.checkerboard }));
  add('View', s.safeMargins ? 'Hide safe margins' : 'Show safe margins', () => appStore.set({ safeMargins: !s.safeMargins }), { keywords: 'guides' });
  add('View', s.showColumns ? 'Hide timeline columns' : 'Show timeline columns (blend, matte, parent)', () => appStore.set({ showColumns: !s.showColumns }));
  add('View', s.leftOpen ? 'Hide project panel' : 'Show project panel', () => appStore.set({ leftOpen: !s.leftOpen }), { keywords: 'footage compositions' });
  add('View', 'Show Inspector', () => appStore.set({ rightTab: 'inspector' }), { keywords: 'properties' });
  add('View', 'Show Library', () => appStore.set({ rightTab: 'library' }), { keywords: 'templates presets' });
  add('View', s.previewOnApply ? 'Stop previewing animations when applied' : 'Preview animations when applied', () => appStore.set({ previewOnApply: !s.previewOnApply }));
  add('View', s.snap ? 'Turn snapping off' : 'Turn snapping on', () => appStore.set({ snap: !s.snap }));
  add('View', comp.motionBlur ? 'Turn motion blur off' : 'Turn motion blur on', () => updateComp(comp.id, { motionBlur: !comp.motionBlur }), { keywords: 'smooth shutter' });

  // file & help
  add('File', 'New project', () => (!s.dirty || confirm('Discard the current project and start a new one?')) && newProject());
  add('File', 'Open project…', () => void window.dispatchEvent(new Event(OPEN_PROJECT_EVENT)), { hint: 'Ctrl+O' });
  add('File', 'Save project', saveProjectFile, { hint: 'Ctrl+S' });
  add('File', 'Export video or images…', () => openDialog({ kind: 'export' }), { hint: 'Ctrl+M', keywords: 'render webm mp4 png' });
  add('File', 'Composition settings…', () => openDialog({ kind: 'compSettings', compId: comp.id }), { hint: 'Ctrl+Shift+K', keywords: 'size fps duration' });
  add('Help', 'Keyboard shortcuts', () => openDialog({ kind: 'shortcuts' }), { hint: '?' });
  add('Help', 'About Keyframe Studio', () => openDialog({ kind: 'about' }));

  // go to layer / composition
  for (const l of comp.layers) add('Layers', `Select “${l.name}”`, () => selectLayers([l.id]), { keywords: `go to ${l.type}` });
  for (const id of s.project.compOrder) if (id !== s.activeCompId) add('Compositions', `Open “${s.project.comps[id].name}”`, () => openComp(id));

  // effects
  for (const e of EFFECTS) add('Effects', `Add effect: ${e.name}`, () => (hasSel ? addEffect(sel, e.type) : toast('Select a layer first, then add the effect.')), { keywords: e.category });

  // the whole library
  for (const cat of LIBRARY_ORDER) {
    for (const item of LIBRARY[cat]) {
      const verb = cat === 'scene' ? 'Insert' : cat === 'easing' ? 'Ease' : cat === 'gradient' ? 'Fill' : 'Apply';
      add(CATEGORY_LABELS[cat], `${verb} ${item.name}`, () => applyLibraryItem(item), { keywords: `${item.group} ${item.id}`, id: `lib:${item.id}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ search */

const RECENT_KEY = 'keyframe-studio:recent-commands';

export function recentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberCommand(id: string): void {
  try {
    const next = [id, ...recentIds().filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode or full storage: recents are a convenience only */
  }
}

/**
 * Score a command for a query. Every word of the query must appear somewhere in the title,
 * section or keywords; matches at the start of a word score higher, earlier matches higher still.
 */
const SECTION_RANK = ['Add', 'Edit', 'Arrange', 'Keyframes', 'Playback', 'View', 'File', 'Help', 'Layers', 'Compositions', 'Effects', 'Text Styles', 'Text Animations', 'Motion', 'Looks', 'Gradients', 'Easing', 'Scenes'];

export function scoreCommand(cmd: Command, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = cmd.title.toLowerCase();
  const rest = `${cmd.section} ${cmd.keywords ?? ''}`.toLowerCase();
  let total = 0;
  for (const w of words) {
    const i = title.indexOf(w);
    if (i >= 0) {
      const wordStart = i === 0 || /[\s:“(]/.test(title[i - 1]);
      total += (wordStart ? 6 : 3) + (i === 0 ? 3 : 0) - Math.min(i, 30) / 30;
    } else if (rest.includes(w)) total += 1;
    else return 0;
  }
  // shorter titles are usually the more direct answer
  return total - title.length / 400 - Math.max(0, SECTION_RANK.indexOf(cmd.section)) / 200;
}

export function searchCommands(all: Command[], query: string, limit = 60): Command[] {
  if (!query.trim()) {
    const byId = new Map(all.map((c) => [c.id, c]));
    const recent = recentIds().map((id) => byId.get(id)).filter((c): c is Command => !!c && !c.disabled);
    const featured = ['Add:Add text', 'Add:Add rectangle', 'File:Export video or images…', 'View:Show Library', 'Edit:Undo'].map((id) => byId.get(id)).filter((c): c is Command => !!c && !c.disabled);
    const seen = new Set<string>();
    return [...recent, ...featured].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 10);
  }
  return all
    .map((c) => ({ c, s: scoreCommand(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(!!a.c.disabled) - Number(!!b.c.disabled))
    .slice(0, limit)
    .map((x) => x.c);
}
