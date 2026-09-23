import * as THREE from 'three';
import { createRandom } from '../core/random';
import { terrainHeight } from '../core/terrain';
import type { Planet, PointOfInterest, StarSystem } from '../core/types';
import { RESOURCES } from '../data/resources';

const metallic = (color: string, roughness = 0.48) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.72 });

export function createStarfield(seed: number, count = 1900): THREE.Points {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color('#eef0ee'), new THREE.Color('#a5bfd5'), new THREE.Color('#e3c7a2'), new THREE.Color('#8099b7')];
  for (let index = 0; index < count; index += 1) {
    const radius = 460 + random() * 1450;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const color = palette[Math.floor(random() * palette.length)]!;
    const brightness = 0.42 + random() * 0.56;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false });
  return new THREE.Points(geometry, material);
}

function createPlanetTexture(planet: Planet): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const random = createRandom(planet.seed);
  context.fillStyle = planet.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const base = new THREE.Color(planet.color);
  const accent = new THREE.Color(planet.accent);
  const shadow = base.clone().multiplyScalar(0.56);

  for (let index = 0; index < 34; index += 1) {
    const centerX = random() * canvas.width;
    const centerY = 58 + random() * 396;
    const width = 18 + random() * 105;
    const height = 9 + random() * 45;
    context.beginPath();
    for (let point = 0; point <= 15; point += 1) {
      const angle = (point / 15) * Math.PI * 2;
      const wobble = 0.72 + random() * 0.48;
      const x = centerX + Math.cos(angle) * width * wobble;
      const y = centerY + Math.sin(angle) * height * wobble;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    const tint = index % 4 === 0 ? accent : index % 3 === 0 ? shadow : base.clone().lerp(accent, random() * 0.48);
    context.fillStyle = `#${tint.getHexString()}`;
    context.globalAlpha = 0.25 + random() * 0.44;
    context.fill();
  }
  context.globalAlpha = 1;
  if (planet.class === 'glacial' || planet.class === 'oceanic') {
    for (let index = 0; index < 18; index += 1) {
      const y = 32 + (index / 18) * 448;
      context.fillStyle = `rgba(230, 246, 246, ${0.045 + random() * 0.07})`;
      context.fillRect(0, y, canvas.width, 2 + random() * 5);
    }
  }
  for (let index = 0; index < 1000; index += 1) {
    context.fillStyle = `rgba(245, 240, 224, ${random() * 0.12})`;
    context.fillRect(random() * canvas.width, random() * canvas.height, 1.1, 1.1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPlanet(planet: Planet, position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(position);
  group.name = planet.id;
  const texture = createPlanetTexture(planet);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(planet.size, 56, 40),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0.04 }),
  );
  sphere.rotation.z = 0.12;
  group.add(sphere);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(planet.size * 1.1, 40, 32),
    new THREE.MeshBasicMaterial({ color: planet.accent, transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false }),
  );
  group.add(halo);
  if (planet.class === 'anomalous' || planet.class === 'glacial') {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(planet.size * 1.35, 0.42, 3, 96),
      new THREE.MeshBasicMaterial({ color: planet.accent, transparent: true, opacity: 0.42 }),
    );
    ring.rotation.x = Math.PI * 0.44;
    ring.rotation.y = 0.14;
    group.add(ring);
  }
  return group;
}

export function createStar(system: StarSystem): THREE.Group {
  const star = new THREE.Group();
  const color = new THREE.Color(system.starColor);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(13, 32, 24),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  star.add(core);
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(17, 24, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }),
  );
  star.add(corona);
  const light = new THREE.PointLight(color, 3100, 1550, 1.55);
  star.add(light);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(23, 24, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.BackSide, depthWrite: false }),
  );
  star.add(halo);
  return star;
}

