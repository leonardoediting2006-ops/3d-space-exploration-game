# Keyframe Studio

A browser-based motion graphics and compositing editor, built from scratch with TypeScript, React and the Canvas 2D API.
It follows the workflow of professional compositing tools — compositions, a layer timeline, keyframes, effects, precomps — without being a clone of any of them.

> **Not affiliated with, derived from, or a replacement for any commercial product.** It is an original codebase with its own name, UI and file format.
> It covers the core 2D workflow well; it is deliberately *not* feature-complete. See [Limitations](#limitations).

![Keyframe Studio: viewer with transform gizmo, effects panel, and the layer timeline with keyframes](docs/screenshot.png)

```bash
npm install
npm run dev        # http://localhost:5173
```

Open it and you land in a small demo composition. **Space** plays and **File → Export…** renders it to video. *Help → Keyboard Shortcuts* lists everything.

## What it does

**Compositions & timeline**
- Multiple compositions (open as tabs), nestable as **precomps**; per-comp size, frame rate, duration, background, work area.
- AE-style timeline: layer switches (visibility, solo, lock, motion blur), blend mode / track matte / parent columns, twirl-down properties, `P S R T A U` property reveal, draggable layer bars (slide + trim), time ruler with work area, playhead, zoom.
- Snapping of layer edges and keyframes to the playhead and other layers (hold **Alt** to bypass), layer re-ordering by dragging the layer number, split / duplicate / copy / paste / sequence layers.

**Animation**
- Stopwatch keyframing on every property: transform, shape/text/solid contents, effect parameters, mask paths.
- Per-segment **bezier easing** with an interactive curve editor (overshoot supported), linear, hold, Easy Ease / In / Out, time-reverse.
- **Curved motion paths** for Position with constant-speed (arc-length) timing, drag points and handles in the viewer, one-click auto-bezier smoothing.
- **Wiggle** and **loop** (cycle / ping-pong) as built-in, deterministic property modifiers — no scripting involved.
- Animation presets (fade, slide, pop, spin, pulse, wiggle).

**Layers**
- Solids, shape layers (rectangle, ellipse, polygon, star, **freeform bezier paths** with trim paths), text, images, nulls, adjustment layers, precomps.
- **Pen tool** with drag-out curve handles; vertex/tangent editing, add/remove vertices, smooth/corner toggle.
- **Masks** (add / subtract / intersect / none, invert, feather, opacity, expansion) with animatable paths.
- Parenting (cycle-safe), 17 blend modes, alpha / luma track mattes (and inverted), anchor-point (pan-behind) tool.

**Rendering**
- Per-layer transform, opacity, blend, effects stack, masks, mattes, adjustment layers, precomps — all composited in a single pass.
- Real **motion blur** (sub-frame accumulation in float space, shutter angle) and 21 effects: Gaussian / Directional blur, Mosaic, Brightness & Contrast, Levels, Hue/Saturation, Black & White, Invert, Tint, Threshold, Posterize, Drop Shadow, Glow, Vignette, Fill, Gradient Ramp, Checkerboard, Noise, Fractal Noise, Linear / Radial Wipe.
- Each layer is processed only inside its own transformed bounds (plus effect padding), so small layers stay cheap and off-screen layers cost nothing.

**Output**
- **WebM (VP9)** and **MP4 (H.264)** via WebCodecs — rendered one frame at a time, so output is frame-accurate (30 frames in = 30 frames out), never real-time capture. The WebM path is covered by the e2e suite (checked with `ffprobe`); the MP4 path is implemented but **not verified here**, because the headless Chromium used for testing has no H.264 encoder.
- PNG sequence (`.zip`, no external libraries) and single PNG frames (optionally with alpha).

**Projects**
- Save / open as a plain-JSON `.kfs` file; autosave to browser storage; undo/redo (drags collapse to one step).
- Project files are treated as untrusted input: strictly validated, size-limited, and never evaluated.

## Keyboard shortcuts (essentials)

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `Space` | Play / pause | `J` / `K` | Previous / next keyframe |
| `P S R T A` | Reveal Position / Scale / Rotation / Opacity / Anchor | `U` | Reveal animated properties |
| `[` `]` | Slide layer in/out to playhead (`Alt` = trim) | `B` / `N` | Work area start / end |
| `V H Z Q G Y` | Select, Hand, Zoom, Shape, Pen, Anchor tools | `F9` | Easy ease (`Shift`: in, `Ctrl+Shift`: out) |
| `Ctrl+C/X/V` | Copy / cut / paste layers or keyframes | `Ctrl+D` | Duplicate |
| `Ctrl+Shift+D` | Split layer at playhead | `Ctrl+Shift+C` | Pre-compose |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo | `Ctrl+S` / `Ctrl+O` / `Ctrl+M` | Save / open / export |

## Architecture

```
src/
  core/      Pure data & maths — no DOM. The document model (types.ts), keyframe interpolation incl. bezier
             easing, wiggle, loops and arc-length motion paths (interp.ts), bezier path geometry (path.ts),
             effect definitions, factories, project (de)serialisation and validation.
  render/    Canvas 2D renderer: layer painters, effects, masks, mattes, motion blur, a canvas pool,
             hit-testing/geometry, and export (WebCodecs muxing, zip writer).
  state/     A small external store, an undo/redo history with gestures, and every user action.
  ui/        React panels: viewer (gizmos, pen, motion paths), timeline, project, effects, dialogs, shortcuts.
e2e/         Browser end-to-end suites (Playwright + headless Chromium) that assert on rendered pixels.
```

Design notes:

- **Everything animatable is a `Prop`** (`number | vec2 | color | path`) with optional keyframes, wiggle and loop. Transform values, shape contents, effect parameters and mask paths all share one evaluator, one timeline row type and one set of keyframe commands.
- **The document is plain JSON** and is cloned for each edit, which gives undo/redo, autosave and file saving with no extra machinery. Footage bytes live outside the document so clones stay cheap.
- **Bezier paths are flat number arrays** (six numbers per vertex), so they interpolate between keyframes element-wise like any other property.
- **Rendering is a pure function** of `(project, comp, time, options)`: the viewer, exporter and tests all call the same `renderComp`.

## Development

```bash
npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm test            # unit tests (vitest): interpolation, paths, history, clipboard, serialisation, zip…
npm run e2e         # browser suites; needs a Chromium (set CHROMIUM_PATH, or `npx playwright install chromium`)
npm run build       # typecheck + production build
```

The e2e suites drive the real UI and verify results by sampling rendered pixels (blend modes, mattes, masks, every effect, motion blur, precomps), checking exported files with `ffprobe`, and failing on any console error.

## Browser support

Chromium-based browsers and Firefox are recommended. Blur/colour effects use the Canvas `filter` property, which Safari does not support (those effects are skipped there). Video export needs WebCodecs (Chromium); MP4/H.264 additionally needs a build with H.264 encoding. PNG-sequence export works everywhere.

## Limitations

Things a full compositing suite has that this does **not**:

- No 3D layers, cameras or lights (strictly 2D).
- No audio, and no video-file footage (images only).
- No expression language — only the built-in wiggle and loop modifiers.
- No text animators, per-character styling, or text on a path.
- Shape layers hold one shape each: no shape groups, repeaters, merge/boolean paths or gradient fills.
- No graph editor with value/speed graphs (there is a per-segment bezier easing editor), no time remapping or stretch.
- No motion tracking, stabilisation, roto brush, or colour management.
- No plugin/effect SDK, and no import of other applications' project files.
- Preview is software-composited Canvas 2D, not a GPU pipeline — very large compositions or heavy effect stacks will play below real time (use the preview resolution menu).

## Provenance

All code in this repository is original. No third-party application code, assets, names or trademarks are used; the only runtime dependencies are React and two small muxing libraries (`webm-muxer`, `mp4-muxer`). No license has been chosen yet.
