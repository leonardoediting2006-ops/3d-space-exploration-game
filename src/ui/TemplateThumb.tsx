import { useEffect, useRef, useState } from 'react';
import { renderComp } from '../render/renderer';
import { buildPreview, THUMB_H, THUMB_W } from '../templates/preview';
import type { LibraryItem } from '../templates';

/**
 * A live thumbnail: the template is applied to a small sample composition and rendered with the real
 * renderer. It is built lazily when scrolled into view, and plays while hovered.
 */
export function TemplateThumb({ item }: { item: LibraryItem }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const drawAt = (t: number) => {
    const spec = buildPreview(item);
    const el = canvas.current;
    if (!spec || !el) return false;
    renderComp(el, spec.project, spec.comp, Math.min(t, spec.comp.duration - 1 / spec.comp.fps), { scale: spec.scale, mbSamples: 0 });
    return true;
  };

  useEffect(() => {
    if (!visible) return;
    if (!drawAt(buildPreview(item)?.still ?? 0)) setFailed(true);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item.id]);

  const play = () => {
    const spec = buildPreview(item);
    if (!spec || spec.length <= 0.15) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      drawAt(((now - t0) / 1000) % spec.length);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    const spec = buildPreview(item);
    if (spec) drawAt(spec.still);
  };

  return (
    <canvas
      ref={canvas}
      className={`tpl-thumb ${failed ? 'failed' : ''}`}
      width={THUMB_W}
      height={THUMB_H}
      onPointerEnter={play}
      onPointerLeave={stop}
    />
  );
}
