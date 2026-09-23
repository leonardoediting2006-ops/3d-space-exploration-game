import * as THREE from 'three';
import { terrainHeight } from '../core/terrain';
import type { Planet } from '../core/types';
import { getPlanet } from '../data/galaxy';
import { useGameStore } from '../state/store';
import {
  createAsteroids,
  createFieldResearcher,
  createLandingShip,
  createPlanet,
  createRelayStation,
  createStar,
  createStarfield,
  createSurveyShip,
  createSurveySite,
  createSurfaceFlora,
  createTerrain,
  disposeObject,
} from './proceduralScene';

type MovementKeys = Record<string, boolean>;

const FORWARD = new THREE.Vector3(0, 0, -1);
const TEMP_VECTOR = new THREE.Vector3();

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function planetPosition(index: number): THREE.Vector3 {
  if (index === 0) return new THREE.Vector3(12, -5, -355);
  if (index === 1) return new THREE.Vector3(164, 45, -650);
  return new THREE.Vector3(-184, -28, -925);
}

function labelSprite(label: string, color = '#d4dfdc'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '500 30px Inter, system-ui, sans-serif';
    context.letterSpacing = '4px';
    context.fillStyle = 'rgba(220,232,228,.82)';
    context.fillRect(0, 0, 512, 1);
    context.fillStyle = color;
    context.fillText(label.toUpperCase(), 20, 59);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.8 }));
  sprite.scale.set(28, 5.3, 1);
  return sprite;
}

