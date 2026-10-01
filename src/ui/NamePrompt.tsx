import { useState } from 'react';
import { Popover, type Anchor } from './Popover';

/** A small popover that asks for a name (saving a preset, renaming one). */
export function NamePrompt({ anchor, title, initial, action = 'Save', onSave, onClose }: { anchor: Anchor; title: string; initial: string; action?: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={260} side={anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} className="name-pop" testId="name-prompt">
      <div className="np-title">{title}</div>
      <input
        autoFocus
        value={name}
        maxLength={60}
        spellCheck={false}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') submit();
        }}
        data-testid="name-input"
      />
      <div className="np-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={submit} disabled={!name.trim()} data-testid="name-save">
          {action}
        </button>
      </div>
    </Popover>
  );
}
