import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/store';
import { WorldRenderer } from '../engine/WorldRenderer';
import { CanvasFallbackRenderer } from '../engine/CanvasFallback';

export function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [compatibilityMode, setCompatibilityMode] = useState(false);
  const setSceneReady = useGameStore((state) => state.setSceneReady);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose: (() => void) | undefined;
    try {
      const probe = document.createElement('canvas');
      const webglAvailable = Boolean(probe.getContext('webgl2'));
      if (!webglAvailable) {
        const fallback = new CanvasFallbackRenderer(canvas);
        dispose = () => fallback.dispose();
        setCompatibilityMode(true);
      } else {
        const world = new WorldRenderer(canvas);
        dispose = () => world.dispose();
      }
      setSceneReady(true);
    } catch {
      try {
        const fallback = new CanvasFallbackRenderer(canvas);
        dispose = () => fallback.dispose();
        setCompatibilityMode(true);
        setSceneReady(true);
      } catch {
        setError(true);
        setSceneReady(false);
      }
    }
    return () => {
      dispose?.();
      setSceneReady(false);
    };
  }, [setSceneReady]);

  return (
    <div className="world-layer" aria-label="Expedition world">
      <canvas ref={canvasRef} className="world-canvas" aria-label="Three-dimensional star system" />
      <div className="world-vignette" />
      {error && (
        <div className="webgl-error" role="alert">
          <span className="eyebrow">FLIGHT DECK UNAVAILABLE</span>
          <h2>3D rendering could not be initialized.</h2>
          <p>Enable WebGL in this browser or try a desktop browser with hardware acceleration. Your expedition save is safe.</p>
        </div>
      )}
      {compatibilityMode && <div className="compatibility-badge"><span /> COMPATIBILITY VIEW · SOFTWARE RENDER</div>}
    </div>
  );
}
