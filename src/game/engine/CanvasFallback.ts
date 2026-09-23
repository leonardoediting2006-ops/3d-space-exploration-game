import { createRandom } from '../core/random';
import type { Planet, PointOfInterest } from '../core/types';
import { getPlanet } from '../data/galaxy';
import { RESOURCES } from '../data/resources';
import { useGameStore } from '../state/store';

interface StarDot { x: number; y: number; size: number; alpha: number; drift: number; }

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export class CanvasFallbackRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly keys: Record<string, boolean> = {};
  private readonly stars: StarDot[] = [];
  private readonly player = { x: 0, z: 12, yaw: 0 };
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private frame = 0;
  private lastFrame = performance.now();
  private lastTelemetry = 0;
  private lastNearby = '';
  private lastPulse = 0;
  private selectedPlanetId = '';
  private pulseTime = 0;
  private speed = 0;
  private routeDistance = 286;
  private pointerDown = false;
  private pointerX = 0;
  private location = '';
  private disposed = false;
  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    this.keys[event.code] = true;
  };
  private readonly onKeyUp = (event: KeyboardEvent) => { this.keys[event.code] = false; };
  private readonly onBlur = () => { Object.keys(this.keys).forEach((key) => { this.keys[key] = false; }); };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointerDown = true;
    this.pointerX = event.clientX;
    this.canvas.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointerDown) return;
    const deltaX = event.clientX - this.pointerX;
    this.pointerX = event.clientX;
    const mode = useGameStore.getState().game.location;
    if (mode === 'surface') this.player.yaw -= deltaX * 0.004;
    else if (mode === 'space') this.player.yaw -= deltaX * 0.002;
  };
  private readonly onPointerUp = () => { this.pointerDown = false; };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D rendering is unavailable');
    this.context = context;
    const game = useGameStore.getState().game;
    this.location = game.location;
    this.selectedPlanetId = game.selectedPlanetId;
    this.resize();
    this.makeStars(useGameStore.getState().game.galaxySeed);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.animate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    this.canvas.width = Math.floor(this.width * this.pixelRatio);
    this.canvas.height = Math.floor(this.height * this.pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  private makeStars(seed: number): void {
    const random = createRandom(seed + 307);
    this.stars.length = 0;
    for (let index = 0; index < 390; index += 1) {
      this.stars.push({ x: random(), y: random(), size: random() < 0.09 ? 1.5 : 0.6 + random() * 0.65, alpha: 0.2 + random() * 0.7, drift: 0.2 + random() * 1.6 });
    }
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrame) / 1000, 0.04);
    this.lastFrame = now;
    const state = useGameStore.getState();
    if (state.game.selectedPlanetId !== this.selectedPlanetId) {
      this.selectedPlanetId = state.game.selectedPlanetId;
      this.routeDistance = 286;
      this.speed = 0;
    }
    if (state.game.location !== this.location) {
      const previous = this.location;
      if (state.game.location === 'surface') {
        this.player.x = 0;
        this.player.z = 12;
        this.player.yaw = 0;
      } else if (state.game.location === 'space' && (previous === 'station' || previous === 'orbit')) {
        this.routeDistance = 286;
        this.speed = 0;
      }
      this.location = state.game.location;
      this.lastNearby = '';
    }
    this.update(delta, now, state);
    this.draw(state, now);
  };

  private update(delta: number, now: number, state: ReturnType<typeof useGameStore.getState>): void {
    if (state.scanPulse !== this.lastPulse) {
      this.lastPulse = state.scanPulse;
      this.pulseTime = 0;
    }
    this.pulseTime += delta;
    if (state.game.location === 'space') {
      if (state.autopilot) {
        this.speed = Math.min(42, this.speed + 21 * delta);
        this.routeDistance = Math.max(0, this.routeDistance - 56 * delta);
        if (this.routeDistance <= 1) {
          this.routeDistance = 0;
          useGameStore.getState().setAutopilot(false);
          useGameStore.getState().setLocation('orbit');
          useGameStore.setState({ toast: `Orbit established · ${getPlanet(state.galaxy, state.game.selectedPlanetId)?.planet.name ?? 'target'}`, toastTone: 'success' });
        }
      } else {
        if (this.keys.KeyW) this.speed = Math.min(this.keys.ShiftLeft || this.keys.ShiftRight ? 82 : 54, this.speed + 17 * delta);
        else if (this.keys.KeyS) this.speed = Math.max(0, this.speed - 30 * delta);
        else this.speed = Math.max(0, this.speed - 0.9 * delta);
        if (this.speed > 0 && this.keys.KeyW) this.routeDistance = Math.max(0, this.routeDistance - this.speed * delta * 0.42);
        if (this.routeDistance <= 0) {
          useGameStore.getState().setLocation('orbit');
          useGameStore.setState({ toast: 'Orbit established · target acquired.', toastTone: 'success' });
        }
      }
    } else if (state.game.location === 'surface') {
      const forward = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      const strafe = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
      const pace = this.keys.ShiftLeft || this.keys.ShiftRight ? 12 : 7.2;
      this.player.x += (Math.sin(this.player.yaw) * forward + Math.cos(this.player.yaw) * strafe) * pace * delta;
      this.player.z += (-Math.cos(this.player.yaw) * forward + Math.sin(this.player.yaw) * strafe) * pace * delta;
      this.player.x = Math.max(-77, Math.min(77, this.player.x));
      this.player.z = Math.max(-74, Math.min(73, this.player.z));
      const found = getPlanet(state.galaxy, state.game.selectedPlanetId);
      if (found) {
        const nearby = this.findNearby(state, found.planet);
        const key = nearby ? `${nearby.id}:${nearby.scanned}` : '';
        if (key !== this.lastNearby) {
          this.lastNearby = key;
          useGameStore.getState().setNearby(nearby);
        }
      }
    }
    if (now - this.lastTelemetry > 160) {
      this.lastTelemetry = now;
      useGameStore.getState().setFlightTelemetry(state.game.location === 'orbit' ? 0 : this.speed, state.game.location === 'orbit' ? 0 : this.routeDistance);
    }
  }

  private findNearby(state: ReturnType<typeof useGameStore.getState>, planet: Planet) {
    const nearest = planet.pointsOfInterest.map((point) => ({
      point,
      distance: Math.hypot(point.x - this.player.x, point.z - this.player.z),
    })).sort((a, b) => a.distance - b.distance)[0];
    const shipDistance = Math.hypot(this.player.x, this.player.z - 19);
    if (shipDistance < 8.5 && (!nearest || nearest.distance > shipDistance)) return { id: 'ship-recall', name: 'The Lark', type: 'ship' as const, distance: shipDistance, scanned: true };
    if (!nearest || nearest.distance > 8.5) return null;
    return { id: nearest.point.id, name: nearest.point.name, type: nearest.point.type, distance: nearest.distance, scanned: state.game.scannedObjects.includes(nearest.point.id) };
  }

  private draw(state: ReturnType<typeof useGameStore.getState>, now: number): void {
    const context = this.context;
    const { width, height } = this;
    context.clearRect(0, 0, width, height);
    if (state.game.location === 'surface') this.drawSurface(state, now);
    else this.drawSpace(state, now);
  }

  private drawStars(now: number, drift = 0): void {
    const context = this.context;
    const offset = ((now * drift * 0.000012) % 0.9);
    for (const star of this.stars) {
      const x = ((star.x + offset * star.drift) % 1) * this.width;
      const y = star.y * this.height;
      context.fillStyle = `rgba(206, 219, 213, ${star.alpha})`;
      context.fillRect(x, y, star.size, star.size);
    }
  }

  private drawSpace(state: ReturnType<typeof useGameStore.getState>, now: number): void {
    const context = this.context;
    const { width, height } = this;
    const sky = context.createLinearGradient(0, 0, width * 0.4, height);
    sky.addColorStop(0, '#05080c'); sky.addColorStop(.55, '#0b1116'); sky.addColorStop(1, '#12191b');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    const nebula = context.createRadialGradient(width * .61, height * .43, 0, width * .61, height * .43, width * .47);
    nebula.addColorStop(0, 'rgba(102,130,125,.13)'); nebula.addColorStop(.58, 'rgba(69,96,99,.06)'); nebula.addColorStop(1, 'rgba(29,43,52,0)');
    context.fillStyle = nebula; context.fillRect(0, 0, width, height);
    this.drawStars(now, this.speed);

    const target = getPlanet(state.galaxy, state.game.selectedPlanetId);
    if (!target) return;
    const { system, planet } = target;
    const starX = width * .82; const starY = height * .24;
    const starGlow = context.createRadialGradient(starX, starY, 2, starX, starY, 114);
    starGlow.addColorStop(0, `${system.starColor}3a`); starGlow.addColorStop(1, `${system.starColor}00`);
    context.fillStyle = starGlow; context.fillRect(starX - 120, starY - 120, 240, 240);
    context.fillStyle = system.starColor; context.globalAlpha = .82; context.beginPath(); context.arc(starX, starY, 9, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
    this.drawAsteroidBelt(width, height, now);

    if (state.game.location === 'station') {
      this.drawPlanet(planet, width * .65, height * .38, Math.min(width, height) * .105, now);
      this.drawStation(width * .53, height * .36, 1);
      this.drawShip(width * .49, height * .76, .8, 0);
      this.drawSceneLabel('MORROW RELAY', width * .53, height * .24, '#b2cbbf');
      this.drawSceneLabel('VEYRA · UNCHARTED', width * .65, height * .57, '#d7b18c');
    } else if (state.game.location === 'orbit') {
      this.drawPlanet(planet, width * .54, height * .42, Math.min(width * .235, height * .37), now);
      this.drawShip(width * .51, height * .7, .66, Math.PI);
      this.drawSceneLabel(`${planet.name.toUpperCase()} · STABLE ORBIT`, width * .54, height * .84, '#a9c9bc');
      for (const [index, poi] of planet.pointsOfInterest.entries()) this.drawOrbitSignal(poi, index, width, height, state.game.scannedPlanets.includes(planet.id));
    } else {
      const progress = Math.max(0, Math.min(1, 1 - state.distanceToOrbit / 286));
      const targetX = width * (.62 - progress * .055);
      const targetY = height * (.39 + progress * .015);
      const radius = Math.min(width * .15, height * .24) * (.56 + progress * 1.04);
      this.drawPlanet(planet, targetX, targetY, radius, now);
      this.drawShip(width * .5, height * .76, .85, this.player.yaw);
      this.drawSceneLabel(`${planet.name.toUpperCase()} · ${Math.round(state.distanceToOrbit)} KM`, targetX, targetY + radius + 22, '#b2c7bc');
      context.save(); context.setLineDash([3, 7]); context.strokeStyle = 'rgba(165,199,182,.22)'; context.lineWidth = 1;
      context.beginPath(); context.moveTo(width * .5, height * .49); context.lineTo(targetX, targetY + radius * .68); context.stroke(); context.restore();
    }

    if (this.pulseTime < 1.1 && state.scanPulse > 0) {
      const originX = state.game.location === 'orbit' ? width * .52 : width * .5;
      const originY = state.game.location === 'orbit' ? height * .62 : height * .6;
      context.save(); context.globalAlpha = (1 - this.pulseTime / 1.1) * .52; context.strokeStyle = '#a8d4c6'; context.lineWidth = 1;
      context.beginPath(); context.ellipse(originX, originY, 25 + this.pulseTime * 290, 13 + this.pulseTime * 160, 0, 0, Math.PI * 2); context.stroke(); context.restore();
    }
  }

  private drawPlanet(planet: Planet, x: number, y: number, radius: number, now: number): void {
    const context = this.context;
    const glow = context.createRadialGradient(x, y, radius * .72, x, y, radius * 1.32);
    glow.addColorStop(0, `${planet.accent}28`); glow.addColorStop(1, `${planet.accent}00`);
    context.fillStyle = glow; context.beginPath(); context.arc(x, y, radius * 1.32, 0, Math.PI * 2); context.fill();
    context.save();
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.clip();
    const surface = context.createRadialGradient(x - radius * .35, y - radius * .43, radius * .04, x + radius * .19, y + radius * .08, radius * 1.26);
    surface.addColorStop(0, planet.accent); surface.addColorStop(.43, planet.color); surface.addColorStop(1, '#090e14');
    context.fillStyle = surface; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const random = createRandom(planet.seed);
    for (let index = 0; index < 17; index += 1) {
      const landX = x + (random() - .5) * radius * 2.1;
      const landY = y + (random() - .5) * radius * 1.85;
      const size = radius * (.035 + random() * .18);
      context.globalAlpha = .1 + random() * .17;
      context.fillStyle = index % 3 === 0 ? planet.accent : '#172126';
      context.beginPath(); context.ellipse(landX, landY, size * 1.2, size * .63, random() * Math.PI, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    const shade = context.createLinearGradient(x - radius, y, x + radius, y);
    shade.addColorStop(0, 'rgba(0,0,0,.34)'); shade.addColorStop(.44, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(1,5,9,.72)');
    context.fillStyle = shade; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.globalAlpha = .12;
    for (let line = 0; line < 9; line += 1) {
      const offset = Math.sin(now * .00008 + line) * radius * .11;
      context.strokeStyle = line % 2 ? planet.accent : '#f0e8d3'; context.lineWidth = Math.max(1, radius * .008);
      context.beginPath(); context.ellipse(x - radius * .16, y - radius * .18 + offset, radius * .82, radius * (.1 + line * .014), -.19, Math.PI * .17, Math.PI * .84); context.stroke();
    }
    context.globalAlpha = 1;
    context.restore();
    context.strokeStyle = `${planet.accent}8c`; context.lineWidth = 1; context.beginPath(); context.arc(x, y, radius, -.9, 1.1); context.stroke();
  }

  private drawShip(x: number, y: number, scale: number, yaw: number): void {
    const context = this.context;
    context.save(); context.translate(x, y); context.rotate(yaw * .18); context.scale(scale, scale);
    const engine = context.createLinearGradient(0, 20, 0, 96);
    engine.addColorStop(0, 'rgba(166,219,223,.48)'); engine.addColorStop(1, 'rgba(118,161,179,0)');
    for (const side of [-1, 1]) { context.fillStyle = engine; context.beginPath(); context.moveTo(side * 19, 18); context.lineTo(side * 11, 82 + Math.sin(performance.now() * .008) * 7); context.lineTo(side * 5, 18); context.closePath(); context.fill(); }
    context.beginPath(); context.moveTo(0, -43); context.lineTo(13, -4); context.lineTo(49, 22); context.lineTo(29, 18); context.lineTo(19, 9); context.lineTo(13, 27); context.lineTo(-13, 27); context.lineTo(-19, 9); context.lineTo(-29, 18); context.lineTo(-49, 22); context.lineTo(-13, -4); context.closePath();
    context.fillStyle = '#667781'; context.strokeStyle = 'rgba(208,221,216,.75)'; context.lineWidth = 1.2; context.fill(); context.stroke();
    context.beginPath(); context.moveTo(0, -34); context.lineTo(7, -7); context.lineTo(0, 1); context.lineTo(-7, -7); context.closePath(); context.fillStyle = '#a2b6b5'; context.fill();
    context.beginPath(); context.ellipse(0, -9, 5, 8, 0, 0, Math.PI * 2); context.fillStyle = '#86aeb8'; context.fill();
    context.strokeStyle = 'rgba(191,204,194,.32)'; context.lineWidth = .7; context.beginPath(); context.moveTo(-23, 17); context.lineTo(0, 6); context.lineTo(23, 17); context.stroke();
    context.restore();
  }

  private drawStation(x: number, y: number, scale: number): void {
    const context = this.context;
    context.save(); context.translate(x, y); context.scale(scale, scale);
    context.strokeStyle = 'rgba(174,197,185,.52)'; context.lineWidth = 2;
    context.beginPath(); context.ellipse(0, 0, 51, 25, -.24, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = 'rgba(120,157,152,.48)'; context.lineWidth = 1;
    context.beginPath(); context.ellipse(0, 0, 36, 17, -.24, 0, Math.PI * 2); context.stroke();
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2;
      context.save(); context.translate(Math.cos(angle) * 43, Math.sin(angle) * 21); context.rotate(angle);
      context.fillStyle = index % 2 ? '#526a6c' : '#899b91'; context.fillRect(-7, -4, 14, 8); context.fillStyle = '#b3c6b4'; context.fillRect(-2, -2, 4, 4); context.restore();
    }
    context.fillStyle = '#68797c'; context.fillRect(-8, -5, 16, 10); context.beginPath(); context.moveTo(-8, 0); context.lineTo(8, 0); context.stroke();
    context.restore();
  }

  private drawAsteroidBelt(width: number, height: number, now: number): void {
    const context = this.context;
    context.save(); context.globalAlpha = .29; context.strokeStyle = 'rgba(143,159,159,.35)'; context.setLineDash([1, 12]); context.lineWidth = 18;
    context.beginPath(); context.ellipse(width * .51, height * .43, width * .41, height * .12, -.17, .02, Math.PI * 1.93); context.stroke(); context.setLineDash([]);
    for (let index = 0; index < 65; index += 1) {
      const angle = index * 2.399 + now * .000018;
      const rx = width * (.28 + (index % 13) * .01);
      const ry = height * (.06 + (index % 8) * .01);
      const px = width * .51 + Math.cos(angle) * rx;
      const py = height * .43 + Math.sin(angle) * ry;
      context.fillStyle = `rgba(154,165,158,${.18 + (index % 4) * .08})`;
      context.beginPath(); context.arc(px, py, .6 + index % 4 * .35, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }

  private drawSceneLabel(text: string, x: number, y: number, color: string): void {
    const context = this.context;
    context.save(); context.font = '8px monospace'; context.textAlign = 'center'; context.letterSpacing = '2px';
    context.fillStyle = 'rgba(4,9,11,.62)'; context.fillRect(x - context.measureText(text).width / 2 - 8, y - 11, context.measureText(text).width + 16, 19);
    context.fillStyle = color; context.fillText(text, x, y + 2); context.restore();
  }

  private drawOrbitSignal(poi: PointOfInterest, index: number, width: number, height: number, scanned: boolean): void {
    const context = this.context;
    const x = width * (.59 + index * .1);
    const y = height * (.43 + (index % 2) * .11);
    context.save(); context.strokeStyle = scanned ? 'rgba(169,210,188,.66)' : 'rgba(170,185,174,.26)'; context.fillStyle = scanned ? '#c2dcbe' : '#a9b5ac';
    context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill(); context.beginPath(); context.arc(x, y, 10, 0, Math.PI * 2); context.stroke();
    context.font = '7px monospace'; context.fillStyle = scanned ? '#a9c9b9' : '#788783'; context.fillText(scanned ? poi.name.toUpperCase() : 'UNKNOWN', x + 13, y + 3); context.restore();
  }

  private drawSurface(state: ReturnType<typeof useGameStore.getState>, now: number): void {
    const context = this.context;
    const { width, height } = this;
    const found = getPlanet(state.galaxy, state.game.selectedPlanetId);
    if (!found) return;
    const planet = found.planet;
    const skyColor = planet.class === 'glacial' ? ['#567080', '#a1aba3'] : planet.class === 'toxic' ? ['#455e58', '#95a278'] : planet.class === 'anomalous' ? ['#5a596d', '#afa08d'] : ['#515f5c', '#b49679'];
    const sky = context.createLinearGradient(0, 0, 0, height * .63);
    sky.addColorStop(0, skyColor[0]!); sky.addColorStop(1, skyColor[1]!);
    context.fillStyle = sky; context.fillRect(0, 0, width, height);
    const sunX = width * .77; const sunY = height * .22;
    const sunGlow = context.createRadialGradient(sunX, sunY, 3, sunX, sunY, 104);
    sunGlow.addColorStop(0, 'rgba(248,219,168,.64)'); sunGlow.addColorStop(.08, 'rgba(230,201,160,.2)'); sunGlow.addColorStop(1, 'rgba(228,202,160,0)');
    context.fillStyle = sunGlow; context.beginPath(); context.arc(sunX, sunY, 104, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#e9d6b3'; context.globalAlpha = .72; context.beginPath(); context.arc(sunX, sunY, 9, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
    context.fillStyle = 'rgba(223,228,207,.17)'; context.beginPath(); context.ellipse(width * .32, height * .31, width * .19, 8, -.08, 0, Math.PI * 2); context.fill();

    context.beginPath(); context.moveTo(0, height * .54);
    for (let x = 0; x <= width; x += 16) { const y = height * .45 + Math.sin(x * .012 + planet.seed) * height * .036 + Math.sin(x * .026) * height * .018; context.lineTo(x, y); }
    context.lineTo(width, height); context.lineTo(0, height); context.closePath();
    const farGround = context.createLinearGradient(0, height * .43, 0, height * .76); farGround.addColorStop(0, planet.accent); farGround.addColorStop(1, '#55534b'); context.globalAlpha = .62; context.fillStyle = farGround; context.fill(); context.globalAlpha = 1;

    const ground = context.createLinearGradient(0, height * .57, 0, height); ground.addColorStop(0, '#776c5c'); ground.addColorStop(.36, '#4d4941'); ground.addColorStop(1, '#232723');
    context.fillStyle = ground; context.fillRect(0, height * .57, width, height * .43);
    context.beginPath(); context.moveTo(0, height * .63);
    for (let x = 0; x <= width; x += 13) context.lineTo(x, height * .62 + Math.sin(x * .006 + planet.seed) * 13 + Math.cos(x * .019) * 4);
    context.lineTo(width, height); context.lineTo(0, height); context.closePath(); context.fillStyle = 'rgba(44,43,38,.6)'; context.fill();

    for (let index = 0; index < 110; index += 1) {
      const x = ((index * 197.3 + planet.seed) % width);
      const y = height * .58 + ((index * 61.7) % (height * .42));
      context.fillStyle = `rgba(206,194,160,${.035 + (index % 5) * .013})`;
      context.fillRect(x, y, 1 + index % 3, 1);
    }
    this.drawMountainRidge(planet, width, height);

    for (const poi of planet.pointsOfInterest) {
      const screenX = width * .5 + (poi.x - this.player.x) * 7.1;
      const screenY = height * .54 + (poi.z - this.player.z) * 4.2;
      if (screenX < -35 || screenX > width + 35 || screenY < height * .39 || screenY > height + 30) continue;
      const recovered = state.game.collectedNodes.includes(poi.id);
      const identified = state.game.scannedObjects.includes(poi.id);
      this.drawSurveyNode(poi, planet, screenX, screenY, identified, recovered, now);
    }

    const shipX = width * .5 - this.player.x * 7.1;
    const shipY = height * .54 + (19 - this.player.z) * 4.2;
    this.drawShip(shipX, shipY, .48, Math.PI);
    this.drawFieldResearcher(width * .5, height * .57, now);
    this.drawSceneLabel(`${planet.name.toUpperCase()} · ${planet.biome.toUpperCase()}`, width * .5, height * .42, '#f0e1c4');
    this.drawSceneLabel('MORROW RELAY · LARK FLIGHT DECK', width * .5, height * .86, '#b5c9bb');
    if (this.pulseTime < 1.1 && state.scanPulse > 0) {
      context.save(); context.globalAlpha = (1 - this.pulseTime / 1.1) * .43; context.strokeStyle = '#d6d7b0'; context.lineWidth = 1;
      context.beginPath(); context.ellipse(width * .5, height * .57, 18 + this.pulseTime * 210, 8 + this.pulseTime * 89, 0, 0, Math.PI * 2); context.stroke(); context.restore();
    }
  }

  private drawMountainRidge(planet: Planet, width: number, height: number): void {
    const context = this.context;
    const random = createRandom(planet.seed + 22);
    context.save(); context.fillStyle = planet.class === 'glacial' ? '#53656a' : '#4b4c46'; context.globalAlpha = .7;
    context.beginPath(); context.moveTo(0, height * .56);
    for (let index = 0; index <= 18; index += 1) {
      const x = index / 18 * width;
      const peak = height * (.39 + random() * .08);
      context.lineTo(x, peak); context.lineTo(x + width / 36, height * (.53 + random() * .05));
    }
    context.lineTo(width, height * .61); context.lineTo(0, height * .61); context.closePath(); context.fill(); context.restore();
  }

  private drawSurveyNode(poi: PointOfInterest, planet: Planet, x: number, y: number, scanned: boolean, recovered: boolean, now: number): void {
    const context = this.context;
    const resource = RESOURCES[poi.resourceId ?? 'ancient-alloy'];
    const color = resource?.color ?? planet.accent;
    context.save();
    context.globalAlpha = recovered ? .26 : .95;
    context.fillStyle = `${color}30`; context.beginPath(); context.ellipse(x, y + 3, poi.type === 'artifact' ? 27 : 18, 5, 0, 0, Math.PI * 2); context.fill();
    if (poi.type === 'artifact') {
      context.strokeStyle = scanned ? '#d5bc8c' : '#aab1a4'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(x - 15, y + 2); context.lineTo(x - 12, y - 33); context.lineTo(x - 3, y - 31); context.lineTo(x - 2, y + 2); context.stroke();
      context.beginPath(); context.moveTo(x + 13, y + 2); context.lineTo(x + 9, y - 36); context.lineTo(x + 2, y - 35); context.lineTo(x + 1, y + 2); context.stroke();
      context.beginPath(); context.arc(x, y - 31, 11, Math.PI, Math.PI * 2); context.stroke();
      context.fillStyle = scanned ? '#ddc78f' : '#a1b2a8'; context.globalAlpha *= .74 + Math.sin(now * .002) * .15; context.beginPath(); context.arc(x, y - 18, 3, 0, Math.PI * 2); context.fill();
    } else {
      for (let index = 0; index < 5; index += 1) {
        const offset = (index - 2) * 5;
        const tall = 11 + (index % 3) * 5;
        context.fillStyle = scanned ? color : '#8f998c'; context.globalAlpha = recovered ? .2 : scanned ? .87 : .52;
        context.beginPath(); context.moveTo(x + offset - 4, y); context.lineTo(x + offset, y - tall); context.lineTo(x + offset + 4, y); context.closePath(); context.fill();
      }
    }
    if (scanned && !recovered) {
      context.globalAlpha = .38 + Math.sin(now * .003) * .09; context.strokeStyle = color; context.lineWidth = 1;
      context.beginPath(); context.ellipse(x, y + 3, 19, 5, 0, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }

  private drawFieldResearcher(x: number, y: number, now: number): void {
    const context = this.context;
    context.save(); context.translate(x, y + Math.sin(now * .004) * 1.3);
    context.fillStyle = 'rgba(13,18,17,.52)'; context.beginPath(); context.ellipse(0, 18, 20, 5, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#bdc8c1'; context.strokeStyle = '#46565a'; context.lineWidth = 1;
    context.beginPath(); context.roundRect(-8, -9, 16, 24, 6); context.fill(); context.stroke();
    context.fillStyle = '#a9b5ad'; context.beginPath(); context.arc(0, -14, 7, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#4c727a'; context.beginPath(); context.ellipse(0, -15, 5.5, 3.7, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#47575d'; context.fillRect(-7, 12, 5, 10); context.fillRect(2, 12, 5, 10);
    context.fillStyle = '#d0ad74'; context.fillRect(7, -4, 2, 5);
    context.restore();
  }
}
