import { useEffect, useMemo, useRef, useState } from 'react';
import { closeDialog } from '../state/actions';
import { toast } from '../state/store';
import { Icon } from './Icon';
import { buildCommands, rememberCommand, searchCommands, type Command } from './commands';

/** Ctrl/Cmd+K: find any command, effect, layer or library template by typing a few words. */
export function CommandPalette() {
  const all = useMemo(() => buildCommands(), []);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchCommands(all, q), [all, q]);
  const empty = !q.trim();

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('.cmd.active')?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    if (c.disabled) return toast(`“${c.title}” isn't available right now. It usually needs a selected layer or keyframes.`);
    rememberCommand(c.id);
    closeDialog();
    // let the palette unmount first so commands that open dialogs or take focus work as expected
    setTimeout(c.run, 0);
  };

  return (
    <div className="palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className="palette" role="dialog" aria-label="Command palette" data-testid="palette">
        <div className="pal-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder="Search commands, effects, layers and 333 templates…"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') closeDialog();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[index]);
              }
            }}
            data-testid="palette-input"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={list}>
          {empty && results.length > 0 && <div className="pal-heading">Suggested</div>}
          {results.map((c, i) => (
            <button key={c.id} className={`cmd ${i === index ? 'active' : ''} ${c.disabled ? 'disabled' : ''}`} onPointerMove={() => setIndex(i)} onClick={() => run(c)} data-testid="palette-item">
              <span className="cmd-title">{c.title}</span>
              {c.hint ? <kbd>{c.hint}</kbd> : null}
              <span className="cmd-section">{c.section}</span>
            </button>
          ))}
          {!results.length && <div className="hint">No matches. Try “blur”, “neon”, “slide”, “align”…</div>}
        </div>
        <div className="pal-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span className="spacer" />
          <span>{all.length} commands</span>
        </div>
      </div>
    </div>
  );
}
