import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RGB } from '../core/types';
import { exportPng, exportPngSequence, exportVideo, downloadBlob, videoSupport, type VideoFormat } from '../render/export';
import { addSolid, closeDialog, newComp, updateComp } from '../state/actions';
import { appStore, timeStore, useActiveComp, useApp } from '../state/store';
import { CommandPalette } from './CommandPalette';
import { hexToRgb, rgbToHex } from './fields';

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} data-testid="dialog">
        <div className="modal-title">
          <span>{title}</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="form-row">
    <span>{label}</span>
    {children}
  </label>
);

function NumInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  );
}

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'compSettings':
      return <CompSettingsDialog compId={dialog.compId} />;
    case 'solid':
      return <SolidDialog />;
    case 'export':
      return <ExportDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'about':
      return <AboutDialog />;
    case 'palette':
      return <CommandPalette />;
  }
}

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'HD 1080p (1920×1080)', w: 1920, h: 1080 },
  { label: 'HD 720p (1280×720)', w: 1280, h: 720 },
  { label: '4K UHD (3840×2160)', w: 3840, h: 2160 },
  { label: 'Square (1080×1080)', w: 1080, h: 1080 },
  { label: 'Vertical (1080×1920)', w: 1080, h: 1920 },
];

function CompSettingsDialog({ compId }: { compId: string | null }) {
  const project = useApp((s) => s.project);
  const existing = compId ? project.comps[compId] : null;
  const [name, setName] = useState(existing?.name ?? `Comp ${project.compOrder.length + 1}`);
  const [w, setW] = useState(existing?.width ?? 1920);
  const [h, setH] = useState(existing?.height ?? 1080);
  const [fps, setFps] = useState(existing?.fps ?? 30);
  const [duration, setDuration] = useState(existing?.duration ?? 10);
  const [bg, setBg] = useState<RGB>(existing?.bg ?? [18, 18, 20]);
  const [mb, setMb] = useState(existing?.motionBlur ?? false);
  const [shutter, setShutter] = useState(existing?.shutterAngle ?? 180);
  const valid = w >= 1 && w <= 8192 && h >= 1 && h <= 8192 && fps >= 1 && fps <= 240 && duration > 0 && duration <= 3600 && name.trim().length > 0;

  const ok = () => {
    if (!valid) return;
    const patch = { name: name.trim(), width: w, height: h, fps, duration, bg, motionBlur: mb, shutterAngle: shutter };
    if (existing) updateComp(existing.id, patch);
    else newComp(patch);
    closeDialog();
  };
  return (
    <Modal title={existing ? 'Composition Settings' : 'New Composition'} onClose={closeDialog}>
      <Row label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="comp-name" />
      </Row>
      <Row label="Preset">
        <select
          value=""
          onChange={(e) => {
            const p = PRESETS[Number(e.target.value)];
            if (p) {
              setW(p.w);
              setH(p.h);
            }
          }}
        >
          <option value="">Custom</option>
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Width (px)">
        <NumInput value={w} onChange={setW} min={1} max={8192} />
      </Row>
      <Row label="Height (px)">
        <NumInput value={h} onChange={setH} min={1} max={8192} />
      </Row>
      <Row label="Frame rate">
        <NumInput value={fps} onChange={setFps} min={1} max={240} step={0.001} />
      </Row>
      <Row label="Duration (s)">
        <NumInput value={duration} onChange={setDuration} min={0.1} max={3600} step={0.5} />
      </Row>
      <Row label="Background">
        <input type="color" value={rgbToHex(bg)} onChange={(e) => setBg(hexToRgb(e.target.value))} />
      </Row>
      <Row label="Motion blur">
        <span className="inline">
          <input type="checkbox" checked={mb} onChange={(e) => setMb(e.target.checked)} /> Enabled · shutter
          <input className="short" type="number" value={shutter} min={0} max={720} onChange={(e) => setShutter(Number(e.target.value))} />°
        </span>
      </Row>
      <div className="modal-actions">
        <button onClick={closeDialog}>Cancel</button>
        <button className="primary" disabled={!valid} onClick={ok} data-testid="dialog-ok">
          OK
        </button>
      </div>
    </Modal>
  );
}

