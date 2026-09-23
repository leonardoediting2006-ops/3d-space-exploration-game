import { useEffect, useState } from 'react';
import { WorldView } from './game/ui/WorldView';
import { Hud } from './game/ui/Hud';
import { useGameStore } from './game/state/store';

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export default function App() {
  const [debug, setDebug] = useState(false);
  const sceneReady = useGameStore((state) => state.sceneReady);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(event.target) || event.repeat) return;
      const store = useGameStore.getState();
      if (event.code === 'Escape') {
        if (store.discoveryPopup) store.dismissDiscovery();
        else store.setPanel(null);
        store.setAutopilot(false);
        return;
      }
      if (event.code === 'KeyR') {
        event.preventDefault();
        store.scan();
      } else if (event.code === 'KeyE') {
        store.interact();
      } else if (event.code === 'KeyM') {
        store.setPanel(store.activePanel === 'map' ? null : 'map');
      } else if (event.code === 'Tab') {
        event.preventDefault();
        store.setPanel(store.activePanel === 'inventory' ? null : 'inventory');
      } else if (event.code === 'KeyJ') {
        store.setPanel(store.activePanel === 'missions' ? null : 'missions');
      } else if (event.code === 'F1' && import.meta.env.DEV) {
        event.preventDefault();
        setDebug((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="game-shell">
      <WorldView />
      <Hud />
      {!sceneReady && <div className="scene-loading"><span className="loading-orbit"><i /></span><span className="eyebrow">CALIBRATING FLIGHT DECK</span></div>}
      {debug && import.meta.env.DEV && <div className="debug-panel"><strong>DEVELOPER TELEMETRY</strong><span>SEED · {useGameStore.getState().game.galaxySeed}</span><span>SYSTEM · {useGameStore.getState().game.currentSystemId}</span><span>MODE · {useGameStore.getState().game.location}</span><span>F1 TO CLOSE</span></div>}
    </main>
  );
}
