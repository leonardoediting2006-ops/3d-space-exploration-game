import { useEffect } from 'react';
import { addFootageLayer, importFiles, openProjectText } from '../state/actions';
import { appStore, useApp } from '../state/store';
import { Dialogs, Toast } from './Dialogs';
import { MenuBar } from './MenuBar';
import { ProjectPanel } from './ProjectPanel';
import { RightPanel } from './RightPanel';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { Viewer } from './Viewer';
import { installShortcuts } from './shortcuts';

export function App() {
  const tlHeight = useApp((s) => s.tlHeight);
  const leftOpen = useApp((s) => s.leftOpen);

  useEffect(() => installShortcuts(), []);

  // Drop images to import them as footage (and add them as layers); drop a .kfs to open a project.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      const project = files.find((f) => /\.(kfs|json)$/i.test(f.name));
      if (project) {
        await openProjectText(await project.text(), project.name);
        return;
      }
      const ids = await importFiles(files);
      for (const id of ids.reverse()) addFootageLayer(id);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = tlHeight;
    const move = (ev: PointerEvent) => {
      const h = Math.min(window.innerHeight - 260, Math.max(180, startH - (ev.clientY - startY)));
      appStore.set({ tlHeight: h });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="app">
      <MenuBar />
      <div className="workspace" style={{ gridTemplateRows: `minmax(200px, 1fr) 6px ${tlHeight}px` }}>
        <div className={`top ${leftOpen ? '' : 'no-left'}`}>
          {leftOpen ? <ProjectPanel /> : <button className="left-tab" title="Show the project panel" onClick={() => appStore.set({ leftOpen: true })}>Project</button>}
          <div className="center">
            <Toolbar />
            <Viewer />
          </div>
          <RightPanel />
        </div>
        <div className="splitter" onPointerDown={startResize} title="Drag to resize" />
        <Timeline />
      </div>
      <Dialogs />
      <Toast />
    </div>
  );
}