function SolidDialog() {
  const comp = useActiveComp();
  const [name, setName] = useState('Solid');
  const [w, setW] = useState(comp.width);
  const [h, setH] = useState(comp.height);
  const [color, setColor] = useState<RGB>([86, 98, 190]);
  const valid = w >= 1 && w <= 16384 && h >= 1 && h <= 16384;
  return (
    <Modal title="Solid Settings" onClose={closeDialog}>
      <Row label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Row>
      <Row label="Width (px)">
        <NumInput value={w} onChange={setW} min={1} max={16384} />
      </Row>
      <Row label="Height (px)">
        <NumInput value={h} onChange={setH} min={1} max={16384} />
      </Row>
      <Row label="Color">
        <input type="color" value={rgbToHex(color)} onChange={(e) => setColor(hexToRgb(e.target.value))} />
      </Row>
      <div className="modal-actions">
        <button
          onClick={() => {
            setW(comp.width);
            setH(comp.height);
          }}
        >
          Make Comp Size
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={closeDialog}>Cancel</button>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => {
            addSolid({ name: name.trim() || 'Solid', width: w, height: h, color });
            closeDialog();
          }}
        >
          OK
        </button>
      </div>
    </Modal>
  );
}

type ExportKind = 'png' | 'seq' | VideoFormat;

