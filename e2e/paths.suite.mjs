import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;
const st = () => page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; return { layers: c.layers, sel: s.selection, selVertex: s.selVertex, tool: s.tool, activeMask: s.activeMask, comps: s.project.compOrder.length }; });
const toScreen = (x, y) => page.evaluate(([x, y]) => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.left + (x / 1920) * r.width, r.top + (y / 1080) * r.height]; }, [x, y]);
try {
  await page.waitForTimeout(400);
  // a clean comp so the demo doesn't get in the way
  await page.evaluate(() => window.__ks.actions.newComp({ name: 'Paths', width: 1920, height: 1080, fps: 30, duration: 4, bg: [20, 20, 28] }));
  await page.waitForTimeout(200);

  // ---- pen tool: closed square by clicking the first vertex
  await page.keyboard.press('g');
  const pts = [[600, 300], [1000, 300], [1000, 700], [600, 700]];
  for (const [x, y] of pts) { const [sx, sy] = await toScreen(x, y); await page.mouse.click(sx, sy); }
  let [fx, fy] = await toScreen(600, 300);
  await page.mouse.click(fx, fy);
  let s = await st();
  const shape = s.layers[0];
  check('pen: clicking the first vertex closes the path into a shape layer', shape && shape.data.type === 'shape' && shape.data.shape === 'path' && shape.data.closed === true && shape.content.path.value.length === 24, `layers=${s.layers.length} verts=${shape?.content.path.value.length / 6}`);
  check('pen: tool returns to Selection', s.tool === 'select');
  await page.screenshot({ path: `${S}/40-pen-square.png` });

  // ---- pen tool: open curved path with drag-out tangents, finished with Enter
  await page.keyboard.press('g');
  const [a0x, a0y] = await toScreen(1200, 700);
  await page.mouse.move(a0x, a0y); await page.mouse.down();
  const [a1x, a1y] = await toScreen(1300, 700); await page.mouse.move(a1x, a1y, { steps: 4 }); await page.mouse.up();
  const [b0x, b0y] = await toScreen(1700, 700);
  await page.mouse.move(b0x, b0y); await page.mouse.down();
  const [b1x, b1y] = await toScreen(1800, 400); await page.mouse.move(b1x, b1y, { steps: 4 }); await page.mouse.up();
  await page.keyboard.press('Enter');
  s = await st();
  const open = s.layers[0];
  check('pen: Enter finishes an open path', open.data.shape === 'path' && open.data.closed === false && open.content.path.value.length === 12, `verts=${open.content.path.value.length / 6}`);
  const v = open.content.path.value;
  check('pen: dragging creates symmetric smooth tangents', Math.abs(v[4] + v[2]) < 1e-6 && Math.abs(v[4]) > 20, `out=${v[4]},${v[5]} in=${v[2]},${v[3]}`);
  await page.screenshot({ path: `${S}/41-pen-open.png` });

  // ---- vertex editing: drag a vertex of the open path, undo restores it
  const before = s.layers[0].content.path.value.slice(0, 2);
  const lp = open.transform.position.value;
  const [vx, vy] = await toScreen(lp[0] + before[0], lp[1] + before[1]);
  await page.mouse.move(vx, vy); await page.mouse.down();
  await page.mouse.move(vx + 40, vy - 60, { steps: 5 }); await page.mouse.up();
  s = await st();
  const after = s.layers[0].content.path.value.slice(0, 2);
  check('dragging a vertex moves it', Math.abs(after[0] - before[0]) > 30 && Math.abs(after[1] - before[1]) > 40, `${before} -> ${after}`);
  check('the dragged vertex becomes selected', s.selVertex === 0);
  await page.keyboard.press('Control+z');
  s = await st();
  check('vertex drag is a single undo step', Math.abs(s.layers[0].content.path.value[0] - before[0]) < 0.01);

  // ---- double-click a segment to insert a vertex, Delete to remove it
  const pv = s.layers[0].content.path.value; const pp = s.layers[0].transform.position.value;
  // midpoint of the first segment (approximately along the curve)
  const nBefore = pv.length / 6;
  const [m0x, m0y] = await page.evaluate(async ([pv, pp]) => { const m = await import('/src/core/path.ts'); const pts = m.toPoints(pv); const seg = [[pts[0].x, pts[0].y], [pts[0].x + pts[0].ox, pts[0].y + pts[0].oy], [pts[1].x + pts[1].ix, pts[1].y + pts[1].iy], [pts[1].x, pts[1].y]]; const q = m.bezierAt(seg, 0.5); return [q[0] + pp[0], q[1] + pp[1]]; }, [pv, pp]);
  const [m1x, m1y] = await toScreen(m0x, m0y);
  await page.mouse.dblclick(m1x, m1y);
  s = await st();
  check('double-clicking a segment inserts a vertex', s.layers[0].content.path.value.length / 6 === nBefore + 1, `${nBefore} -> ${s.layers[0].content.path.value.length / 6}`);
  check('the inserted vertex is selected', s.selVertex === 1);
  await page.keyboard.press('Delete');
  s = await st();
  check('Delete removes the selected vertex (not the layer)', s.layers[0].content.path.value.length / 6 === nBefore && s.layers.length === 2, `verts=${s.layers[0].content.path.value.length / 6} layers=${s.layers.length}`);

  // ---- masks (rendered through the real pipeline)
  const out = await page.evaluate(async () => {
    const { actions, appStore, timeStore } = window.__ks;
    const { renderComp } = await import('/src/render/renderer.ts');
    const P = await import('/src/core/path.ts');
    const W = 640, H = 360;
    actions.newComp({ name: 'M', width: W, height: H, fps: 30, duration: 2, bg: [0, 0, 0] });
    const comp = () => { const s = appStore.get(); return s.project.comps[s.activeCompId]; };
    const draw = (t = 0) => { const c = document.createElement('canvas'); renderComp(c, appStore.get().project, comp(), t, { scale: 1, mbSamples: 1 }); return c; };
    const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    const R = {};
    const id = actions.addSolid({ color: [255, 0, 0], width: W, height: H });
    const m1 = actions.addMask(id, P.rectPath(160, 90, 320, 180));
    const c1 = draw();
    R.inside = px(c1, 320, 180); R.outside = px(c1, 20, 20);
    actions.setMaskField(id, m1, { inverted: true });
    const c2 = draw(); R.invInside = px(c2, 320, 180); R.invOutside = px(c2, 20, 20);
    actions.setMaskField(id, m1, { inverted: false });
    actions.setPropValue(id, 'mask:' + m1, 'opacity', 50);
    R.half = px(draw(), 320, 180);
    actions.setPropValue(id, 'mask:' + m1, 'opacity', 100);
    actions.setPropValue(id, 'mask:' + m1, 'expansion', 40);
    R.expanded = px(draw(), 140, 180); // 20px outside the 160 edge, inside with +40 expansion
    actions.setPropValue(id, 'mask:' + m1, 'expansion', -40);
    R.eroded = px(draw(), 180, 180); // 20px inside the 160 edge, outside with -40
    actions.setPropValue(id, 'mask:' + m1, 'expansion', 0);
    actions.setPropValue(id, 'mask:' + m1, 'feather', 60);
    const cf = draw(); R.featherEdge = px(cf, 160, 180); R.featherFar = px(cf, 320, 180);
    actions.setPropValue(id, 'mask:' + m1, 'feather', 0);
    // second mask: subtract a hole
    const m2 = actions.addMask(id, P.rectPath(260, 140, 120, 80), 'subtract');
    const c3 = draw(); R.hole = px(c3, 320, 180); R.ring = px(c3, 200, 180);
    // intersect with a third
    actions.setMaskField(id, m2, { mode: 'none' });
    actions.addMask(id, P.rectPath(300, 0, 340, 360), 'intersect');
    const c4 = draw(); R.interLeft = px(c4, 200, 180); R.interRight = px(c4, 400, 180);
    // ellipse mask on text-less path, none mode ignored
    R.sameAfterNone = true;
    // animated mask path: key at t=0 and t=1, check midpoint
    const id2 = actions.addSolid({ color: [0, 255, 0], width: W, height: H });
    const mm = actions.addMask(id2, P.rectPath(0, 0, 100, 100));
    actions.toggleStopwatch(id2, 'mask:' + mm, 'path');
    timeStore.set({ t: 1 });
    actions.setPropValue(id2, 'mask:' + mm, 'path', P.rectPath(200, 0, 100, 100));
    timeStore.set({ t: 0 });
    const half = (() => { const l = comp().layers.find((x) => x.id === id2); return l.masks[0].props.path.keys.length; })();
    R.pathKeys = half;
    const tmid = 0.5;
    const cm = draw(tmid); R.animMid = px(cm, 150, 50); R.animStart = px(cm, 50, 50);
    // serialization round trip including masks and paths
    const mod = await import('/src/core/serialize.ts');
    const text = mod.serializeProject(appStore.get().project, {});
    const back = mod.parseProject(text).project;
    R.roundTrip = JSON.stringify(back) === JSON.stringify(appStore.get().project);
    // a file without masks (older version) is repaired
    const old = JSON.parse(text); for (const c of Object.values(old.project.comps)) for (const l of c.layers) delete l.masks;
    R.oldFileOk = mod.parseProject(JSON.stringify(old)).project.comps[Object.keys(old.project.comps)[0]].layers.every((l) => Array.isArray(l.masks));
    // a malformed mask path is rejected
    const bad = JSON.parse(text); const lyr = Object.values(bad.project.comps).find((c) => c.layers.some((l) => l.masks?.length)).layers.find((l) => l.masks?.length); lyr.masks[0].props.path.value = [1, 2, 3];
    try { mod.parseProject(JSON.stringify(bad)); R.badRejected = false; } catch { R.badRejected = true; }
    return R;
  });
  const near = (a, b, tol = 6) => a.every((x, i) => Math.abs(x - b[i]) <= tol);
  check('mask: inside shows layer, outside hidden', near(out.inside, [255, 0, 0, 255]) && near(out.outside, [0, 0, 0, 255]), `${out.inside} ${out.outside}`);
  check('mask: inverted flips it', near(out.invInside, [0, 0, 0, 255]) && near(out.invOutside, [255, 0, 0, 255]), `${out.invInside} ${out.invOutside}`);
  check('mask: opacity 50%', near(out.half, [128, 0, 0, 255], 4), out.half);
  check('mask: positive expansion grows it', near(out.expanded, [255, 0, 0, 255]), out.expanded);
  check('mask: negative expansion shrinks it', near(out.eroded, [0, 0, 0, 255]), out.eroded);
  check('mask: feather softens the edge', out.featherEdge[0] > 60 && out.featherEdge[0] < 200 && near(out.featherFar, [255, 0, 0, 255]), `${out.featherEdge} ${out.featherFar}`);
  check('mask: subtract cuts a hole, leaving the ring', near(out.hole, [0, 0, 0, 255]) && near(out.ring, [255, 0, 0, 255]), `${out.hole} ${out.ring}`);
  check('mask: intersect keeps only the overlap', near(out.interLeft, [0, 0, 0, 255]) && near(out.interRight, [255, 0, 0, 255]), `${out.interLeft} ${out.interRight}`);
  check('animated mask path interpolates between keyframes', out.pathKeys === 2 && near(out.animMid, [0, 255, 0, 255]) && near(out.animStart, [0, 0, 0, 255]), `keys=${out.pathKeys} mid=${out.animMid}`);
  check('project with masks + paths round-trips exactly', out.roundTrip);
  check('older files without masks load', out.oldFileOk);
  check('corrupt mask paths are rejected', out.badRejected);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
