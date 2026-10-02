// 3D layers, cameras and lights: the switch, the projection, depth order, lighting, picking and moving.
import { open } from './lib.mjs';

const { page, check, finish } = await open();
const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const layerOf = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n) ?? null)); }, name);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** Render the active comp at time t and return a pixel sampler and the canvas size. */
const px = (points, t = 0) => A(async (ks, pts, time) => {
  const r = await import('/src/render/renderer.ts');
  const s = ks.appStore.get();
  const comp = s.project.comps[s.activeCompId];
  const c = document.createElement('canvas');
  r.renderComp(c, s.project, comp, time, { scale: 1, mbSamples: 0 });
  const g = c.getContext('2d');
  return pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data));
}, points, t);
const isRed = (p) => p[0] > 180 && p[1] < 110 && p[2] < 110;
const isBlue = (p) => p[2] > 180 && p[0] < 110;
const isBg = (p) => p[0] < 50 && p[1] < 50 && p[2] < 80;

const setProp = (name, group, key, value) => A((ks, n, g, k, v) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === n); ks.actions.setPropValue(l.id, g, k, v); }, name, group, key, value);
const flag = (name, patch) => A((ks, n, p) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === n); ks.actions.setLayerField(l.id, p); }, name, patch);

try {
  // a 960×540 stage with a dark background and two 400×240 cards
  await A((ks) => {
    const a = ks.actions;
    const s0 = ks.appStore.get();
    a.updateComp(s0.activeCompId, { width: 960, height: 540, duration: 6, workStart: 0, workEnd: 6, motionBlur: false });
    a.deleteLayers(ks.appStore.get().project.comps[s0.activeCompId].layers.map((l) => l.id));
    const bg = a.addSolid({ name: 'bg', color: [20, 20, 40], width: 960, height: 540 });
    const red = a.addSolid({ name: 'red', color: [230, 60, 60], width: 400, height: 240 });
    const blue = a.addSolid({ name: 'blue', color: [60, 120, 240], width: 400, height: 240 });
    a.setPropValue(red, 'transform', 'position', [480, 270]);
    a.setPropValue(blue, 'transform', 'position', [480, 270]);
    a.setLayerField(blue, { visible: false });
    a.selectLayers([red]);
    a.setTime(0);
  });
  await page.waitForTimeout(300);

  // ---- the 3D switch
  const idx = (name) => A((ks, n) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.findIndex((l) => l.name === n); }, name);
  check('layer rows have a 3D switch', (await page.locator(`[data-testid=three-${await idx('red')}]`).count()) === 1);
  check('the Inspector has a 3D chip but no Z controls yet', (await page.locator('[data-testid=toggle-3d]').count()) === 1 && (await page.locator('[data-testid=ins-positionZ]').count()) === 0);
  await page.click('[data-testid=toggle-3d]');
  check('turning 3D on marks the layer', (await layerOf('red')).threeD === true);
  check('and adds Position Z, X Rotation and Y Rotation, with Rotation renamed Z Rotation', (await page.locator('[data-testid=ins-positionZ]').count()) === 1 && (await page.locator('[data-testid=ins-rotationX]').count()) === 1 && (await page.locator('[data-testid=ins-rotationY]').count()) === 1 && /Z Rotation/.test(await page.locator('[data-testid=ins-rotation]').innerText()));
  await page.click('[data-testid=toggle-3d]');
  check('turning it off again hides them', (await page.locator('[data-testid=ins-positionZ]').count()) === 0 && (await layerOf('red')).threeD === false);
  await page.click(`[data-testid=three-${await idx('red')}]`);
  check('the timeline switch does the same', (await layerOf('red')).threeD === true);
  await page.click(`[data-testid=twirl-${await idx('red')}]`);
  check('the timeline lists the 3D properties for a 3D layer', (await page.locator('[data-testid=prop-positionZ]').count()) === 1 && (await page.locator('[data-testid=prop-rotationY]').count()) === 1);
  await page.click(`[data-testid=twirl-${await idx('bg')}]`);
  check('but not for a 2D layer', (await page.locator('[data-testid=prop-rotationX]').count()) === 1);
  await page.click(`[data-testid=twirl-${await idx('red')}]`);
  await page.click(`[data-testid=twirl-${await idx('bg')}]`);

  // ---- without a camera: flat, only tilted
  await setProp('red', 'transform', 'rotationY', 60);
  let p = await px([[385, 270], [370, 270], [575, 270], [590, 270], [480, 153], [480, 147]]);
  check('a layer turned 60° about Y is half as wide (cos 60°) and still centred', isRed(p[0]) && isBg(p[1]) && isRed(p[2]) && isBg(p[3]), JSON.stringify(p.slice(0, 4)));
  check('and keeps its height without perspective', isRed(p[4]) && isBg(p[5]), JSON.stringify(p.slice(4)));
  await setProp('red', 'transform', 'positionZ', 800);
  p = await px([[385, 270], [370, 270]]);
  check('Z alone does nothing to a flat view', isRed(p[0]) && isBg(p[1]));
  await setProp('red', 'transform', 'positionZ', 0);
  await setProp('red', 'transform', 'rotationY', 0);

  // ---- a camera
  await A((ks) => ks.actions.addCamera());
  await page.waitForTimeout(200);
  const cam = await layerOf('Camera 1');
  check('Add camera makes a camera layer with the default lens', cam && cam.type === 'camera' && cam.threeD === true && Math.abs(cam.content.zoom.value - (960 * 50) / 36) < 0.01 && Math.abs(cam.transform.positionZ.value + cam.content.zoom.value) < 0.01, cam && JSON.stringify([cam.type, cam.content.zoom.value, cam.transform.positionZ.value]));
  check('the camera\'s Inspector offers its lens and point of interest, not picture sections', (await page.locator('[data-testid=ins-zoom]').count()) === 1 && (await page.locator('[data-testid=ins-poi]').count()) === 1 && (await page.locator('[data-testid=section-effects]').count()) === 0 && (await page.locator('[data-testid=ins-positionZ]').count()) === 1);
  p = await px([[281, 270], [278, 270], [679, 270], [682, 270], [480, 151], [480, 148]]);
  check('with the default camera a 3D layer at Z = 0 is exactly where it was (400 wide at 280–680)', isRed(p[0]) && isBg(p[1]) && isRed(p[2]) && isBg(p[3]) && isRed(p[4]) && isBg(p[5]), JSON.stringify(p));

  const zoom = cam.content.zoom.value;
  await setProp('red', 'transform', 'positionZ', zoom);
  p = await px([[381, 270], [378, 270], [579, 270], [582, 270]]);
  check('twice as far from the camera it is half the size', isRed(p[0]) && isBg(p[1]) && isRed(p[2]) && isBg(p[3]), JSON.stringify(p));
  await setProp('red', 'transform', 'positionZ', -zoom / 2);
  p = await px([[83, 270], [77, 270], [877, 270], [883, 270]]);
  check('and nearer it grows (half the distance is twice the size)', isRed(p[0]) && isBg(p[1]) && isRed(p[2]) && isBg(p[3]), JSON.stringify(p));
  await setProp('red', 'transform', 'positionZ', 0);

  // ---- perspective is exact: compare the picture with the projected outline
  await setProp('red', 'transform', 'rotationY', 55);
  await setProp('red', 'transform', 'rotationX', 20);
  await A((ks) => { const s = ks.appStore.get(); const c = s.project.comps[s.activeCompId].layers.find((l) => l.name === 'Camera 1'); ks.actions.setPropValue(c.id, 'transform', 'position', [700, 200]); ks.actions.setPropValue(c.id, 'content', 'poi', [480, 270]); });
  const poly = await A(async (ks) => { const g = await import('/src/render/geometry.ts'); const s = ks.appStore.get(); const comp = s.project.comps[s.activeCompId]; const l = comp.layers.find((x) => x.name === 'red'); return g.layerPolygon(s.project, comp, l, 0); });
  check('the outline of a tilted layer seen from a moved camera is a quadrilateral', Array.isArray(poly) && poly.length === 4, JSON.stringify(poly));
  const cx = poly.reduce((a, q) => a + q[0], 0) / 4;
  const cy = poly.reduce((a, q) => a + q[1], 0) / 4;
  const probes = [];
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(cx - mx, cy - my);
    probes.push([Math.round(mx + ((cx - mx) / len) * 4), Math.round(my + ((cy - my) / len) * 4)], [Math.round(mx - ((cx - mx) / len) * 4), Math.round(my - ((cy - my) / len) * 4)]);
  }
  p = await px(probes);
  const inside = p.filter((_, i) => i % 2 === 0);
  const outside = p.filter((_, i) => i % 2 === 1);
  check('just inside every edge of the projected outline is the layer', inside.every(isRed), JSON.stringify(inside));
  check('and just outside is the background', outside.every(isBg), JSON.stringify(outside));
  const nearEdge = Math.hypot(poly[3][0] - poly[0][0], poly[3][1] - poly[0][1]);
  const farEdge = Math.hypot(poly[2][0] - poly[1][0], poly[2][1] - poly[1][1]);
  check('perspective shrinks the far side', Math.abs(nearEdge - farEdge) > 4, `${nearEdge.toFixed(1)} vs ${farEdge.toFixed(1)}`);

  // ---- the viewer picks what is in front, by the real outline
  await A((ks) => ks.actions.selectLayers([]));
  const box = await page.locator('[data-testid=comp-canvas]').boundingBox();
  const toPage = (x, y) => ({ x: box.x + (x / 960) * box.width, y: box.y + (y / 540) * box.height });
  const inPt = toPage(cx, cy);
  await page.mouse.click(inPt.x, inPt.y);
  check('clicking the tilted layer selects it', (await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.find((l) => l.id === s.selection[0])?.name; })) === 'red');
  await A((ks) => ks.actions.selectLayers([]));
  const bounds2D = { x: 480 - 195, y: 270 - 115 }; // inside the untilted rectangle, outside the projected quad
  const outPt = [[bounds2D.x, bounds2D.y], [bounds2D.x + 390, bounds2D.y], [bounds2D.x, bounds2D.y + 230]].map(([x, y]) => ({ x, y })).find((q) => {
    // pick whichever corner lies outside the projected polygon
    const inside = (() => { let ins = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if (yi > q.y !== yj > q.y && q.x < ((xj - xi) * (q.y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; })();
    return !inside;
  });
  const outPage = toPage(outPt.x, outPt.y);
  await page.mouse.click(outPage.x, outPage.y);
  check('clicking where the flat rectangle would be, but the tilted layer is not, does not select it', (await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.find((l) => l.id === s.selection[0])?.name ?? null; })) !== 'red', JSON.stringify(outPt));

  // ---- reset to a clean frontal scene for depth and lighting
  await setProp('red', 'transform', 'rotationY', 0);
  await setProp('red', 'transform', 'rotationX', 0);
  await A((ks) => { const s = ks.appStore.get(); const c = s.project.comps[s.activeCompId].layers.find((l) => l.name === 'Camera 1'); ks.actions.setPropValue(c.id, 'transform', 'position', [480, 270]); ks.actions.setPropValue(c.id, 'content', 'poi', [480, 270]); });

  // ---- depth order
  await flag('blue', { visible: true, threeD: true });
  await setProp('blue', 'transform', 'position', [560, 270]);
  await setProp('red', 'transform', 'position', [400, 270]);
  // stack: blue is above red. Blue nearer: blue on top. Red nearer: red on top, though lower in the stack.
  await setProp('blue', 'transform', 'positionZ', -100);
  await setProp('red', 'transform', 'positionZ', 100);
  p = await px([[480, 270]]);
  check('the nearer layer is in front', isBlue(p[0]), JSON.stringify(p));
  await setProp('blue', 'transform', 'positionZ', 100);
  await setProp('red', 'transform', 'positionZ', -100);
  p = await px([[480, 270]]);
  check('even if it is lower in the stack', isRed(p[0]), JSON.stringify(p));
  // a 2D layer in between is a barrier: sorting does not reach across it
  await A((ks) => { const s = ks.appStore.get(); const a = ks.actions; const id = a.addSolid({ name: 'barrier', color: [40, 200, 90], width: 40, height: 40 }); a.setPropValue(id, 'transform', 'position', [480, 270]); const comp = ks.appStore.get().project.comps[s.activeCompId]; const bi = comp.layers.findIndex((l) => l.name === 'blue'); a.moveLayerToIndex(id, bi + 1); });
  p = await px([[480, 270]]);
  check('a 2D layer between two 3D layers keeps the stack order across it (blue is above, so it wins despite being farther)', isBlue(p[0]), JSON.stringify(p));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'barrier'); ks.actions.deleteLayers([l.id]); });

  // ---- lighting
  await setProp('blue', 'transform', 'positionZ', 0);
  await flag('blue', { visible: false });
  await setProp('red', 'transform', 'position', [480, 270]);
  await setProp('red', 'transform', 'positionZ', 0);
  p = await px([[480, 270]]);
  const unlit = p[0];
  check('with no lights a layer shows its true colour', near(unlit[0], 230, 2) && near(unlit[1], 60, 2) && near(unlit[2], 60, 2), JSON.stringify(unlit));
  await A((ks) => { const a = ks.actions; const id = a.addLight('ambient'); a.setPropValue(id, 'content', 'intensity', 40); });
  p = await px([[480, 270], [300, 400]]);
  check('an ambient light at 40 % dims it to 40 %', near(p[0][0], 230 * 0.4, 3) && near(p[0][1], 60 * 0.4, 3), JSON.stringify(p));
  const spot = await A((ks) => ks.actions.addLight('spot'));
  await A((ks, id) => { const a = ks.actions; a.setPropValue(id, 'transform', 'position', [480, 100]); a.setPropValue(id, 'transform', 'positionZ', -500); a.setPropValue(id, 'content', 'poi', [480, 270]); a.setPropValue(id, 'content', 'poiZ', 0); a.setPropValue(id, 'content', 'cone', 40); a.setPropValue(id, 'content', 'feather', 60); a.setPropValue(id, 'content', 'intensity', 60); const amb = ks.appStore.get().project.comps[ks.appStore.get().activeCompId].layers.find((l) => l.type === 'light' && l.name !== ks.appStore.get().project.comps[ks.appStore.get().activeCompId].layers.find((x) => x.id === id).name); if (amb) a.setPropValue(amb.id, 'content', 'intensity', 15); }, spot);
  // compare the picture with the reference shading at several points on the card
  const pts = [[480, 270], [380, 200], [580, 330], [300, 160], [660, 380], [480, 160]];
  const got = await px(pts);
  const want = await A(async (ks, points) => {
    const sc = await import('/src/core/scene3d.ts');
    const m4 = await import('/src/core/math3.ts');
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const l = comp.layers.find((x) => x.name === 'red');
    const scene = sc.sceneAt(comp, 0);
    const model = sc.worldModel(l, 0, new Map(comp.layers.map((x) => [x.id, x])));
    const H = sc.planeHomography(scene.view, model);
    return points.map(([x, y]) => {
      const uv = sc.unprojectToLayer(H, x, y);
      const f = sc.shade(scene.lights, m4.point4(model, [uv[0], uv[1], 0]), sc.planeNormal(model));
      return [230 * f[0], 60 * f[1], 60 * f[2]];
    });
  }, pts);
  const errs = got.map((g, i) => Math.max(Math.abs(g[0] - want[i][0]), Math.abs(g[1] - want[i][1]), Math.abs(g[2] - want[i][2])));
  check('the GPU shading matches the reference shading at six points', errs.every((e) => e <= 4), JSON.stringify({ errs: errs.map((e) => +e.toFixed(1)), got: got.map((g) => g[0]), want: want.map((w) => Math.round(w[0])) }));
  check('the spot light makes the middle brighter than the far corner', got[0][0] > got[4][0] + 30, JSON.stringify([got[0][0], got[4][0]]));
  await A((ks, id) => ks.actions.setLayerField(id, { visible: false }), spot);
  p = await px([[480, 270]]);
  check('turning the spot off leaves just the ambient light', near(p[0][0], 34.5, 3), JSON.stringify(p));
  const lightIds = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.filter((l) => l.type === 'light').map((l) => l.id); });
  await A((ks, ids) => ks.actions.deleteLayers(ids), lightIds);
  p = await px([[480, 270]]);
  check('with the lights gone it is unshaded again', near(p[0][0], 230, 2), JSON.stringify(p));
  // 2D layers are never lit
  await A((ks) => { ks.actions.addLight('ambient'); });
  await flag('bg', { threeD: false });
  p = await px([[10, 10]]);
  check('2D layers ignore lights', near(p[0][2], 40, 2), JSON.stringify(p));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.type === 'light'); ks.actions.deleteLayers([l.id]); });

  // ---- effects, masks, opacity and blend modes work on the plane
  await setProp('red', 'transform', 'rotationY', 40);
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'red'); ks.actions.addEffect([l.id], 'invert'); });
  p = await px([[480, 270]]);
  check('effects apply to a 3D layer before it is projected (Invert)', near(p[0][0], 25, 4) && near(p[0][1], 195, 4), JSON.stringify(p));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'red'); ks.actions.removeEffect(l.id, l.effects[0].id); ks.actions.addStarterMask(l.id, 'ellipse'); });
  const mpoly = await A(async (ks) => { const g = await import('/src/render/geometry.ts'); const s = ks.appStore.get(); const comp = s.project.comps[s.activeCompId]; return g.layerPolygon(s.project, comp, comp.layers.find((x) => x.name === 'red'), 0); });
  const mc = [mpoly.reduce((a, q) => a + q[0], 0) / 4, mpoly.reduce((a, q) => a + q[1], 0) / 4];
  const nearCorner = [Math.round(mpoly[0][0] + 0.07 * (mc[0] - mpoly[0][0])), Math.round(mpoly[0][1] + 0.07 * (mc[1] - mpoly[0][1]))];
  p = await px([[480, 270], nearCorner]);
  check('masks cut the plane (an ellipse mask leaves the corner empty)', isRed(p[0]) && !isRed(p[1]), JSON.stringify({ p, nearCorner }));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'red'); ks.actions.removeMask(l.id, l.masks[0].id); ks.actions.setPropValue(l.id, 'transform', 'opacity', 50); });
  p = await px([[480, 270]]);
  check('opacity blends the projected layer with what is behind', near(p[0][0], (230 + 20) / 2, 6), JSON.stringify(p));
  await setProp('red', 'transform', 'opacity', 100);

  // ---- parenting to a rotating 3D null makes the camera orbit
  await setProp('red', 'transform', 'rotationY', 0);
  await A((ks) => {
    const a = ks.actions;
    const s = ks.appStore.get();
    const comp = () => ks.appStore.get().project.comps[s.activeCompId];
    const rig = a.addNull();
    a.setLayerField(rig, { name: 'rig', threeD: true });
    a.setPropValue(rig, 'transform', 'position', [480, 270]);
    a.setPropValue(rig, 'transform', 'anchor', [0, 0]);
    const cam = comp().layers.find((l) => l.type === 'camera');
    a.setParent(cam.id, rig);
    a.setPropValue(cam.id, 'transform', 'position', [0, 0]);
  });
  const before = await A(async (ks) => { const g = await import('/src/render/geometry.ts'); const s = ks.appStore.get(); const comp = s.project.comps[s.activeCompId]; return g.layerPolygon(s.project, comp, comp.layers.find((x) => x.name === 'red'), 0); });
  await setProp('rig', 'transform', 'rotationY', 35);
  const after = await A(async (ks) => { const g = await import('/src/render/geometry.ts'); const s = ks.appStore.get(); const comp = s.project.comps[s.activeCompId]; return g.layerPolygon(s.project, comp, comp.layers.find((x) => x.name === 'red'), 0); });
  const widthOf = (q) => Math.max(...q.map((v) => v[0])) - Math.min(...q.map((v) => v[0]));
  check('rotating the rig the camera hangs from orbits it round the scene: the card is seen at an angle', widthOf(after) < widthOf(before) - 40, `${widthOf(before).toFixed(0)} -> ${widthOf(after).toFixed(0)}`);

  // ---- 3D layers work in precomps, and a precomp can be 3D
  await setProp('rig', 'transform', 'rotationY', 0);
  await A((ks) => { const s = ks.appStore.get(); const cam = ks.appStore.get().project.comps[s.activeCompId].layers.find((l) => l.type === 'camera'); ks.actions.deleteLayers([cam.id]); });
  // sanity: back to flat view, red is a plain 400x240 card
  p = await px([[281, 270], [278, 270]]);
  check('deleting the camera returns to the flat view', isRed(p[0]) && isBg(p[1]), JSON.stringify(p));

  // ---- save and reopen, including a file from before 3D existed
  await A((ks) => { ks.actions.addCamera(); ks.actions.addLight('point'); });
  const text = await A(async (ks) => (await import('/src/core/serialize.ts')).serializeProject(ks.appStore.get().project, ks.assets.allAssetData()));
  await A((ks) => ks.actions.newProject());
  const ok = await page.evaluate(async (t) => window.__ks.actions.openProjectText(t, 'three-d.kfs'), text);
  await page.waitForTimeout(300);
  const types = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.map((l) => `${l.type}${l.threeD ? '+3d' : ''}`); });
  check('a project with a camera, a light and 3D layers round-trips', ok && types.includes('camera+3d') && types.includes('light+3d') && types.includes('solid+3d'), types.join(','));
  const old = JSON.parse(text);
  for (const comp of Object.values(old.project.comps)) for (const l of comp.layers) { delete l.threeD; for (const k of ['positionZ', 'rotationX', 'rotationY']) delete l.transform[k]; }
  const oldOk = await page.evaluate(async (t) => window.__ks.actions.openProjectText(t, 'old.kfs'), JSON.stringify(old));
  const filled = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.every((l) => ['positionZ', 'rotationX', 'rotationY'].every((k) => l.transform[k]?.kind === 'number')); });
  check('a file saved before 3D existed opens, with the new properties filled in', oldOk && filled);

  // ---- hostile 3D data
  const bad = await A(async (ks) => {
    const ser = await import('/src/core/serialize.ts');
    const good = JSON.parse(ser.serializeProject(ks.appStore.get().project, ks.assets.allAssetData()));
    const out = [];
    const tryIt = (m) => { const c = structuredClone(good); m(c); try { ser.parseProject(JSON.stringify(c)); out.push('accepted'); } catch { out.push('rejected'); } };
    const first = (c) => Object.values(c.project.comps)[0].layers[0];
    tryIt((c) => { first(c).threeD = 'yes'; });
    tryIt((c) => { first(c).transform.positionZ = { kind: 'color', label: 'x', value: [1, 2, 3], keys: [] }; });
    tryIt((c) => { first(c).transform.rotationY = 5; });
    tryIt((c) => { const l = Object.values(c.project.comps)[0].layers.find((x) => x.type === 'camera'); l.data = { type: 'light' }; });
    return out;
  });
  check('bad 3D data is rejected', bad.every((r) => r === 'rejected'), bad.join(','));

  // ---- dragging a 3D layer in the viewer moves it in its own depth plane
  await A((ks) => {
    const a = ks.actions;
    const s0 = ks.appStore.get();
    const comp = () => ks.appStore.get().project.comps[s0.activeCompId];
    a.deleteLayers(comp().layers.map((l) => l.id));
    a.addSolid({ name: 'bg', color: [20, 20, 40], width: 960, height: 540 });
    const id = a.addSolid({ name: 'card', color: [230, 60, 60], width: 400, height: 240 });
    a.setPropValue(id, 'transform', 'position', [480, 270]);
    a.setLayerField(id, { threeD: true });
    a.addCamera();
    const card = comp().layers.find((l) => l.name === 'card');
    a.setPropValue(card.id, 'transform', 'rotationY', 0);
    a.setPropValue(card.id, 'transform', 'positionZ', (960 * 50) / 36); // twice as far as the default camera
    a.selectLayers([]);
  });
  const dragBox = await page.locator('[data-testid=comp-canvas]').boundingBox();
  const at = (x, y) => ({ x: dragBox.x + (x / 960) * dragBox.width, y: dragBox.y + (y / 540) * dragBox.height });
  const from = at(480, 270);
  const to = at(480 + 60, 270 + 30);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const moved = await layerOf('card');
  check('dragging a layer twice as far as the camera sees moves it twice as far in the scene', near(moved.transform.position.value[0], 480 + 120, 2.5) && near(moved.transform.position.value[1], 270 + 60, 2.5), JSON.stringify(moved.transform.position.value));
  check('without changing its depth', near(moved.transform.positionZ.value, (960 * 50) / 36, 1e-6));

  // ---- precomps and motion blur
  await A((ks) => {
    const a = ks.actions;
    const s0 = ks.appStore.get();
    const comp = () => ks.appStore.get().project.comps[s0.activeCompId];
    const cam = comp().layers.find((l) => l.type === 'camera');
    a.deleteLayers([cam.id]);
    const card = comp().layers.find((l) => l.name === 'card');
    a.setPropValue(card.id, 'transform', 'position', [480, 270]);
    a.setPropValue(card.id, 'transform', 'positionZ', 0);
    a.selectLayers([card.id]);
    a.precompose([card.id], 'Pre');
  });
  await page.waitForTimeout(200);
  p = await px([[285, 270], [278, 270]]);
  check('a 3D layer inside a precomposition renders as before', isRed(p[0]) && isBg(p[1]), JSON.stringify(p));
  await A((ks) => { const s = ks.appStore.get(); const pre = s.project.comps[s.activeCompId].layers.find((l) => l.type === 'precomp'); ks.actions.setLayerField(pre.id, { threeD: true }); ks.actions.setPropValue(pre.id, 'transform', 'rotationY', 60); });
  p = await px([[480, 270], [480 - 190, 270], [480 + 190, 270], [480 + 80, 100]]);
  check('and the precomposition itself can be turned in 3D', isRed(p[0]) || p[0][0] > 100, JSON.stringify(p));
  check('(the turned precomposition is narrower than flat)', !(isRed(p[1]) && isRed(p[2])), JSON.stringify(p));
  await A((ks) => {
    const a = ks.actions;
    const s0 = ks.appStore.get();
    const comp = ks.appStore.get().project.comps[s0.activeCompId];
    const pre = comp.layers.find((l) => l.type === 'precomp');
    a.updateComp(s0.activeCompId, { motionBlur: true });
    a.setLayerField(pre.id, { motionBlur: true });
    a.setPropValue(pre.id, 'transform', 'rotationY', 0);
  });
  const blurred = await A(async (ks) => {
    const r = await import('/src/render/renderer.ts');
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const pre = comp.layers.find((l) => l.type === 'precomp');
    // spin it about Y over one second, then render mid-frame with motion blur on
    ks.actions.setTime(1);
    ks.actions.toggleStopwatch(pre.id, 'transform', 'rotationY');
    ks.actions.setTime(2);
    ks.actions.setPropValue(pre.id, 'transform', 'rotationY', 3600);
    const c = document.createElement('canvas');
    r.renderComp(c, ks.appStore.get().project, ks.appStore.get().project.comps[s.activeCompId], 1.5, { scale: 1, mbSamples: 8 });
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let mid = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 60 && d[i] < 200) mid++;
    return mid;
  });
  check('motion blur smears a spinning 3D layer (many in-between pixels)', blurred > 2000, blurred);

  // ---- the CPU fallback still draws the layer
  await A((ks) => {
    const a = ks.actions;
    a.setTime(0);
    const s0 = ks.appStore.get();
    a.updateComp(s0.activeCompId, { width: 960, height: 540 });
    a.deleteLayers(ks.appStore.get().project.comps[s0.activeCompId].layers.map((l) => l.id));
    const id = a.addSolid({ name: 'card', color: [230, 60, 60], width: 400, height: 240 });
    a.setPropValue(id, 'transform', 'position', [480, 270]);
    a.setLayerField(id, { threeD: true });
    a.setPropValue(id, 'transform', 'rotationY', 25);
    a.addCamera();
  });
  const gpu = await px([[480, 270], [300, 270]]);
  await A((ks) => ks.plane3d.forceCpuPlanes(true));
  const cpu = await px([[480, 270], [300, 270]]);
  await A((ks) => ks.plane3d.forceCpuPlanes(false));
  check('without WebGL the plane is still drawn (affine approximation)', isRed(cpu[0]) && isRed(cpu[1]) === isRed(gpu[1]), JSON.stringify({ gpu, cpu }));
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 5).join(' | '));
}
await finish();
