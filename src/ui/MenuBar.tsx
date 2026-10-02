import { useEffect, useRef, useState } from 'react';
import {
  addAdjustment,
  addNull,
  addStarterMask,
  addShape,
  addText,
  applyKeyEase,
  clearMotionPathCurves,
  closeDialog,
  copySelection,
  cutSelection,
  deleteLayers,
  duplicateLayers,
  newProject,
  openDialog,
  openProjectText,
  pasteClipboard,
  precompose,
  saveProjectFile,
  selectAllLayers,
  setTime,
  sequenceLayers,
  setWorkArea,
  smoothMotionPath,
  splitLayers,
  stackMove,
  timeReverseKeys,
} from '../state/actions';
import { exportPresets, importPresetsFromFile } from '../state/presets';
import { chooseSyncFile } from '../state/presetSync';
import { activeComp, appStore, redo, timeStore, toast, undo, useApp } from '../state/store';
import { Icon } from './Icon';

interface Entry {
  label?: string;
  shortcut?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
}

export const OPEN_PROJECT_EVENT = 'ks:open-project';

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const undoCount = useApp((s) => s.undoCount);
  const redoCount = useApp((s) => s.redoCount);
  const selection = useApp((s) => s.selection);
  const selKeys = useApp((s) => s.selKeys);
  const fileName = useApp((s) => s.fileName);
  const dirty = useApp((s) => s.dirty);
  const checker = useApp((s) => s.checkerboard);
  const safe = useApp((s) => s.safeMargins);
  const leftOpen = useApp((s) => s.leftOpen);
  const previewOnApply = useApp((s) => s.previewOnApply);
  const columns = useApp((s) => s.showColumns);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const openFile = () => fileRef.current?.click();
    window.addEventListener('pointerdown', close);
    window.addEventListener(OPEN_PROJECT_EVENT, openFile);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener(OPEN_PROJECT_EVENT, openFile);
    };
  }, []);

  const hasSel = selection.length > 0;
  const center = () => {
    const c = activeComp();
    return [c.width / 2, c.height / 2] as [number, number];
  };

  const menus: Record<string, Entry[]> = {
    File: [
      {
        label: 'New Project',
        run: () => {
          if (!appStore.get().dirty || confirm('Discard the current project and start a new one?')) newProject();
        },
      },
      { label: 'Open Project…', shortcut: 'Ctrl+O', run: () => fileRef.current?.click() },
      { label: 'Save Project', shortcut: 'Ctrl+S', run: saveProjectFile },
      { sep: true },
      { label: 'Export…', shortcut: 'Ctrl+M', run: () => openDialog({ kind: 'export' }) },
      { sep: true },
      { label: 'Import Presets…', run: () => void importPresetsFromFile() },
      { label: 'Export My Presets…', run: () => exportPresets() },
      { label: 'Sync Presets with a File…', run: () => void chooseSyncFile() },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', run: undo, disabled: undoCount === 0 },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', run: redo, disabled: redoCount === 0 },
      { sep: true },
      { label: 'Cut', shortcut: 'Ctrl+X', run: cutSelection },
      { label: 'Copy', shortcut: 'Ctrl+C', run: () => void copySelection() },
      { label: 'Paste', shortcut: 'Ctrl+V', run: pasteClipboard },
      { sep: true },
      { label: 'Duplicate', shortcut: 'Ctrl+D', run: () => duplicateLayers(selection), disabled: !hasSel },
      { label: 'Delete', shortcut: 'Del', run: () => deleteLayers(selection), disabled: !hasSel },
      { label: 'Select All', shortcut: 'Ctrl+A', run: selectAllLayers },
      { label: 'Deselect All', run: () => appStore.set({ selection: [], selKeys: [] }) },
    ],
    Composition: [
      { label: 'New Composition…', run: () => openDialog({ kind: 'compSettings', compId: null }) },
      { label: 'Composition Settings…', shortcut: 'Ctrl+Shift+K', run: () => openDialog({ kind: 'compSettings', compId: appStore.get().activeCompId }) },
      { sep: true },
      { label: 'Set Work Area Start (B)', run: () => setWorkArea(timeStore.get().t, activeComp().workEnd) },
      { label: 'Set Work Area End (N)', run: () => setWorkArea(activeComp().workStart, timeStore.get().t) },
      { label: 'Reset Work Area', run: () => setWorkArea(0, activeComp().duration) },
    ],
    Layer: [
      { label: 'New Solid…', run: () => openDialog({ kind: 'solid' }) },
      { label: 'New Shape Layer', run: () => addShape('rect', [400, 300], center()) },
      { label: 'New Text Layer', run: () => addText('Text', center()) },
      { label: 'New Null Object', run: addNull },
      { label: 'New Adjustment Layer', run: addAdjustment },
      { sep: true },
      { label: 'New Mask: Rectangle', run: () => addStarterMask(selection[0], 'rect'), disabled: selection.length !== 1 },
      { label: 'New Mask: Ellipse', run: () => addStarterMask(selection[0], 'ellipse'), disabled: selection.length !== 1 },
      { sep: true },
      { label: 'Split Layer', shortcut: 'Ctrl+Shift+D', run: () => splitLayers(selection), disabled: !hasSel },
      { label: 'Pre-compose…', shortcut: 'Ctrl+Shift+C', run: () => precompose(selection), disabled: !hasSel },
      { sep: true },
      { label: 'Bring Layer to Front', shortcut: 'Ctrl+Shift+]', run: () => stackMove(selection, 'top'), disabled: !hasSel },
      { label: 'Bring Layer Forward', shortcut: 'Ctrl+]', run: () => stackMove(selection, 'up'), disabled: !hasSel },
      { label: 'Send Layer Backward', shortcut: 'Ctrl+[', run: () => stackMove(selection, 'down'), disabled: !hasSel },
      { label: 'Send Layer to Back', shortcut: 'Ctrl+Shift+[', run: () => stackMove(selection, 'bottom'), disabled: !hasSel },
    ],
    Animation: [
      { label: 'Easy Ease', shortcut: 'F9', run: () => applyKeyEase(selKeys, 'both'), disabled: !selKeys.length },
      { label: 'Easy Ease In', shortcut: 'Shift+F9', run: () => applyKeyEase(selKeys, 'in'), disabled: !selKeys.length },
      { label: 'Easy Ease Out', shortcut: 'Ctrl+Shift+F9', run: () => applyKeyEase(selKeys, 'out'), disabled: !selKeys.length },
      { label: 'Linear Keyframes', run: () => applyKeyEase(selKeys, 'linear'), disabled: !selKeys.length },
      { label: 'Hold Keyframes', run: () => applyKeyEase(selKeys, 'hold'), disabled: !selKeys.length },
      { sep: true },
      { label: 'Smooth Motion Path (Auto Bezier)', run: () => smoothMotionPath(selKeys), disabled: !selKeys.length },
      { label: 'Straighten Motion Path', run: () => clearMotionPathCurves(selKeys), disabled: !selKeys.length },
      { label: 'Time-Reverse Keyframes', run: () => timeReverseKeys(selKeys), disabled: selKeys.length < 2 },
      { label: 'Sequence Layers', run: () => sequenceLayers(selection), disabled: selection.length < 2 },
    ],
    View: [
      { label: 'Fit in Window', run: () => appStore.set({ zoom: 'fit', panX: 0, panY: 0 }) },
      { label: '100%', run: () => appStore.set({ zoom: 1, panX: 0, panY: 0 }) },
      { label: '50%', run: () => appStore.set({ zoom: 0.5, panX: 0, panY: 0 }) },
      { label: '200%', run: () => appStore.set({ zoom: 2, panX: 0, panY: 0 }) },
      { sep: true },
      { label: 'Transparency Grid', checked: checker, run: () => appStore.set({ checkerboard: !checker }) },
      { label: 'Safe Margins & Guides', checked: safe, run: () => appStore.set({ safeMargins: !safe }) },
      { sep: true },
      { label: 'Preview Animations When Applied', checked: previewOnApply, run: () => appStore.set({ previewOnApply: !previewOnApply }) },
      { label: 'Project Panel', checked: leftOpen, run: () => appStore.set({ leftOpen: !leftOpen }) },
      { label: 'Timeline Columns (blend, matte, parent)', checked: columns, run: () => appStore.set({ showColumns: !columns }) },
      { sep: true },
      { label: 'Go to Start', shortcut: 'Home', run: () => setTime(0) },
      { label: 'Go to End', shortcut: 'End', run: () => setTime(activeComp().duration) },
    ],
    Help: [
      { label: 'Command Palette…', shortcut: 'Ctrl+K', run: () => openDialog({ kind: 'palette' }) },
      { label: 'Keyboard Shortcuts', run: () => openDialog({ kind: 'shortcuts' }) },
      { label: 'About Keyframe Studio', run: () => openDialog({ kind: 'about' }) },
    ],
  };

  return (
    <div className="menubar" ref={barRef}>
      <div className="brand">
        <Icon name="diamondFilled" size={13} />
        Keyframe Studio
      </div>
      {Object.entries(menus).map(([name, entries]) => (
        <div key={name} className="menu">
          <button
            className={open === name ? 'open' : ''}
            onClick={() => setOpen(open === name ? null : name)}
            onPointerEnter={() => open && setOpen(name)}
            data-testid={`menu-${name}`}
          >
            {name}
          </button>
          {open === name && (
            <div className="dropdown">
              {entries.map((e, i) =>
                e.sep ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={e.label}
                    disabled={e.disabled}
                    onClick={() => {
                      setOpen(null);
                      e.run?.();
                    }}
                  >
                    <span className="check">{e.checked ? '✓' : ''}</span>
                    <span className="lbl">{e.label}</span>
                    <span className="sc">{e.shortcut}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="file-title" title={fileName}>
        {fileName.replace(/\.kfs$/, '')}
        {dirty && <i className="dirty" title="Unsaved changes" />}
      </div>
      <div className="menubar-right">
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={undoCount === 0} onClick={undo} data-testid="undo-btn">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={redoCount === 0} onClick={redo}>
          <Icon name="redo" />
        </button>
        <button className="palette-btn" title="Search every command, effect and template" onClick={() => openDialog({ kind: 'palette' })} data-testid="palette-btn">
          <Icon name="search" size={14} />
          <span>Search…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="primary" onClick={() => openDialog({ kind: 'export' })} data-testid="export-btn">
          <Icon name="download" size={14} /> Export
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".kfs,.json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > 200 * 1024 * 1024) return toast('That file is too large to be a project.');
          if (await openProjectText(await f.text(), f.name)) closeDialog();
        }}
      />
    </div>
  );
}