function ExportDialog() {
  const comp = useActiveComp();
  const project = useApp((s) => s.project);
  const [kind, setKind] = useState<ExportKind>('webm');
  const [range, setRange] = useState<'work' | 'full'>('work');
  const [scale, setScale] = useState(1);
  const [mbps, setMbps] = useState(12);
  const [alpha, setAlpha] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [support, setSupport] = useState<Record<VideoFormat, boolean> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    void videoSupport(comp, scale).then((s) => live && setSupport(s));
    return () => {
      live = false;
    };
  }, [comp, scale]);

  const running = progress !== null;
  const r = range === 'work' ? { start: comp.workStart, end: comp.workEnd } : { start: 0, end: comp.duration };
  const frames = Math.max(1, Math.round((r.end - r.start) * comp.fps));
  const outW = Math.round(comp.width * scale);
  const outH = Math.round(comp.height * scale);

  const run = async () => {
    setMessage(null);
    setProgress(0);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const opts = { scale, range: r, onProgress: setProgress, signal: ctrl.signal };
    try {
      if (kind === 'png') {
        const blob = await exportPng(project, comp, timeStore.get().t, scale, alpha);
        downloadBlob(blob, `${comp.name}_${Math.round(timeStore.get().t * comp.fps)}.png`);
      } else if (kind === 'seq') {
        downloadBlob(await exportPngSequence(project, comp, opts), `${comp.name}_png_sequence.zip`);
      } else {
        downloadBlob(await exportVideo(project, comp, kind, mbps * 1_000_000, opts), `${comp.name}.${kind}`);
      }
      setMessage({ ok: true, text: 'Export finished — check your downloads.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof DOMException && e.name === 'AbortError' ? 'Export cancelled.' : e instanceof Error ? e.message : 'Export failed.' });
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const close = () => {
    abort.current?.abort();
    closeDialog();
  };

  return (
    <Modal title="Export" onClose={close}>
      <Row label="Format">
        <select value={kind} onChange={(e) => setKind(e.target.value as ExportKind)} disabled={running} data-testid="export-format">
          <option value="webm" disabled={support ? !support.webm : false}>
            WebM video (VP9){support && !support.webm ? ' — unsupported here' : ''}
          </option>
          <option value="mp4" disabled={support ? !support.mp4 : false}>
            MP4 video (H.264){support && !support.mp4 ? ' — unsupported here' : ''}
          </option>
          <option value="seq">PNG sequence (.zip)</option>
          <option value="png">Current frame (PNG)</option>
        </select>
      </Row>
      {kind !== 'png' && (
        <Row label="Range">
          <select value={range} onChange={(e) => setRange(e.target.value as 'work' | 'full')} disabled={running}>
            <option value="work">Work area ({frames} frames)</option>
            <option value="full">Entire composition</option>
          </select>
        </Row>
      )}
      <Row label="Resolution">
        <select value={scale} onChange={(e) => setScale(Number(e.target.value))} disabled={running}>
          <option value={1}>Full — {comp.width}×{comp.height}</option>
          <option value={0.5}>Half — {Math.round(comp.width / 2)}×{Math.round(comp.height / 2)}</option>
          <option value={0.25}>Quarter — {Math.round(comp.width / 4)}×{Math.round(comp.height / 4)}</option>
        </select>
      </Row>
      {(kind === 'webm' || kind === 'mp4') && (
        <Row label="Bitrate (Mbps)">
          <NumInput value={mbps} onChange={setMbps} min={1} max={200} />
        </Row>
      )}
      {kind === 'png' && (
        <Row label="Alpha">
          <span className="inline">
            <input type="checkbox" checked={alpha} onChange={(e) => setAlpha(e.target.checked)} /> Transparent background
          </span>
        </Row>
      )}
      <p className="note">
        Output {outW}×{outH}, {comp.fps} fps. Frames are rendered one by one at full quality (motion blur uses 16 samples), so export is exact but not real-time.
      </p>
      {running && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
          <div style={{ width: `${(progress ?? 0) * 100}%` }} />
          <span>{Math.round((progress ?? 0) * 100)}%</span>
        </div>
      )}
      {message && <p className={message.ok ? 'msg ok' : 'msg err'} data-testid="export-message">{message.text}</p>}
      <div className="modal-actions">
        {running ? (
          <button onClick={() => abort.current?.abort()}>Cancel Export</button>
        ) : (
          <>
            <button onClick={close}>Close</button>
            <button className="primary" onClick={run} data-testid="export-run">
              Export
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Command palette: search every command, effect, layer and template'],
  ['Ctrl+Shift+K', 'Composition settings'],
  ['Space', 'Play / pause'],
  ['Home / End', 'Go to start / end'],
  ['Page Up / Page Down', 'Previous / next frame (Shift = 10 frames)'],
  ['J / K', 'Previous / next keyframe'],
  ['P  S  R  T  A', 'Show Position / Scale / Rotation / Opacity / Anchor Point (Shift adds)'],
  ['U', 'Show animated properties'],
  ['[  ]', 'Slide layer so its in / out point meets the playhead'],
  ['Alt + [  ]', 'Trim layer in / out point to the playhead'],
  ['B / N', 'Set work area start / end to the playhead'],
  ['V  H  Z  Q  G  Y', 'Selection, Hand, Zoom, Shape, Pen and Anchor-point tools'],
  ['Arrow keys', 'Nudge selected layers (Shift = 10 px)'],
  ['F9 / Shift+F9 / Ctrl+Shift+F9', 'Easy ease / ease in / ease out the selected keyframes'],
  ['Shift+F3', 'Show or hide the Graph Editor (value and speed graphs)'],
  ['Ctrl+C / X / V', 'Copy / cut / paste layers or keyframes (pasted at the playhead)'],
  ['Ctrl+D', 'Duplicate layers'],
  ['Ctrl+Shift+D', 'Split the selected layers at the playhead'],
  ['Ctrl+Shift+C', 'Pre-compose selected layers'],
  ['Ctrl+] / Ctrl+[', 'Bring forward / send backward (add Shift for front / back)'],
  ['Delete', 'Delete the selected vertex, keyframes, or layers'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+S / Ctrl+O / Ctrl+M', 'Save / open project, export'],
  ['Mouse wheel', 'Zoom the viewer (Ctrl + wheel zooms the timeline)'],
  ['Shift while dragging a handle', 'Constrain scale / snap rotation to 15°'],
  ['Alt while dragging in the timeline', 'Bypass snapping'],
  ['Pen: click / drag / Enter / Esc', 'Add vertex / pull out curve handles / finish an open path / cancel'],
  ['Select tool on a path or mask', 'Drag vertices & handles · double-click a segment to add a vertex · Alt-click a vertex to toggle smooth/corner'],
  ['Select tool on a motion path', 'Drag keyframe points & handles · Alt-drag a keyframe to pull out a curve'],
  ['Double-click a keyframe', 'Open the bezier easing editor'],
  ['Right-click a keyframe', 'Interpolation, motion-path smoothing, time-reverse'],
  ['Right-click a property', 'Add wiggle, loop animation'],
];

function ShortcutsDialog() {
  return (
    <Modal title="Keyboard Shortcuts" onClose={closeDialog} wide>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal title="About Keyframe Studio" onClose={closeDialog}>
      <p>
        Keyframe Studio is an original, browser-based motion graphics and compositing editor. It is not affiliated with, or derived from, any commercial
        product.
      </p>
      <p className="note">
        Compositions, layers, keyframes with bezier easing and curved motion paths, wiggle and loop, parenting, blend modes, track mattes, masks, pen-drawn shapes,
        adjustment layers, effects, text animators, gradients, a 330-template library, precomps, motion blur, and frame-accurate export — all rendered locally on your machine. Projects save as plain JSON files.
      </p>
      <p className="note">Limitations: 2D only (no 3D layers or cameras), no audio, no video footage import, and no expressions beyond wiggle and loop.</p>
      <div className="modal-actions">
        <button className="primary" onClick={closeDialog}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" onClick={() => appStore.set({ toast: null })} data-testid="toast">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            appStore.set({ toast: null });
            toast.action!.run();
          }}
          data-testid="toast-action"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
