import { beforeAll, describe, expect, it } from 'vitest';
import { createProject } from '../core/factory';
import { activeComp, appStore, resetHistory } from '../state/store';
import { buildCommands, scoreCommand, searchCommands, type Command } from './commands';

// the registry reads the store and (for recents) localStorage; neither needs a DOM here
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => undefined) as typeof cancelAnimationFrame;

beforeAll(() => {
  const project = createProject();
  const id = project.compOrder[0];
  appStore.set({ project, activeCompId: id, openComps: [id], selection: [], selKeys: [], dirty: false });
  resetHistory();
});

const cmd = (title: string, extra: Partial<Command> = {}): Command => ({ id: title, section: 'Test', title, run: () => undefined, ...extra });

describe('command search', () => {
  it('requires every word and prefers word starts and earlier matches', () => {
    const a = cmd('Add text');
    const b = cmd('Context text menu');
    expect(scoreCommand(a, 'text')).toBeGreaterThan(scoreCommand(b, 'text'));
    expect(scoreCommand(a, 'add text')).toBeGreaterThan(0);
    expect(scoreCommand(a, 'add star')).toBe(0);
    expect(scoreCommand(a, '')).toBeGreaterThan(0);
  });

  it('finds commands through their section and keywords', () => {
    const c = cmd('Add ellipse', { section: 'Add', keywords: 'circle oval' });
    expect(scoreCommand(c, 'circle')).toBeGreaterThan(0);
    expect(scoreCommand(c, 'oval add')).toBeGreaterThan(0);
  });

  it('builds a registry with commands, effects and the whole library', () => {
    const all = buildCommands();
    expect(all.length).toBeGreaterThan(400);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(all.some((c) => c.title === 'Add effect: Gaussian Blur')).toBe(true);
    expect(all.some((c) => c.id === 'lib:motion.slideInLeft')).toBe(true);
    expect(all.filter((c) => c.section === 'Text Styles').length).toBeGreaterThanOrEqual(36);
  });

  it('ranks the obvious answer first', () => {
    const all = buildCommands();
    expect(searchCommands(all, 'gaussian')[0].title).toBe('Add effect: Gaussian Blur');
    expect(searchCommands(all, 'neon cyan')[0].title).toContain('Neon Cyan');
    expect(searchCommands(all, 'export')[0].title).toContain('Export');
    expect(searchCommands(all, 'zzzzqqq')).toHaveLength(0);
  });

  it('shows suggestions for an empty query and disables what needs a selection', () => {
    const all = buildCommands();
    const suggested = searchCommands(all, '');
    expect(suggested.length).toBeGreaterThan(2);
    expect(suggested.every((c) => !c.disabled)).toBe(true);
    expect(all.find((c) => c.id === 'Edit:Duplicate layer')!.disabled).toBe(true);
    expect(activeComp().layers).toHaveLength(0);
  });
});
