import { open } from './lib.mjs';

const { page, check, finish } = await open();

try {
  const R = await page.evaluate(async () => {
    const { actions, appStore } = window.__ks;
    const { renderComp } = await import('/src/render/renderer.ts');
    const G = await import('/src/core/gradient.ts');
    const W = 640, H = 360;
    actions.newComp({ name: 'T', width: W, height: H, fps: 30, duration: 4, bg: [0, 0, 0] });
    const comp = () => { const s = appStore.get(); return s.project.comps[s.activeCompId]; };
    const draw = (t = 0) => { const c = document.createElement('canvas'); renderComp(c, appStore.get().project, comp(), t, { scale: 1, mbSamples: 1 }); return c; };
    const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    const clear = () => actions.deleteLayers(comp().layers.map((l) => l.id));
    const fxOf = (id) => comp().layers.find((l) => l.id === id).effects.at(-1);
    const setFx = (id, vals) => { const fx = fxOf(id); for (const [k, v] of Object.entries(vals)) actions.setPropValue(id, 'fx:' + fx.id, k, v); };
    const out = {};

    // ---- gradient fill on a white solid, black -> white
    const bw = G.makeGradient(['#000000', '#ffffff']);
    clear();
    let id = actions.addSolid({ color: [255, 255, 255], width: W, height: H });
    actions.addEffect([id], 'gradientFill');
    setFx(id, { gradient: bw, angle: 90 });
    let c = draw();
    out.linTop = px(c, 320, 2); out.linMid = px(c, 320, 180); out.linBottom = px(c, 320, 357);
    setFx(id, { angle: 0 });
    c = draw(); out.linLeft = px(c, 2, 180); out.linRight = px(c, 637, 180);
    setFx(id, { angle: 90, type: 1 });
    c = draw(); out.radCenter = px(c, 320, 180); out.radCorner = px(c, 2, 2);
    setFx(id, { type: 3 });
    c = draw(); out.refCenter = px(c, 320, 180); out.refTop = px(c, 320, 2); out.refBottom = px(c, 320, 357);
    setFx(id, { type: 0, repeats: 2, mode: 1 });
    c = draw(); out.rep25 = px(c, 320, 90); out.rep75 = px(c, 320, 270);
    setFx(id, { repeats: 1, mode: 1, offset: 50 });
    c = draw(); out.phaseTop = px(c, 320, 1);
    setFx(id, { offset: 0, mode: 0, type: 2, angle: 0 });
    c = draw(); out.angA = px(c, 520, 180); out.angB = px(c, 120, 180);
    setFx(id, { type: 0, angle: 90, amount: 50 });
    c = draw(); out.amountTop = px(c, 320, 2); // black blended 50% over white
    // animated gradient colours
    setFx(id, { amount: 100 });
    actions.toggleStopwatch(id, 'fx:' + fxOf(id).id, 'gradient');
    window.__ks.timeStore.set({ t: 0 });
    actions.setPropValue(id, 'fx:' + fxOf(id).id, 'gradient', G.makeGradient(['#ff0000', '#ff0000']), 0);
    window.__ks.timeStore.set({ t: 1 });
    actions.setPropValue(id, 'fx:' + fxOf(id).id, 'gradient', G.makeGradient(['#0000ff', '#0000ff']), 1);
    window.__ks.timeStore.set({ t: 0 });
    out.animGradT0 = px(draw(0), 320, 180); out.animGradHalf = px(draw(0.5), 320, 180); out.animGradT1 = px(draw(1), 320, 180);

    // ---- gradient on text (left red -> right blue)
    clear();
    const bbox = (cv, pred) => { const { width: w, height: h } = cv; const d = cv.getContext('2d').getImageData(0, 0, w, h).data; let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (pred(d[i], d[i + 1], d[i + 2], d[i + 3])) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { x0, x1, y0, y1, n }; };
    const lit = (r, g, b) => r + g + b > 60;
    const tid = actions.addText('GRADIENT', [320, 200]);
    actions.setPropValue(tid, 'content', 'fontSize', 110);
    actions.addEffect([tid], 'gradientFill');
    setFx(tid, { gradient: G.makeGradient(['#ff0000', '#0000ff']), angle: 0 });
    c = draw();
    const bb = bbox(c, lit);
    const rowY = Math.round((bb.y0 + bb.y1) / 2);
    // find a lit pixel near left and right extremes along the middle row
    const scan = (from, to, step) => { for (let x = from; x !== to; x += step) { const p = px(c, x, rowY); if (lit(p[0], p[1], p[2])) return p; } return [0, 0, 0, 0]; };
    out.textLeft = scan(bb.x0, bb.x1, 1); out.textRight = scan(bb.x1, bb.x0, -1);

    // ---- text animators
    clear();
    const ty = actions.addText('ABCDEFGH', [320, 200]);
    actions.setPropValue(ty, 'content', 'fontSize', 80);
    const base = bbox(draw(), lit);
    out.baseBox = base;
    const aid = actions.addTextAnimator(ty, 'opacity');
    const A = () => comp().layers.find((l) => l.id === ty).animators.find((a) => a.id === aid);
    // typewriter: range start sweeps 0 -> 100, crisp per character
    actions.setPropValue(ty, 'anim:' + aid, 'smooth', 0);
    actions.toggleStopwatch(ty, 'anim:' + aid, 'start');
    actions.setPropValue(ty, 'anim:' + aid, 'start', 0, 0);
    actions.setPropValue(ty, 'anim:' + aid, 'start', 100, 1);
    const n0 = bbox(draw(0), lit).n, nHalf = bbox(draw(0.5), lit).n, n1 = bbox(draw(1), lit).n;
    out.typewriter = [n0, nHalf, n1];
    out.typewriterFull = bbox(draw(1), lit).n >= base.n * 0.98;
    // the revealed part sits on the left
    const half = bbox(draw(0.5), lit);
    out.typewriterLeft = half.x0 <= base.x0 + 3 && half.x1 < base.x1 - 20;
    // position animator shifts everything
    clear();
    const tp = actions.addText('ABCDEFGH', [320, 200]); actions.setPropValue(tp, 'content', 'fontSize', 80);
    const pid = actions.addTextAnimator(tp, 'position');
    actions.setPropValue(tp, 'anim:' + pid, 'position', [0, -100]);
    const moved = bbox(draw(), lit);
    out.posShift = Math.round(base.y0 - moved.y0);
    // tracking widens
    clear();
    const tt = actions.addText('ABCDEFGH', [320, 200]); actions.setPropValue(tt, 'content', 'fontSize', 80);
    const trk = actions.addTextAnimator(tt, 'tracking');
    actions.setPropValue(tt, 'anim:' + trk, 'tracking', 30);
    const wide = bbox(draw(), lit);
    out.trackWider = (wide.x1 - wide.x0) - (base.x1 - base.x0);
    // colour mix on the first half
    clear();
    const tc = actions.addText('ABCDEFGH', [320, 200]); actions.setPropValue(tc, 'content', 'fontSize', 80);
    const cid = actions.addTextAnimator(tc, 'color');
    actions.setPropValue(tc, 'anim:' + cid, 'end', 50); actions.setPropValue(tc, 'anim:' + cid, 'smooth', 0);
    actions.setPropValue(tc, 'anim:' + cid, 'color', [255, 0, 0]);
    c = draw(); const cb = bbox(c, lit); const cy = Math.round((cb.y0 + cb.y1) / 2);
    const scanC = (from, to, step) => { for (let x = from; x !== to; x += step) { const p = px(c, x, cy); if (Math.max(p[0], p[1], p[2]) > 230) return p; } return [0, 0, 0, 0]; };
    out.colLeft = scanC(cb.x0, cb.x1, 1); out.colRight = scanC(cb.x1, cb.x0, -1);
    // words & lines units
    clear();
    const tw = actions.addText('AAA BBB', [320, 200]); actions.setPropValue(tw, 'content', 'fontSize', 80);
    const wid = actions.addTextAnimator(tw, 'opacity');
    actions.setPropValue(tw, 'anim:' + wid, 'units', 1); actions.setPropValue(tw, 'anim:' + wid, 'start', 50); actions.setPropValue(tw, 'anim:' + wid, 'smooth', 0);
    const wb = bbox(draw(), lit); out.wordsHalf = wb.x1 < base.x1 && (wb.x1 - wb.x0) < (base.x1 - base.x0) * 0.8;
    clear();
    const tl = actions.addText('TOP\nBOTTOM', [320, 180]); actions.setPropValue(tl, 'content', 'fontSize', 70);
    const full = bbox(draw(), lit);
    const lid = actions.addTextAnimator(tl, 'opacity');
    actions.setPropValue(tl, 'anim:' + lid, 'units', 2); actions.setPropValue(tl, 'anim:' + lid, 'start', 50); actions.setPropValue(tl, 'anim:' + lid, 'smooth', 0);
    const topOnly = bbox(draw(), lit); out.linesTopOnly = topOnly.y1 < (full.y0 + full.y1) / 2 + 10;
    // randomised order keeps the same total coverage but hides non-contiguous characters
    clear();
    const tr = actions.addText('ABCDEFGHIJ', [320, 200]); actions.setPropValue(tr, 'content', 'fontSize', 60);
    const rid = actions.addTextAnimator(tr, 'opacity');
    actions.setPropValue(tr, 'anim:' + rid, 'end', 50); actions.setPropValue(tr, 'anim:' + rid, 'smooth', 0);
    const orderedBox = bbox(draw(), lit);
    actions.setPropValue(tr, 'anim:' + rid, 'random', 1);
    const randBox = bbox(draw(), lit);
    out.randomSpansWider = (randBox.x1 - randBox.x0) > (orderedBox.x1 - orderedBox.x0) * 1.2;
    // stays correct with motion blur on (animator props are part of the fingerprint)
    actions.updateComp(comp().id, { motionBlur: true });
    actions.setLayerField(tr, { motionBlur: true });
    actions.toggleStopwatch(tr, 'anim:' + rid, 'offset');
    actions.setPropValue(tr, 'anim:' + rid, 'offset', 0, 0);
    actions.setPropValue(tr, 'anim:' + rid, 'offset', 80, 1 / 30);
    const mbA = bbox((() => { const cv = document.createElement('canvas'); renderComp(cv, appStore.get().project, comp(), 1 / 60, { scale: 1, mbSamples: 8 }); return cv; })(), lit).n;
    const mbB = bbox((() => { const cv = document.createElement('canvas'); renderComp(cv, appStore.get().project, comp(), 1 / 60, { scale: 1, mbSamples: 1 }); return cv; })(), lit).n;
    out.mbRenders = mbA > 0 && mbB > 0;
    // serialization
    const S = await import('/src/core/serialize.ts');
    const text = S.serializeProject(appStore.get().project, {});
    out.roundTrip = JSON.stringify(S.parseProject(text).project) === JSON.stringify(appStore.get().project);
    const bad = JSON.parse(text); const cmp = Object.values(bad.project.comps).find((cc) => cc.layers.some((l) => l.animators?.length)); cmp.layers.find((l) => l.animators?.length).animators[0].props.units.kind = 'bogus';
    try { S.parseProject(JSON.stringify(bad)); out.badRejected = false; } catch { out.badRejected = true; }
    const badG = JSON.parse(text); void badG;
    return out;
  });

  const near = (a, b, tol = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  check('gradient fill: linear top→bottom', R.linTop[0] < 10 && near(R.linMid, [128, 128, 128, 255], 6) && R.linBottom[0] > 245, [R.linTop, R.linMid, R.linBottom]);
  check('gradient fill: angle 0 runs left→right', R.linLeft[0] < 10 && R.linRight[0] > 245, [R.linLeft, R.linRight]);
  check('gradient fill: radial starts at the center', R.radCenter[0] < 10 && R.radCorner[0] > 240, [R.radCenter, R.radCorner]);
  check('gradient fill: reflected mirrors from the center', R.refCenter[0] < 10 && R.refTop[0] > 240 && R.refBottom[0] > 240, [R.refCenter, R.refTop, R.refBottom]);
  check('gradient fill: repeats tile the gradient', near(R.rep25, [128, 128, 128, 255], 10) && near(R.rep75, [128, 128, 128, 255], 10), [R.rep25, R.rep75]);
  check('gradient fill: phase shifts the pattern', near(R.phaseTop, [128, 128, 128, 255], 10), R.phaseTop);
  check('gradient fill: angular differs around the center', Math.abs(R.angA[0] - R.angB[0]) > 60, [R.angA, R.angB]);
  check('gradient fill: amount blends with the original', near(R.amountTop, [128, 128, 128, 255], 10), R.amountTop);
  check('gradient colours keyframe over time', near(R.animGradT0, [255, 0, 0, 255], 4) && near(R.animGradHalf, [128, 0, 128, 255], 6) && near(R.animGradT1, [0, 0, 255, 255], 4), [R.animGradT0, R.animGradHalf, R.animGradT1]);
  check('gradient fill makes gradient text (red on the left, blue on the right)', R.textLeft[0] > R.textLeft[2] + 60 && R.textRight[2] > R.textRight[0] + 60, [R.textLeft, R.textRight]);

  check('typewriter animator reveals characters over time', R.typewriter[0] === 0 && R.typewriter[0] < R.typewriter[1] && R.typewriter[1] < R.typewriter[2], R.typewriter);
  check('typewriter ends fully revealed, growing from the left', R.typewriterFull && R.typewriterLeft);
  check('position animator displaces the text by its offset', Math.abs(R.posShift - 100) <= 2, R.posShift);
  check('tracking animator widens the text', R.trackWider > 150, R.trackWider);
  check('colour animator tints only the covered characters', R.colLeft[0] > 200 && R.colLeft[1] < 80 && R.colRight[1] > 200, [R.colLeft, R.colRight]);
  check('word-based ranges hide whole words', R.wordsHalf);
  check('line-based ranges hide whole lines', R.linesTopOnly);
  check('randomised order scatters the covered characters', R.randomSpansWider);
  check('animated text renders with motion blur on', R.mbRenders);
  check('project with gradients + animators round-trips', R.roundTrip);
  check('corrupt animator properties are rejected', R.badRejected);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