export function createSurveyShip(): THREE.Group {
  const ship = new THREE.Group();
  const hull = metallic('#788994', 0.34);
  const dark = metallic('#27343e', 0.38);
  const wing = new THREE.Mesh(
    new THREE.BufferGeometry(),
    hull,
  );
  const wingVertices = new Float32Array([
    0, 0, 1.6, -3.1, 0, 2.5, -2.6, 0, 0.65,
    0, 0, 1.6, -2.6, 0, 0.65, -0.75, 0, -1.2,
    0, 0, 1.6, 0.75, 0, -1.2, 2.6, 0, 0.65,
    0, 0, 1.6, 2.6, 0, 0.65, 3.1, 0, 2.5,
  ]);
  wing.geometry.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
  wing.geometry.computeVertexNormals();
  const wingMesh = new THREE.Mesh(wing.geometry, new THREE.MeshStandardMaterial({ color: '#596a76', roughness: 0.41, metalness: 0.7, side: THREE.DoubleSide }));
  ship.add(wingMesh);

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.67, 4.9, 10, 1), hull);
  fuselage.rotation.x = -Math.PI / 2;
  ship.add(fuselage);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.13, 3.45), dark);
  spine.position.set(0, 0.53, 0.22);
  ship.add(spine);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.57, 20, 14),
    new THREE.MeshPhysicalMaterial({ color: '#7fb2c7', metalness: 0.52, roughness: 0.16, transparent: true, opacity: 0.76, clearcoat: 0.8 }),
  );
  canopy.scale.set(0.72, 0.34, 1.05);
  canopy.position.set(0, 0.42, -0.94);
  ship.add(canopy);

  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.42, 1.1, 12), dark);
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(side * 1.16, -0.03, 1.35);
    ship.add(engine);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.65, 12),
      new THREE.MeshBasicMaterial({ color: '#9bd6e8', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(side * 1.16, -0.03, 2.38);
    flame.name = 'engine-flame';
    ship.add(flame);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), new THREE.MeshBasicMaterial({ color: side < 0 ? '#e38f78' : '#9fe1d1', toneMapped: false }));
    nav.position.set(side * 2.72, 0.1, 0.9);
    ship.add(nav);
  }
  return ship;
}

export function createRelayStation(): THREE.Group {
  const station = new THREE.Group();
  const structure = metallic('#52636b', 0.38);
  const glass = new THREE.MeshStandardMaterial({ color: '#81b6bc', emissive: '#366573', emissiveIntensity: 0.75, roughness: 0.26, metalness: 0.42 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.86, 10, 96), structure);
  ring.rotation.x = Math.PI * 0.18;
  station.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.38, 8, 64), glass);
  inner.rotation.x = Math.PI * 0.18;
  station.add(inner);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 16, 12), structure);
  hub.rotation.x = Math.PI / 2;
  station.add(hub);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.15, 3.6), glass);
    pod.position.set(Math.cos(angle) * 11.7, Math.sin(angle) * 11.7, 0);
    pod.lookAt(Math.cos(angle) * 20, Math.sin(angle) * 20, 0);
    station.add(pod);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 15, 8), structure);
  antenna.position.set(0, 12, -4);
  station.add(antenna);
  station.position.set(-24, 8, -86);
  return station;
}

export function createAsteroids(seed: number, count = 220): THREE.InstancedMesh {
  const random = createRandom(seed + 114);
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#646d74', roughness: 0.96, metalness: 0.12 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 102 + random() * 24;
    dummy.position.set(Math.cos(angle) * radius, (random() - 0.5) * 14, -190 - random() * 410);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const size = 0.45 + random() * 2.1;
    dummy.scale.set(size * (0.8 + random() * 0.4), size * (0.6 + random() * 0.6), size * (0.75 + random() * 0.55));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function createTerrain(seed: number, accent: string): THREE.Mesh {
  const segments = 126;
  const size = 170;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const base = new THREE.Color('#625e59');
  const high = new THREE.Color(accent);
  const colors: number[] = [];
  const scratch = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    const height = terrainHeight(x, z, seed);
    positions.setZ(index, height);
    const variation = THREE.MathUtils.clamp((height + 3.4) / 9, 0, 0.74);
    scratch.copy(base).lerp(high, variation);
    const fleck = 0.88 + (Math.sin(x * 0.23 + seed) * Math.cos(z * 0.19) + 1) * 0.045;
    colors.push(scratch.r * fleck, scratch.g * fleck, scratch.b * fleck);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04, side: THREE.DoubleSide });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  return terrain;
}