export class WorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(54, 1, 0.1, 9000);
  private readonly world = new THREE.Group();
  private readonly ship = createSurveyShip();
  private readonly player = createFieldResearcher();
  private readonly keys: MovementKeys = {};
  private readonly shipPosition = new THREE.Vector3(0, 0, 0);
  private readonly playerPosition = new THREE.Vector3(0, 0, 13);
  private readonly cameraDesired = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly planetMeshes = new Map<string, { planet: Planet; group: THREE.Group; position: THREE.Vector3 }>();
  private readonly surfaceSites = new Map<string, THREE.Group>();
  private readonly ambient = new THREE.HemisphereLight('#c5d3d1', '#141920', 1.65);
  private readonly keyLight = new THREE.DirectionalLight('#ffe4bf', 2.2);
  private readonly surfaceLight = new THREE.DirectionalLight('#f6e6d1', 3.1);
  private readonly surfaceAmbient = new THREE.HemisphereLight('#b7d7dd', '#35332e', 2.1);
  private surfacePlanet: Planet | null = null;
  private starfield: THREE.Points | null = null;
  private station: THREE.Group | null = null;
  private scannerWave: THREE.Mesh | null = null;
  private scannerWaveAge = 0;
  private shipSpeed = 0;
  private surfaceVelocity = new THREE.Vector3();
  private jumpVelocity = 0;
  private jumpHeight = 0;
  private viewYaw = 0;
  private viewPitch = 0;
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private lastTelemetryAt = 0;
  private lastNearbyId = '';
  private lastScanPulse = 0;
  private frame = 0;
  private lastFrameAt = performance.now();
  private currentMode = '';
  private currentSystemId = '';
  private currentPlanetId = '';
  private previousLocation = '';
  private disposed = false;
  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    this.keys[event.code] = true;
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys[event.code] = false;
  };
  private readonly onBlur = () => {
    for (const code of Object.keys(this.keys)) this.keys[code] = false;
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.dragging = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.pointerX;
    const dy = event.clientY - this.pointerY;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    const mode = useGameStore.getState().game.location;
    if (mode === 'surface') {
      this.viewYaw -= dx * 0.0035;
      this.viewPitch = THREE.MathUtils.clamp(this.viewPitch + dy * 0.0017, -0.22, 0.42);
    } else if (mode === 'space') {
      this.ship.rotation.y -= dx * 0.0022;
      this.ship.rotation.x = THREE.MathUtils.clamp(this.ship.rotation.x + dy * 0.0015, -0.42, 0.42);
    }
  };
  private readonly onPointerUp = () => { this.dragging = false; };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.scene.background = new THREE.Color('#05080c');
    this.scene.add(this.world, this.ambient, this.keyLight, this.surfaceLight, this.surfaceAmbient);
    this.keyLight.position.set(-220, 320, 140);
    this.surfaceLight.position.set(80, 145, 70);
    this.camera.position.set(0, 5, 17);
    this.camera.lookAt(0, 0, -28);
    this.ship.castShadow = true;
    this.scene.add(this.ship, this.player);
    this.player.visible = false;
    this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.syncWorld(useGameStore.getState());
    this.animate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerUp);
    this.clearWorld();
    this.renderer.dispose();
  }

  private resize(): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < 700 ? 59 : 54;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameAt) / 1000, 0.04);
    this.lastFrameAt = now;
    const state = useGameStore.getState();
    this.syncWorld(state);

    if (state.game.location === 'surface') this.updateSurface(delta, state);
    else this.updateFlight(delta, state);

    if (this.starfield) this.starfield.position.copy(this.camera.position);
    if (this.scannerWave) {
      this.scannerWaveAge += delta;
      const progress = Math.min(this.scannerWaveAge / 1.15, 1);
      this.scannerWave.scale.setScalar(0.5 + progress * 14);
      const material = this.scannerWave.material as THREE.MeshBasicMaterial;
      material.opacity = (1 - progress) * 0.55;
      if (progress >= 1) {
        this.world.remove(this.scannerWave);
        this.scannerWave.geometry.dispose();
        material.dispose();
        this.scannerWave = null;
      }
    }
    this.animateEngines(delta, state);
    this.renderer.render(this.scene, this.camera);
  };

  private syncWorld(state: ReturnType<typeof useGameStore.getState>): void {
    const { game } = state;
    const mode = game.location;
    const systemChanged = this.currentSystemId !== game.currentSystemId;
    const planetChanged = this.currentPlanetId !== game.selectedPlanetId;
    const modeChanged = this.currentMode !== mode;
    if (!systemChanged && !planetChanged && !modeChanged) return;

    if (systemChanged) {
      this.currentSystemId = game.currentSystemId;
      this.currentMode = '';
      this.buildSpaceWorld(state);
      this.shipPosition.set(0, 0, 0);
      this.ship.position.copy(this.shipPosition);
      this.ship.rotation.set(0, 0, 0);
    }
    if (planetChanged) this.currentPlanetId = game.selectedPlanetId;
    const previous = this.previousLocation;
    this.previousLocation = mode;
    this.currentMode = mode;

    if (mode === 'surface') {
      this.buildSurface(state);
    } else {
      if (previous === 'surface') {
        this.buildSpaceWorld(state);
        const found = getPlanet(state.galaxy, game.selectedPlanetId);
        if (found) {
          const index = found.system.planets.findIndex((planet) => planet.id === found.planet.id);
          this.shipPosition.copy(planetPosition(index)).add(new THREE.Vector3(0, 0, found.planet.size + 56));
          this.ship.rotation.set(0, Math.PI, 0);
          this.shipSpeed = 0;
          this.ship.position.copy(this.shipPosition);
        }
      } else if (previous === 'station') {
        this.shipPosition.set(0, 0, 0);
        this.ship.position.copy(this.shipPosition);
      } else if (mode === 'station') {
        this.shipPosition.set(0, 0, 0);
        this.ship.position.copy(this.shipPosition);
        this.ship.rotation.set(0, 0, 0);
        this.shipSpeed = 0;
      }
      this.player.visible = false;
      this.world.visible = true;
      this.ship.visible = true;
      this.surfacePlanet = null;
      this.surfaceSites.clear();
      this.scene.background = new THREE.Color('#05080c');
      this.scene.fog = new THREE.FogExp2('#060b10', 0.00024);
      this.surfaceLight.visible = false;
      this.surfaceAmbient.visible = false;
      this.ambient.visible = true;
      if (mode === 'station' && !this.station) {
        const system = state.galaxy.find((entry) => entry.id === game.currentSystemId);
        if (system) {
          this.station = createRelayStation();
          this.world.add(this.station);
        }
      }
      if (mode !== 'station' && this.station) this.station.visible = false;
      if (mode === 'station' && this.station) this.station.visible = true;
      if (mode === 'orbit') this.positionAtOrbit(state);
    }
    this.lastNearbyId = '';
  }

  private clearWorld(): void {
    while (this.world.children.length) {
      const child = this.world.children[0]!;
      this.world.remove(child);
      disposeObject(child);
    }
    this.planetMeshes.clear();
    this.surfaceSites.clear();
    this.starfield = null;
    this.station = null;
    this.scannerWave = null;
  }

  private buildSpaceWorld(state: ReturnType<typeof useGameStore.getState>): void {
    this.clearWorld();
    const system = state.galaxy.find((entry) => entry.id === state.game.currentSystemId);
    if (!system) return;
    this.scene.background = new THREE.Color('#05080c');
    this.scene.fog = new THREE.FogExp2('#070b11', 0.00024);
    this.ambient.visible = true;
    this.surfaceLight.visible = false;
    this.surfaceAmbient.visible = false;
    this.starfield = createStarfield(system.seed);
    this.world.add(this.starfield);
    const star = createStar(system);
    star.position.set(-130, 178, -1220);
    star.scale.setScalar(system.starType === 'Pulsar' ? 0.72 : 1);
    this.world.add(star);
    this.world.add(createAsteroids(system.seed));
    const positions = system.planets.map((_, index) => planetPosition(index));
    for (const [index, planet] of system.planets.entries()) {
      const position = positions[index]!;
      const group = createPlanet(planet, position);
      this.world.add(group);
      const name = labelSprite(planet.name, planet.accent);
      name.position.set(0, planet.size + 8, 0);
      group.add(name);
      this.planetMeshes.set(planet.id, { planet, group, position });
    }
    this.ship.visible = true;
  }

  private buildSurface(state: ReturnType<typeof useGameStore.getState>): void {
    const found = getPlanet(state.galaxy, state.game.selectedPlanetId);
    if (!found) return;
    this.clearWorld();
    this.surfacePlanet = found.planet;
    this.world.visible = true;
    this.player.visible = true;
    this.ship.visible = false;
    this.ambient.visible = false;
    this.surfaceLight.visible = true;
    this.surfaceAmbient.visible = true;
    this.surfaceLight.position.set(72, 130, 56);
    const sky = found.planet.class === 'glacial' ? '#657f91' : found.planet.class === 'toxic' ? '#647f72' : found.planet.class === 'anomalous' ? '#756c83' : '#78847f';
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.FogExp2(sky, 0.009);

    const terrain = createTerrain(found.planet.seed, found.planet.accent);
    this.world.add(terrain);
    this.world.add(createSurfaceFlora(found.planet.seed, found.planet.accent, found.planet.class === 'arid' ? 72 : 145));

    const random = found.planet.seed;
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2;
      const distance = 68 + ((random >>> (index % 16)) & 15);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance - 10;
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(5 + (index % 4) * 1.4, 18 + (index % 5) * 5, 5),
        new THREE.MeshStandardMaterial({ color: found.planet.class === 'glacial' ? '#91a9ae' : '#4a4d48', roughness: 0.96, flatShading: true }),
      );
      peak.position.set(x, terrainHeight(x, z, found.planet.seed) + 9, z);
      peak.rotation.y = index * 0.74;
      this.world.add(peak);
    }

    for (const poi of found.planet.pointsOfInterest) {
      const site = createSurveySite(poi, found.planet, state.game.scannedObjects.includes(poi.id));
      this.surfaceSites.set(poi.id, site);
      this.world.add(site);
    }
    const shipPosition = new THREE.Vector3(0, terrainHeight(0, 19, found.planet.seed), 19);
    this.world.add(createLandingShip(shipPosition));
    this.playerPosition.set(0, terrainHeight(0, 12, found.planet.seed), 12);
    this.player.position.copy(this.playerPosition);
    this.player.rotation.set(0, 0, 0);
    this.surfaceVelocity.set(0, 0, 0);
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.lastNearbyId = '';
    this.camera.position.set(0, 9, 28);
    this.camera.lookAt(0, 1.6, -8);
  }

  private positionAtOrbit(state: ReturnType<typeof useGameStore.getState>): void {
    const found = getPlanet(state.galaxy, state.game.selectedPlanetId);
    if (!found) return;
    const index = found.system.planets.findIndex((planet) => planet.id === found.planet.id);
    const center = planetPosition(index);
    this.shipPosition.copy(center).add(new THREE.Vector3(0, 0, found.planet.size + 54));
    this.ship.position.copy(this.shipPosition);
    this.ship.rotation.set(0, Math.PI, 0);
    this.shipSpeed = 0;
  }

  private getTarget(state: ReturnType<typeof useGameStore.getState>): { planet: Planet; center: THREE.Vector3; position: THREE.Vector3; radius: number } | undefined {
    const found = getPlanet(state.galaxy, state.game.selectedPlanetId);
    if (!found || found.system.id !== state.game.currentSystemId) return undefined;
    const index = found.system.planets.findIndex((planet) => planet.id === found.planet.id);
    const center = planetPosition(index);
    const fromWorld = this.planetMeshes.get(found.planet.id)?.position ?? center;
    return { planet: found.planet, center, position: fromWorld, radius: found.planet.size };
  }

  private updateFlight(delta: number, state: ReturnType<typeof useGameStore.getState>): void {
    const mode = state.game.location;
    const target = this.getTarget(state);
    let distanceToOrbit = 286;

    if (mode === 'space') {
      const boost = this.keys.ShiftLeft || this.keys.ShiftRight;
      const maxSpeed = state.game.upgrades.includes('survey-drive') ? 68 : 54;
      const boostSpeed = boost ? maxSpeed * 1.55 : maxSpeed;
      if (state.autopilot && target) {
        const direction = target.position.clone().sub(this.shipPosition);
        const distance = direction.length();
        const orbitDistance = target.radius + 52;
        const travel = Math.max(0, distance - orbitDistance);
        distanceToOrbit = travel;
        direction.normalize();
        const desired = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
        this.ship.quaternion.slerp(desired, 1 - Math.exp(-1.55 * delta));
        this.shipSpeed = THREE.MathUtils.damp(this.shipSpeed, maxSpeed * 0.78, 0.75, delta);
        const step = Math.min(travel, this.shipSpeed * delta);
        this.shipPosition.addScaledVector(direction, step);
        if (travel <= 1.25) {
          this.shipPosition.copy(target.position).addScaledVector(direction, -orbitDistance);
          this.ship.position.copy(this.shipPosition);
          useGameStore.getState().setAutopilot(false);
          useGameStore.getState().setLocation('orbit');
          useGameStore.setState({ toast: `Orbit established · ${target.planet.name}`, toastTone: 'success' });
        }
      } else {
        const throttle = this.keys.KeyW;
        const brake = this.keys.KeyS;
        if (throttle) this.shipSpeed = Math.min(boostSpeed, this.shipSpeed + (boost ? 32 : 17) * delta);
        else if (brake) this.shipSpeed = Math.max(0, this.shipSpeed - 32 * delta);
        else this.shipSpeed = Math.max(0, this.shipSpeed - 0.95 * delta);
        const turn = (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) - (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0);
        const pitch = (this.keys.ArrowUp ? 0.55 : 0) - (this.keys.ArrowDown ? 0.55 : 0);
        this.ship.rotation.y += turn * 0.72 * delta;
        this.ship.rotation.x = THREE.MathUtils.clamp(this.ship.rotation.x + pitch * delta, -0.48, 0.48);
        this.ship.rotation.z = THREE.MathUtils.damp(this.ship.rotation.z, -turn * 0.16, 3.8, delta);
        const forward = FORWARD.clone().applyQuaternion(this.ship.quaternion);
        this.shipPosition.addScaledVector(forward, this.shipSpeed * delta);

        if (target) {
          const distance = this.shipPosition.distanceTo(target.position);
          distanceToOrbit = Math.max(0, distance - target.radius - 52);
          if (distance <= target.radius + 26) {
            this.shipPosition.copy(target.position).add(new THREE.Vector3(0, 0, target.radius + 52));
            useGameStore.getState().setLocation('orbit');
            useGameStore.setState({ toast: `Orbit established · ${target.planet.name}`, toastTone: 'success' });
          }
        }
      }
      this.ship.position.copy(this.shipPosition);
      const cameraOffset = new THREE.Vector3(0, 4.7, 15.8).applyQuaternion(this.ship.quaternion);
      this.cameraDesired.copy(this.shipPosition).add(cameraOffset);
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-3.4 * delta));
      const forward = FORWARD.clone().applyQuaternion(this.ship.quaternion);
      this.cameraTarget.copy(this.shipPosition).addScaledVector(forward, 23);
      this.camera.lookAt(this.cameraTarget);
      this.ship.visible = true;
      this.player.visible = false;
    } else if (mode === 'orbit' && target) {
      distanceToOrbit = 0;
      this.ship.visible = true;
      this.player.visible = false;
      this.shipSpeed = 0;
      const offset = new THREE.Vector3(0, 6.4, 12.5).applyQuaternion(this.ship.quaternion);
      this.cameraDesired.copy(this.shipPosition).add(offset);
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-2.5 * delta));
      this.camera.lookAt(target.position);
    } else {
      this.ship.visible = true;
      this.player.visible = false;
      this.shipSpeed = 0;
      this.cameraDesired.set(0, 5.5, 17.5);
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-1.8 * delta));
      this.camera.lookAt(-12, 1, -45);
    }

    if (this.station && mode !== 'station') this.station.visible = false;
    const now = performance.now();
    if (now - this.lastTelemetryAt > 160) {
      this.lastTelemetryAt = now;
      useGameStore.getState().setFlightTelemetry(this.shipSpeed, distanceToOrbit);
    }
  }

  private updateSurface(delta: number, state: ReturnType<typeof useGameStore.getState>): void {
    const planet = this.surfacePlanet;
    if (!planet) return;
    const forward = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    const strafe = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
    const walking = forward !== 0 || strafe !== 0;
    const speed = this.keys.ShiftLeft || this.keys.ShiftRight ? 12 : 7.2;
    const direction = new THREE.Vector3(
      Math.sin(this.viewYaw) * forward + Math.cos(this.viewYaw) * strafe,
      0,
      -Math.cos(this.viewYaw) * forward + Math.sin(this.viewYaw) * strafe,
    );
    if (direction.lengthSq() > 1) direction.normalize();
    TEMP_VECTOR.copy(direction).multiplyScalar(walking ? speed : 0);
    this.surfaceVelocity.lerp(TEMP_VECTOR, 1 - Math.exp(-9 * delta));
    this.playerPosition.addScaledVector(this.surfaceVelocity, delta);
    this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, -77, 77);
    this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, -74, 73);

    if (this.keys.Space && this.jumpHeight <= 0.015) this.jumpVelocity = 6.8;
    this.jumpVelocity -= 19 * delta;
    this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * delta);
    if (this.jumpHeight === 0) this.jumpVelocity = 0;
    this.playerPosition.y = terrainHeight(this.playerPosition.x, this.playerPosition.z, planet.seed) + this.jumpHeight;
    this.player.position.copy(this.playerPosition);
    if (walking) this.player.rotation.y = this.viewYaw + Math.atan2(strafe, forward) * 0.4;

    const cameraDistance = 13.8;
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.viewYaw) * cameraDistance,
      7.1 + this.viewPitch * 8,
      Math.cos(this.viewYaw) * cameraDistance,
    );
    this.cameraDesired.copy(this.playerPosition).add(cameraOffset);
    this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-5 * delta));
    this.cameraTarget.set(this.playerPosition.x - Math.sin(this.viewYaw) * 4, this.playerPosition.y + 2.1, this.playerPosition.z + Math.cos(this.viewYaw) * -4);
    this.camera.lookAt(this.cameraTarget);

    const nearby = this.findNearby(state, planet);
    const nearbyKey = nearby ? `${nearby.id}:${nearby.scanned}` : '';
    if (nearbyKey !== this.lastNearbyId) {
      this.lastNearbyId = nearbyKey;
      useGameStore.getState().setNearby(nearby);
    }
  }

  private findNearby(state: ReturnType<typeof useGameStore.getState>, planet: Planet) {
    const candidates = planet.pointsOfInterest.map((point) => {
      const mesh = this.surfaceSites.get(point.id);
      const distance = mesh ? Math.hypot(mesh.position.x - this.playerPosition.x, mesh.position.z - this.playerPosition.z) : Infinity;
      return { point, distance };
    }).sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    const shipDistance = Math.hypot(this.playerPosition.x, this.playerPosition.z - 19);
    if (shipDistance < 8.5 && (!nearest || nearest.distance > shipDistance)) {
      return { id: 'ship-recall', name: 'The Lark', type: 'ship' as const, distance: shipDistance, scanned: true };
    }
    if (!nearest || nearest.distance > 8.5) return null;
    return {
      id: nearest.point.id,
      name: nearest.point.name,
      type: nearest.point.type,
      distance: nearest.distance,
      scanned: state.game.scannedObjects.includes(nearest.point.id),
    };
  }

  private animateEngines(delta: number, state: ReturnType<typeof useGameStore.getState>): void {
    const active = state.game.location === 'space' && (this.shipSpeed > 1 || state.autopilot);
    for (const child of this.ship.children) {
      if (child.name !== 'engine-flame') continue;
      child.visible = active;
      if (active) child.scale.set(0.8 + Math.sin(performance.now() * 0.015) * 0.12, 0.82 + this.shipSpeed * 0.018, 0.82 + this.shipSpeed * 0.018);
    }
    if (state.scanPulse !== this.lastScanPulse) {
      this.lastScanPulse = state.scanPulse;
      this.spawnScannerWave(state.game.location);
    }
    if (this.starfield && state.game.location !== 'surface') this.starfield.rotation.y += delta * 0.0008;
  }

  private spawnScannerWave(location: string): void {
    if (this.scannerWave) {
      this.world.remove(this.scannerWave);
      this.scannerWave.geometry.dispose();
      (this.scannerWave.material as THREE.Material).dispose();
    }
    const color = this.surfacePlanet?.accent ?? '#a9d5d2';
    const wave = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.075, 6, 80),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.54, depthWrite: false }),
    );
    if (location === 'surface') {
      wave.position.set(this.playerPosition.x, this.playerPosition.y + 0.2, this.playerPosition.z);
      wave.rotation.x = Math.PI / 2;
    } else {
      wave.position.copy(this.shipPosition);
      wave.quaternion.copy(this.ship.quaternion);
    }
    this.world.add(wave);
    this.scannerWave = wave;
    this.scannerWaveAge = 0;
  }
}
