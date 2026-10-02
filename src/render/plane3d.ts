// Draws a layer's plane, already rendered flat (effects and masks included), onto the screen with
// its 3D projection. A shared WebGL canvas does the perspective-correct texture mapping and the
// per-pixel lighting; without WebGL the plane is drawn with the affine map through three of its
// corners (right for flat-on layers, approximate for steep ones) and lit uniformly.
import { applyH, shade, planeNormal, type Light, type Mat3 } from '../core/scene3d';
import type { Mat4 } from '../core/math3';
import { point4 } from '../core/math3';

const MAX_LIGHTS = 8;
const NEAR = 1e-3;

export interface PlaneDraw {
  /** Output size in pixels. */
  width: number;
  height: number;
  /** The flat layer picture: premultiplied pixels, `ps` per layer unit, covering `rect`. */
  texture: HTMLCanvasElement;
  rect: { x: number; y: number; w: number; h: number };
  /** Layer coordinates → homogeneous output pixels (the output scale is already folded in). */
  H: Mat3;
  /** The layer's placement in world space, for lighting. */
  model: Mat4;
  lights: Light[] | null;
  /** Texture pixels per layer unit. */
  ps: number;
}

const VERT = `
attribute vec2 a_local;
attribute vec2 a_uv;
uniform mat3 u_H;
uniform mat4 u_model;
uniform vec2 u_size;
uniform float u_near;
varying vec2 v_uv;
varying vec3 v_world;
void main() {
  vec3 h = u_H * vec3(a_local, 1.0);
  v_uv = a_uv;
  v_world = (u_model * vec4(a_local, 0.0, 1.0)).xyz;
  gl_Position = vec4(2.0 * h.x / u_size.x - h.z, h.z - 2.0 * h.y / u_size.y, h.z - 2.0 * u_near, h.z);
}`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform bool u_lit;
uniform int u_count;
uniform vec3 u_normal;
uniform float u_kind[${MAX_LIGHTS}];
uniform vec3 u_color[${MAX_LIGHTS}];
uniform vec3 u_pos[${MAX_LIGHTS}];
uniform vec3 u_dir[${MAX_LIGHTS}];
uniform vec2 u_cone[${MAX_LIGHTS}];
varying vec2 v_uv;
varying vec3 v_world;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (u_lit) {
    vec3 lit = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= u_count) break;
      float k = 1.0;
      float kind = u_kind[i];
      if (kind < 2.5) {
        vec3 toLight = kind < 0.5 ? -u_dir[i] : normalize(u_pos[i] - v_world);
        k = abs(dot(u_normal, toLight));
        if (kind > 0.5 && kind < 1.5) {
          float cosA = dot(-toLight, u_dir[i]);
          float outer = u_cone[i].x;
          float inner = u_cone[i].y;
          k *= (inner - outer) < 1e-6 ? step(outer, cosA) : smoothstep(outer, inner, cosA);
        }
      }
      lit += u_color[i] * k;
    }
    c.rgb *= min(lit, vec3(1.0));
  }
  gl_FragColor = c;
}`;

interface Gl {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  buf: WebGLBuffer;
  tex: WebGLTexture;
  loc: Record<string, WebGLUniformLocation | null>;
  attrs: { local: number; uv: number };
  webgl2: boolean;
}

let state: Gl | null | undefined;
let canvas: HTMLCanvasElement | null = null;

function init(): Gl | null {
  if (state !== undefined) return state;
  state = null;
  try {
    canvas = document.createElement('canvas');
    const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true, depth: false, stencil: false };
    const gl2 = canvas.getContext('webgl2', opts) as WebGL2RenderingContext | null;
    const gl = (gl2 ?? canvas.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) return null;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    const names = ['u_H', 'u_model', 'u_size', 'u_near', 'u_tex', 'u_lit', 'u_count', 'u_normal', 'u_kind', 'u_color', 'u_pos', 'u_dir', 'u_cone'];
    const loc: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) loc[n] = gl.getUniformLocation(program, n);
    state = { gl, program, buf: gl.createBuffer()!, tex: gl.createTexture()!, loc, attrs: { local: gl.getAttribLocation(program, 'a_local'), uv: gl.getAttribLocation(program, 'a_uv') }, webgl2: !!gl2 };
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      state = undefined; // the next draw rebuilds it
    });
  } catch (e) {
    console.warn('3D layers will be drawn without perspective-correct mapping:', e);
    state = null;
  }
  return state;
}

let forceCpu = false;
/** Draw planes without WebGL even where it exists (to exercise the fallback in tests). */
export const forceCpuPlanes = (on: boolean): void => {
  forceCpu = on;
};

/** Is the GPU path available? (For tests and diagnostics.) */
export const hasGpuPlanes = (): boolean => init() !== null;

/** Draw the plane with its projection. Returns the shared GL canvas holding the picture, or null if WebGL is not available. */
export function drawPlane(d: PlaneDraw): HTMLCanvasElement | null {
  if (forceCpu) return null;
  const g = init();
  if (!g || !canvas) return null;
  const { gl, program, loc } = g;
  if (canvas.width !== d.width) canvas.width = d.width;
  if (canvas.height !== d.height) canvas.height = d.height;
  gl.viewport(0, 0, d.width, d.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(program);

  // the quad: layer-space corners with matching texture coordinates
  const { x, y, w, h } = d.rect;
  const sx = (w * d.ps) / d.texture.width;
  const sy = (h * d.ps) / d.texture.height;
  const quad = new Float32Array([x, y, 0, 0, x + w, y, sx, 0, x, y + h, 0, sy, x + w, y + h, sx, sy]);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(g.attrs.local);
  gl.vertexAttribPointer(g.attrs.local, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(g.attrs.uv);
  gl.vertexAttribPointer(g.attrs.uv, 2, gl.FLOAT, false, 16, 8);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.texture);
  // shrunk planes look better with mipmaps (WebGL 2 allows them for any size)
  const corners = [applyH(d.H, x, y), applyH(d.H, x + w, y), applyH(d.H, x, y + h)].map((c) => [c[0] / c[2], c[1] / c[2]]);
  const screenArea = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) * Math.hypot(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1]);
  const minified = g.webgl2 && Number.isFinite(screenArea) && screenArea < d.texture.width * d.texture.height * 0.6;
  if (minified) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minified ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(loc.u_tex, 0);

  // uniforms (GL matrices are column-major; ours are row-major, so ask GL to transpose by hand)
  const H = d.H;
  gl.uniformMatrix3fv(loc.u_H, false, new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]));
  const m = d.model;
  gl.uniformMatrix4fv(loc.u_model, false, new Float32Array([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]));
  gl.uniform2f(loc.u_size, d.width, d.height);
  gl.uniform1f(loc.u_near, NEAR);
  const lights = d.lights ? d.lights.slice(0, MAX_LIGHTS) : null;
  gl.uniform1i(loc.u_lit, lights ? 1 : 0);
  if (lights) {
    const n = planeNormal(d.model);
    gl.uniform1i(loc.u_count, lights.length);
    gl.uniform3f(loc.u_normal, n[0], n[1], n[2]);
    const kind = new Float32Array(MAX_LIGHTS);
    const color = new Float32Array(MAX_LIGHTS * 3);
    const pos = new Float32Array(MAX_LIGHTS * 3);
    const dir = new Float32Array(MAX_LIGHTS * 3);
    const cone = new Float32Array(MAX_LIGHTS * 2);
    lights.forEach((L, i) => {
      kind[i] = L.kind === 'parallel' ? 0 : L.kind === 'spot' ? 1 : L.kind === 'point' ? 2 : 3;
      color.set(L.color, i * 3);
      pos.set(L.pos, i * 3);
      dir.set(L.dir, i * 3);
      cone.set([L.cosOuter, L.cosInner], i * 2);
    });
    gl.uniform1fv(loc.u_kind, kind);
    gl.uniform3fv(loc.u_color, color);
    gl.uniform3fv(loc.u_pos, pos);
    gl.uniform3fv(loc.u_dir, dir);
    gl.uniform2fv(loc.u_cone, cone);
  }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

/**
 * Without WebGL: draw the plane through the affine map of three of its corners, uniformly lit by
 * the shade at its centre. Exact for planes facing the screen, an approximation otherwise.
 */
export function drawPlaneAffine(ctx: CanvasRenderingContext2D, d: PlaneDraw): void {
  const { x, y, w, h } = d.rect;
  const p = (u: number, v: number): [number, number] | null => {
    const [px, py, pw] = applyH(d.H, u, v);
    return pw > NEAR ? [px / pw, py / pw] : null;
  };
  const tl = p(x, y);
  const tr = p(x + w, y);
  const bl = p(x, y + h);
  if (!tl || !tr || !bl) return;
  const k = d.ps;
  ctx.save();
  ctx.setTransform((tr[0] - tl[0]) / (w * k), (tr[1] - tl[1]) / (w * k), (bl[0] - tl[0]) / (h * k), (bl[1] - tl[1]) / (h * k), tl[0], tl[1]);
  if (d.lights) {
    const c = shade(d.lights, point4(d.model, [x + w / 2, y + h / 2, 0]), planeNormal(d.model));
    ctx.filter = `brightness(${((c[0] + c[1] + c[2]) / 3).toFixed(3)})`;
  }
  ctx.drawImage(d.texture, 0, 0);
  ctx.restore();
}