export function createSurfaceFlora(seed: number, accent: string, count = 120): THREE.InstancedMesh {
  const random = createRandom(seed + 82);
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.82, metalness: 0.08, flatShading: true }),
    count,
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 156;
    const z = (random() - 0.5) * 138 - 7;
    dummy.position.set(x, terrainHeight(x, z, seed) + 0.7, z);
    dummy.rotation.set(random() * 0.7, random() * Math.PI, random() * 0.7);
    const scale = 0.3 + random() * 1.1;
    dummy.scale.set(scale * 0.72, scale, scale * 0.64);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function createSurveySite(poi: PointOfInterest, planet: Planet, scanned: boolean): THREE.Group {
  const site = new THREE.Group();
  site.position.set(poi.x, terrainHeight(poi.x, poi.z, planet.seed), poi.z);
  site.name = poi.id;
  const resource = RESOURCES[poi.resourceId ?? 'ancient-alloy'];
  const color = new THREE.Color(resource?.color ?? planet.accent);
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: scanned ? 0.56 : 0.18, roughness: 0.3, metalness: 0.28 });
  const rock = new THREE.MeshStandardMaterial({ color: '#686862', roughness: 0.92, flatShading: true });

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(poi.type === 'artifact' ? 4.4 : 2.6, 0.075, 5, 44),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: scanned ? 0.74 : 0.28, depthWrite: false }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.12;
  site.add(halo);

  if (poi.type === 'artifact') {
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 5.5, 0.74), rock);
      pillar.position.set(side * 2.35, 2.4, 0);
      pillar.rotation.z = side * -0.06;
      site.add(pillar);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.32, 8, 48, Math.PI), accent);
    arch.position.y = 3.85;
    site.add(arch);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 1), accent);
    core.position.set(0, 2.4, 0.1);
    core.name = 'signal-core';
    site.add(core);
  } else {
    const random = createRandom(planet.seed + poi.x * 71 + poi.z * 11);
    for (let index = 0; index < 7; index += 1) {
      const height = 0.9 + random() * 2.6;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.33 + random() * 0.4, height, 5), accent);
      crystal.position.set((random() - 0.5) * 2.6, height / 2, (random() - 0.5) * 2.1);
      crystal.rotation.z = (random() - 0.5) * 0.28;
      site.add(crystal);
      if (index < 3) {
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + random() * 0.4, 0), rock);
        shard.position.set((random() - 0.5) * 3.5, 0.4, (random() - 0.5) * 2.8);
        site.add(shard);
      }
    }
  }
  return site;
}

export function createFieldResearcher(): THREE.Group {
  const player = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: '#c6d0cc', roughness: 0.76, metalness: 0.16 });
  const dark = new THREE.MeshStandardMaterial({ color: '#36434a', roughness: 0.7, metalness: 0.22 });
  const visor = new THREE.MeshStandardMaterial({ color: '#587b87', roughness: 0.2, metalness: 0.38, emissive: '#1b3741', emissiveIntensity: 0.32 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.88, 5, 9), suit);
  torso.position.y = 1.32;
  player.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), suit);
  head.position.set(0, 2.2, -0.05);
  player.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.305, 16, 12), visor);
  face.scale.set(1.08, 0.72, 0.5);
  face.position.set(0, 2.2, -0.31);
  player.add(face);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.38), dark);
  pack.position.set(0, 1.38, 0.54);
  player.add(pack);
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.43), dark);
    boot.position.set(side * 0.25, 0.36, -0.03);
    player.add(boot);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), suit);
    shoulder.position.set(side * 0.54, 1.65, 0);
    player.add(shoulder);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: '#d6ad7b', toneMapped: false }));
  beacon.position.set(0, 1.4, 0.78);
  player.add(beacon);
  return player;
}

export function createLandingShip(position: THREE.Vector3): THREE.Group {
  const ship = createSurveyShip();
  ship.scale.setScalar(0.72);
  ship.position.copy(position);
  ship.rotation.y = Math.PI;
  return ship;
}

export function createRingMarker(color: string): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(5.5, 0.08, 5, 52),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
  marker.rotation.x = Math.PI / 2;
  return marker;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      });
    }
  });
}
