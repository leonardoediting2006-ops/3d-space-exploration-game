import { describe, expect, it } from 'vitest';
import { createAudioLayer, createComp, createImageLayer, createProject, createVideoLayer } from './factory';
import { parseProject, serializeProject } from './serialize';
import type { Project } from './types';

const WAV = 'data:audio/wav;base64,UklGRg==';
const MP4 = 'data:video/mp4;base64,AAAA';
const PNG = 'data:image/png;base64,AAAA';

function build(): { project: Project; assets: Record<string, string> } {
  const project = createProject();
  const comp = project.comps[project.compOrder[0]];
  project.assets.snd = { id: 'snd', name: 'tone.wav', kind: 'audio', width: 0, height: 0, duration: 2.5 };
  project.assets.vid = { id: 'vid', name: 'clip.mp4', kind: 'video', width: 640, height: 360, duration: 4, hasAudio: true, fps: 30 };
  project.assets.img = { id: 'img', name: 'p.png', kind: 'image', width: 10, height: 10 };
  project.assetOrder = ['snd', 'vid', 'img'];
  comp.layers.push(
    createAudioLayer({ name: 'tone', comp, time: 1, assetId: 'snd', duration: 2.5 }),
    createVideoLayer({ name: 'clip', comp, time: 0, assetId: 'vid', width: 640, height: 360, duration: 4, hasAudio: true }),
    createImageLayer({ name: 'p', comp, time: 0, assetId: 'img', width: 10, height: 10 }),
  );
  comp.layers[0].muted = true;
  return { project, assets: { snd: WAV, vid: MP4, img: PNG } };
}

const roundTrip = (mutate?: (raw: Record<string, any>) => void) => {
  const { project, assets } = build();
  const raw = JSON.parse(serializeProject(project, assets));
  mutate?.(raw);
  return parseProject(JSON.stringify(raw));
};

describe('audio and video footage in project files', () => {
  it('round-trips sound and video assets and layers', () => {
    const { project, assets } = roundTrip();
    expect(Object.values(project.assets).map((a) => a.kind)).toEqual(['audio', 'video', 'image']);
    expect(project.assets.snd.duration).toBe(2.5);
    expect(project.assets.vid.hasAudio).toBe(true);
    expect(assets.snd).toBe(WAV);
    const layers = project.comps[project.compOrder[0]].layers;
    expect(layers.map((l) => l.type)).toEqual(['audio', 'video', 'image']);
    expect(layers[0].muted).toBe(true);
    expect(layers[0].content.volume.value).toBe(100);
  });

  it('older files, whose footage has no kind, are images', () => {
    const { project } = roundTrip((raw) => {
      delete raw.project.assets.img.kind;
    });
    expect(project.assets.img.width).toBe(10);
  });

  it('rejects footage that is not what it claims to be', () => {
    const bad: ((raw: Record<string, any>) => void)[] = [
      (raw) => (raw.assets.snd = 'data:text/html;base64,AAAA'),
      (raw) => (raw.assets.vid = WAV),
      (raw) => (raw.assets.img = MP4),
      (raw) => delete raw.assets.snd,
      (raw) => (raw.project.assets.snd.kind = 'hologram'),
      (raw) => (raw.project.assets.snd.duration = -1),
      (raw) => (raw.project.assets.snd.duration = 1e9),
      (raw) => (raw.project.assets.vid.hasAudio = 'yes'),
      (raw) => (raw.project.assets.vid.width = 0),
      (raw) => (raw.project.assets.vid.fps = 'fast'),
    ];
    for (const mutate of bad) expect(() => roundTrip(mutate)).toThrow(/Invalid project file/);
  });

  it('rejects layers that point at the wrong kind of footage, or have bad flags', () => {
    const bad: ((raw: Record<string, any>) => void)[] = [
      (raw) => (raw.project.comps[raw.project.compOrder[0]].layers[0].data.assetId = 'img'),
      (raw) => (raw.project.comps[raw.project.compOrder[0]].layers[1].data.assetId = 'snd'),
      (raw) => (raw.project.comps[raw.project.compOrder[0]].layers[2].data.assetId = 'snd'),
      (raw) => (raw.project.comps[raw.project.compOrder[0]].layers[0].data.assetId = 'nope'),
      (raw) => (raw.project.comps[raw.project.compOrder[0]].layers[0].muted = 'maybe'),
    ];
    for (const mutate of bad) expect(() => roundTrip(mutate)).toThrow(/Invalid project file/);
  });

  it('video layers carry audio controls only when the file has sound', () => {
    const comp = createComp({ name: 'x', width: 100, height: 100, fps: 25, duration: 5 });
    expect(Object.keys(createVideoLayer({ name: 'v', comp, time: 0, assetId: 'a', width: 10, height: 10, duration: 1, hasAudio: true }).content)).toEqual(['volume', 'pan']);
    expect(Object.keys(createVideoLayer({ name: 'v', comp, time: 0, assetId: 'a', width: 10, height: 10, duration: 1, hasAudio: false }).content)).toEqual([]);
  });
});
