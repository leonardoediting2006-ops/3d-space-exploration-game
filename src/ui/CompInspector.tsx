import { useEffect, useState } from 'react';
import { useRef } from 'react';
import type { Comp } from '../core/types';
import { addShape, addText, importFiles, addFootageLayer, updateComp, FOOTAGE_ACCEPT } from '../state/actions';
import { appStore } from '../state/store';
import { ColorField, NumberField } from './fields';
import { Icon } from './Icon';
import { Field, Section } from './Section';

const PRESETS: { label: string; w: number; h: number; note: string }[] = [
  { label: 'HD', w: 1920, h: 1080, note: '1920 × 1080' },
  { label: '4K', w: 3840, h: 2160, note: '3840 × 2160' },
  { label: '720p', w: 1280, h: 720, note: '1280 × 720' },
  { label: 'Square', w: 1080, h: 1080, note: '1080 × 1080' },
  { label: 'Vertical', w: 1080, h: 1920, note: '1080 × 1920' },
];

const FPS = [24, 25, 30, 50, 60];

/** Shown when nothing is selected: the composition's own settings, plus a few ways to get started. */
export function CompInspector({ comp }: { comp: Comp }) {
  const [name, setName] = useState(comp.name);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(comp.name), [comp.id, comp.name]);
  const center = (): [number, number] => [comp.width / 2, comp.height / 2];

  return (
    <div className="inspector comp-inspector" data-testid="comp-inspector">
      <div className="ins-header">
        <span className="type-badge comp">
          <Icon name="comp" size={14} />
        </span>
        <input
          className="ins-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? updateComp(comp.id, { name: name.trim() }) : setName(comp.name))}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          title="Composition name"
          spellCheck={false}
        />
      </div>

      {comp.layers.length === 0 && (
        <Section id="start" title="Get started">
          <div className="start-grid">
            <button onClick={() => addText('Your title', center())} data-testid="start-text">
              <Icon name="text" size={18} />
              <span>Add text</span>
            </button>
            <button onClick={() => addShape('rect', [420, 300], center())}>
              <Icon name="shape" size={18} />
              <span>Add shape</span>
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} />
              <span>Add image</span>
            </button>
            <button onClick={() => appStore.set({ rightTab: 'library' })}>
              <Icon name="sparkle" size={18} />
              <span>Browse library</span>
            </button>
          </div>
          <div className="hint compact">
            Select a layer to edit it here. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to search every command and template.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={FOOTAGE_ACCEPT}
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              const ids = await importFiles(files);
              for (const id of ids.reverse()) addFootageLayer(id);
            }}
          />
        </Section>
      )}

      <Section id="comp-size" title="Canvas">
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button key={p.label} className={`chip ${comp.width === p.w && comp.height === p.h ? 'on' : ''}`} title={p.note} onClick={() => updateComp(comp.id, { width: p.w, height: p.h })}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="Size">
          <span className="vec">
            <NumberField value={comp.width} min={1} max={8192} decimals={0} unit="px" onChange={(v) => updateComp(comp.id, { width: v })} />
            <span className="x-sep">×</span>
            <NumberField value={comp.height} min={1} max={8192} decimals={0} unit="px" onChange={(v) => updateComp(comp.id, { height: v })} />
          </span>
        </Field>
        <Field label="Background">
          <ColorField value={comp.bg} onChange={(c) => updateComp(comp.id, { bg: c })} />
        </Field>
      </Section>

      <Section id="comp-time" title="Time">
        <Field label="Frame rate">
          <select className="mini-select wide" value={comp.fps} onChange={(e) => updateComp(comp.id, { fps: Number(e.target.value) })}>
            {FPS.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
            {!FPS.includes(comp.fps) && <option value={comp.fps}>{comp.fps} fps</option>}
          </select>
        </Field>
        <Field label="Duration">
          <NumberField value={comp.duration} min={1 / comp.fps} max={3600} step={0.1} decimals={2} unit="s" onChange={(v) => updateComp(comp.id, { duration: v })} />
        </Field>
      </Section>

      <Section id="comp-blur" title="Motion blur" defaultFolded>
        <Field label="Enabled" title="Smooths fast movement for layers that have motion blur switched on">
          <button className={`chip ${comp.motionBlur ? 'on' : ''}`} onClick={() => updateComp(comp.id, { motionBlur: !comp.motionBlur })}>
            {comp.motionBlur ? 'On' : 'Off'}
          </button>
        </Field>
        <Field label="Shutter angle" title="How much of each frame the shutter stays open">
          <NumberField value={comp.shutterAngle} min={0} max={720} step={1} decimals={0} unit="°" onChange={(v) => updateComp(comp.id, { shutterAngle: v })} />
        </Field>
      </Section>
    </div>
  );
}
