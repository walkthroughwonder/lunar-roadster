import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { input, readDrive } from "./input";
import { CAR_VARIANTS, PAINTS, sim, type CarVariantId } from "./sim";
import {
  APPROACH_GATES,
  MASS_DRIVER_TRACK,
  ORBITAL_STATION,
  PADS,
  ROCKS,
  SHACKLETON_R,
  SURFACE_STARSHIP,
  terrainHeight,
  terrainNormal,
} from "./world";

type Probe = {
  getYaw: () => number;
  getSpeed: () => number;
  setSteer: (v: number) => void;
  setKeys: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: Probe;
    __roadster?: { nodes: number; mats: string[] };
  }
}

function labelSprite(text: string, colorHex = "#e6e0d4"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 512, 128);
    g.font = "600 48px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = colorHex;
    g.fillText(text, 256, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(22, 5.5, 1);
  return s;
}

/**
 * High-contrast 1024×1024 lunar regolith texture with multi-scale micro-craters,
 * sharp low-sun shadow crescents, sunlit eastern rims, and basalt/anorthosite clasts
 * for maximum optical-flow sense of speed at ground level.
 */
function buildRegolithTexture(maxAnisotropy = 8): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#827e76";
    g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < d.length; i += 4) {
      const px = (i >> 2) % size;
      const py = (i >> 2) / size;
      const wave =
        Math.sin(px * 0.0368 + py * 0.0184) * 14 +
        Math.cos(px * 0.0736 - py * 0.0552) * 9;
      const grain = (rand() - 0.5) * 48;
      const clast = rand() > 0.992 ? 55 : rand() < 0.008 ? -48 : 0;
      const v = 132 + wave + grain + clast;
      d[i] = Math.max(0, Math.min(255, v + 3));
      d[i + 1] = Math.max(0, Math.min(255, v));
      d[i + 2] = Math.max(0, Math.min(255, v - 6));
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);

    // 380 multi-scale micro-craters with grazing-sun dark shadow crescents & bright sunlit rims
    for (let i = 0; i < 380; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 2.5 + rand() ** 2.1 * 34;
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const x = cx + ox;
          const y = cy + oy;
          if (x + r * 1.5 < 0 || x - r * 1.5 > size || y + r * 1.5 < 0 || y - r * 1.5 > size) {
            continue;
          }
          // Sunlit outer lip (shifted toward +X/+Y sun direction)
          const lipGrad = g.createRadialGradient(
            x + r * 0.22,
            y + r * 0.12,
            r * 0.4,
            x,
            y,
            r * 1.38,
          );
          lipGrad.addColorStop(0, "rgba(215, 210, 198, 0.34)");
          lipGrad.addColorStop(0.65, "rgba(195, 190, 180, 0.24)");
          lipGrad.addColorStop(1, "rgba(130, 126, 118, 0)");
          g.fillStyle = lipGrad;
          g.beginPath();
          g.arc(x, y, r * 1.38, 0, Math.PI * 2);
          g.fill();

          // Deep grazing-sun shadow bowl (shifted toward -X/-Y shadow side)
          const bowlGrad = g.createRadialGradient(
            x - r * 0.28,
            y - r * 0.14,
            r * 0.08,
            x,
            y,
            r * 0.96,
          );
          bowlGrad.addColorStop(0, "rgba(22, 20, 18, 0.62)");
          bowlGrad.addColorStop(0.55, "rgba(42, 39, 35, 0.38)");
          bowlGrad.addColorStop(0.88, "rgba(175, 170, 160, 0.22)");
          bowlGrad.addColorStop(1, "rgba(130, 126, 118, 0)");
          g.fillStyle = bowlGrad;
          g.beginPath();
          g.arc(x, y, r * 0.96, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = Math.max(4, maxAnisotropy);
  return tex;
}

type Particle = {
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

type LoadedCarBundle = {
  root: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
  mats: Record<
    string,
    THREE.MeshStandardMaterial & { transmission?: number; envMapIntensity?: number }
  >;
  appliedPaintIdx: number;
};

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Builds the pair of articulated steel Catch Arms on a lunar landing pad
 * (pedestal with yellow hazard band, shoulder clevis, upper/forearm box beams,
 * hydraulic rams, and 3-finger QD collar grippers, matching rc_scene.py).
 */
function buildPadCatchArms(
  steelMat: THREE.Material,
  jointMat: THREE.Material,
  rodMat: THREE.Material,
  hazardMat: THREE.Material,
): { group: THREE.Group; armPivots: { side: number; upper: THREE.Group; forearm: THREE.Group }[] } {
  const group = new THREE.Group();
  const armPivots: { side: number; upper: THREE.Group; forearm: THREE.Group }[] = [];

  for (const side of [-1, 1] as const) {
    const baseX = side * 2.55;
    const baseZ = 1.52;
    const armRoot = new THREE.Group();
    armRoot.position.set(baseX, 0.02, baseZ);
    group.add(armRoot);

    // Bolted base plate & turret pedestal with yellow hazard band
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 32), jointMat);
    plate.position.y = 0.025;
    plate.castShadow = true;
    armRoot.add(plate);

    const lowerPed = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.32, 32), steelMat);
    lowerPed.position.y = 0.2;
    lowerPed.castShadow = true;
    armRoot.add(lowerPed);

    const upperPed = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.52, 32), steelMat);
    upperPed.position.y = 0.62;
    upperPed.castShadow = true;
    armRoot.add(upperPed);

    const hazard = new THREE.Mesh(new THREE.CylinderGeometry(0.306, 0.306, 0.09, 32), hazardMat);
    hazard.position.y = 0.56;
    armRoot.add(hazard);

    // Shoulder clevis & pin
    const shoulderPin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 24), jointMat);
    shoulderPin.rotation.x = Math.PI / 2;
    shoulderPin.position.y = 1.02;
    armRoot.add(shoulderPin);

    // Articulated upper arm (pivots at shoulder y = 1.02)
    const upperPivot = new THREE.Group();
    upperPivot.position.set(0, 1.02, 0);
    armRoot.add(upperPivot);

    const upperLen = 1.32;
    const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(upperLen, 0.22, 0.24), steelMat);
    upperBeam.position.set(-side * (upperLen * 0.42), upperLen * 0.38, 0);
    upperBeam.rotation.z = side * 0.72;
    upperBeam.castShadow = true;
    upperPivot.add(upperBeam);

    // Hydraulic ram on upper arm
    const ram1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 16), rodMat);
    ram1.position.set(-side * 0.22, 0.25, 0);
    ram1.rotation.z = side * 0.55;
    upperPivot.add(ram1);

    // Elbow joint & forearm pivot
    const elbowPos = new THREE.Vector3(-side * 0.92, 0.88, 0);
    const elbowPin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 24), jointMat);
    elbowPin.rotation.x = Math.PI / 2;
    elbowPin.position.copy(elbowPos);
    upperPivot.add(elbowPin);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.copy(elbowPos);
    upperPivot.add(forearmPivot);

    const foreLen = 1.28;
    const foreBeam = new THREE.Mesh(new THREE.BoxGeometry(foreLen, 0.16, 0.2), steelMat);
    foreBeam.position.set(-side * (foreLen * 0.42), -foreLen * 0.34, 0);
    foreBeam.rotation.z = -side * 0.68;
    foreBeam.castShadow = true;
    forearmPivot.add(foreBeam);

    // Wrist & 3-finger QD collar gripper
    const wristPos = new THREE.Vector3(-side * 0.98, -0.82, 0);
    const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 24), jointMat);
    palm.rotation.z = Math.PI / 2;
    palm.position.copy(wristPos);
    forearmPivot.add(palm);

    for (let k = 0; k < 3; k++) {
      const ang = ((90 + 120 * k) * Math.PI) / 180;
      const fy = Math.sin(ang) * 0.095;
      const fz = Math.cos(ang) * 0.095;
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.032, 0.048), steelMat);
      finger.position.set(wristPos.x - side * 0.12, wristPos.y + fy, wristPos.z + fz);
      forearmPivot.add(finger);
    }

    armPivots.push({ side, upper: upperPivot, forearm: forearmPivot });
  }

  return { group, armPivots };
}

export function startLunar(canvas: HTMLCanvasElement): () => void {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x020305, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.68;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.35, 65000);

  // Grazing Lunar South Pole illumination + subtle cool blue Earthshine fill
  scene.add(new THREE.HemisphereLight(0x6e82a0, 0x090a0d, 0.16));
  scene.add(new THREE.AmbientLight(0x14161c, 0.06));
  const earthShine = new THREE.DirectionalLight(0x5278b8, 0.22);
  earthShine.position.set(-320, 95, -240);
  scene.add(earthShine);

  const sun = new THREE.DirectionalLight(0xfff5e8, 2.85);
  sun.position.set(420, 52, 160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const color = new THREE.Color();

  /**
   * Single unified, seamless, adaptive-resolution polar mesh of Shackleton Crater
   * and the Lunar South Pole (radius 36 km).
   * - Concentrates ~2.8 m radial × ~8.8 m tangential resolution along the rim crest,
   *   domes, and landing pads while spanning the 4.2 km deep crater bowl and 36 km horizon.
   * - Uses counter-clockwise (+Y upward) winding (a, c, b) and analytic central-difference
   *   normals so there are zero seams, zero overlapping meshes, and zero backface culling bugs.
   */
  function buildLunarSurface(maxRadius: number, rings: number, segTheta: number) {
    const vertsPerRing = segTheta + 1;
    const count = (rings + 1) * vertsPerRing;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const indices: number[] = [];

    const corridorS = 0.62;
    const corridorTheta = 0.14;
    const remTheta = Math.PI - corridorTheta;
    const baseSlope = (corridorTheta / corridorS) * (1 - corridorS);

    for (let rIdx = 0; rIdx <= rings; rIdx++) {
      const v = rIdx / rings;
      let rho: number;
      if (v < 0.12) {
        // Crater floor (0 -> 3,990 m)
        rho = (v / 0.12) * (SHACKLETON_R * 0.38);
      } else if (v < 0.3) {
        // Inner terraced crater wall (3,990 -> 10,320 m)
        const t = (v - 0.12) / 0.18;
        rho = SHACKLETON_R * 0.38 + (1 - (1 - t) ** 1.6) * (10_320 - SHACKLETON_R * 0.38);
      } else if (v < 0.72) {
        // High-density rim crest, habitat domes & landing pads band (10,320 -> 10,820 m, ~2.8 m step)
        const t = (v - 0.3) / 0.42;
        rho = 10_320 + t * 500;
      } else if (v < 0.86) {
        // Near outer rim & hero craters (10,820 -> 12,200 m)
        const t = (v - 0.72) / 0.14;
        rho = 10_820 + t * 1_380;
      } else {
        // Outer ejecta blanket & South Pole massifs out to horizon (12,200 -> 36,000 m)
        const t = (v - 0.86) / 0.14;
        rho = 12_200 + t * t * (maxRadius - 12_200);
      }

      for (let tIdx = 0; tIdx <= segTheta; tIdx++) {
        const u = tIdx / segTheta;
        const s = u * 2 - 1;
        let theta: number;
        if (Math.abs(s) <= corridorS) {
          theta = (s / corridorS) * corridorTheta;
        } else {
          const t = (Math.abs(s) - corridorS) / (1 - corridorS);
          theta =
            Math.sign(s) *
            (corridorTheta + baseSlope * t + (remTheta - baseSlope) * t * t * (2 - t));
        }

        const x = Math.sin(theta) * rho;
        const z = -SHACKLETON_R + Math.cos(theta) * rho;
        let y = terrainHeight(x, z);
        // Depress ground mesh inside Shackleton Garage pad so the central 3.2 m subterranean elevator shaft is open
        const garagePad = PADS[0]!;
        if (Math.hypot(x - garagePad.x, z - garagePad.z) < 6.8) {
          y = garagePad.h - 4.8;
        }

        const i = rIdx * vertsPerRing + tIdx;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // High-frequency world-space regolith UVs (~7.1 m per 1024x1024 tile = 7 mm/texel)
        uvs[i * 2] = x * 0.14;
        uvs[i * 2 + 1] = z * 0.14;

        const [nx, ny, nz] = terrainNormal(x, z);
        normals[i * 3] = nx;
        normals[i * 3 + 1] = ny;
        normals[i * 3 + 2] = nz;

        // Grazing-sun lunar self-shadowing + crater depth AO (prevents washed-out distant craters)
        // Sun direction ~ normalize(420, 52, 160) = (0.928, 0.115, 0.354)
        const sunDot = nx * 0.928 + ny * 0.115 + nz * 0.354;
        // Smooth shadow transition across grazing sun angle (sunDot ~ 0.115 on flat ground)
        const shadowTerm = Math.max(0, Math.min(1, (sunDot + 0.03) / 0.24));
        const smoothShadow = shadowTerm * shadowTerm * (3 - 2 * shadowTerm);
        const sunHighlight = Math.max(0, sunDot - 0.12) * 0.65;

        // Permanent Shadow Region (PSR) darkening deep inside Shackleton Crater
        const depthT = Math.max(0, Math.min(1, (y + 4200) / 4350));
        const psrFactor = 0.18 + 0.82 * (depthT * depthT * (3 - 2 * depthT));

        // Authentic Apollo basalt/anorthosite charcoal-silver albedo (never blown-out white)
        const albedo = (0.09 + 0.36 * smoothShadow + sunHighlight) * psrFactor;
        color.setRGB(albedo, albedo * 0.98, albedo * 0.94);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }

    for (let rIdx = 0; rIdx < rings; rIdx++) {
      for (let tIdx = 0; tIdx < segTheta; tIdx++) {
        const a = rIdx * vertsPerRing + tIdx;
        const b = a + 1;
        const c = (rIdx + 1) * vertsPerRing + tIdx;
        const d = c + 1;
        // Counter-clockwise winding when viewed from +Y: (c - a) x (b - a) = +Y
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  const regolithTex = buildRegolithTexture(renderer.capabilities.getMaxAnisotropy());

  const groundGeo = buildLunarSurface(36000, 420, 520);
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: regolithTex,
    bumpMap: regolithTex,
    bumpScale: 0.88,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x58554e,
    roughness: 0.9,
    metalness: 0.05,
    bumpMap: regolithTex,
    bumpScale: 0.22,
    envMapIntensity: 0.08,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS.length);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const dummy = new THREE.Object3D();
  ROCKS.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.ry, r.ry * 0.7, r.ry * 0.3);
    dummy.scale.set(r.s * 1.15, r.s * 0.78, r.s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  scene.add(rocks);

  // Near-field modulo-wrapped 3D lunar cobble ring (480 stones within ±70 m of the Roadster)
  // so 3D stones whip past the wheels and low chase camera anywhere on the Moon
  const NEAR_COUNT = 480;
  const NEAR_SPAN = 140;
  const nearCobbles = new THREE.InstancedMesh(rockGeo, rockMat, NEAR_COUNT);
  nearCobbles.castShadow = true;
  nearCobbles.receiveShadow = true;
  nearCobbles.frustumCulled = false;
  scene.add(nearCobbles);
  const cobbleOffsets = Array.from({ length: NEAR_COUNT }, (_, idx) => {
    const h1 = Math.sin(idx * 127.1 + 19.3) * 43758.5453;
    const h2 = Math.sin(idx * 269.5 + 71.7) * 43758.5453;
    const h3 = Math.sin(idx * 419.2 + 113.1) * 43758.5453;
    const u1 = h1 - Math.floor(h1);
    const u2 = h2 - Math.floor(h2);
    const u3 = h3 - Math.floor(h3);
    return {
      ox: u1 * NEAR_SPAN,
      oz: u2 * NEAR_SPAN,
      s: 0.09 + u3 ** 1.8 * 0.38,
      ry: u1 * Math.PI * 2,
    };
  });

  // Materials for pads, geodesic domes, and articulated Catch Arms
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    roughness: 0.75,
    metalness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.78,
    metalness: 0.2,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe3a14a,
    transparent: true,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xdcd9d2,
    roughness: 0.42,
    metalness: 0.12,
  });
  const domeRibMat = new THREE.MeshStandardMaterial({
    color: 0x8d8f94,
    roughness: 0.4,
    metalness: 0.6,
    wireframe: true,
  });
  const windowMat = new THREE.MeshBasicMaterial({
    color: 0xffcf86,
  });
  const bermMat = new THREE.MeshStandardMaterial({
    color: 0x6f6960,
    roughness: 0.88,
    metalness: 0.06,
  });
  const airlockMat = new THREE.MeshStandardMaterial({
    color: 0xc8c2b6,
    roughness: 0.38,
    metalness: 0.4,
  });
  const armSteelMat = new THREE.MeshStandardMaterial({
    color: 0x92969e,
    roughness: 0.32,
    metalness: 0.84,
  });
  const armJointMat = new THREE.MeshStandardMaterial({
    color: 0x2c3038,
    roughness: 0.45,
    metalness: 0.75,
  });
  const armRodMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce2,
    roughness: 0.15,
    metalness: 0.92,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xe3a14a,
    roughness: 0.4,
    metalness: 0.2,
  });
  const siloWallMat = new THREE.MeshStandardMaterial({
    color: 0x181c22,
    roughness: 0.52,
    metalness: 0.72,
    side: THREE.DoubleSide,
  });

  // Subterranean Garage Elevator references at PADS[0] (Shackleton Garage)
  const elevatorPlatform = new THREE.Group();
  const hatchPivotL = new THREE.Group();
  const hatchPivotR = new THREE.Group();
  const siloLight = new THREE.PointLight(0x6ce2ff, 8, 14);

  const padArmsList: {
    padX: number;
    padY: number;
    padZ: number;
    armPivots: { side: number; upper: THREE.Group; forearm: THREE.Group }[];
  }[] = [];

  for (const p of PADS) {
    if (p.id === "garage") {
      // Shackleton Garage (PADS[0]): Annular pad deck with central 3.2 m radius subterranean elevator shaft
      const shaftR = 3.2;
      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 1.01, p.r * 1.12, 0.36, 64, 1, true),
        plinthMat,
      );
      outerWall.position.set(p.x, p.h - 0.16, p.z);
      scene.add(outerWall);

      const annularDeck = new THREE.Mesh(
        new THREE.RingGeometry(shaftR, p.r * 1.01, 64),
        padMat,
      );
      annularDeck.rotation.x = -Math.PI / 2;
      annularDeck.position.set(p.x, p.h + 0.018, p.z);
      annularDeck.receiveShadow = true;
      scene.add(annularDeck);

      // Subterranean Silo Group (4.4 m deep underground bay)
      const siloGroup = new THREE.Group();
      siloGroup.position.set(p.x, p.h, p.z);
      scene.add(siloGroup);

      const shaftWall = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftR, shaftR, 4.4, 48, 1, true),
        siloWallMat,
      );
      shaftWall.position.y = -2.2;
      siloGroup.add(shaftWall);

      const shaftFloor = new THREE.Mesh(
        new THREE.CircleGeometry(shaftR, 48),
        padMat,
      );
      shaftFloor.rotation.x = -Math.PI / 2;
      shaftFloor.position.y = -4.4;
      siloGroup.add(shaftFloor);

      // Subterranean LED light rings & vertical guide rails inside the shaft
      for (const ly of [-0.9, -2.1, -3.3] as const) {
        const ledRing = new THREE.Mesh(
          new THREE.CylinderGeometry(shaftR - 0.03, shaftR - 0.03, 0.09, 48, 1, true),
          ly === -0.9 ? ringMat : windowMat,
        );
        ledRing.position.y = ly;
        siloGroup.add(ledRing);
      }
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 4.3, 0.14),
            armSteelMat,
          );
          rail.position.set(sx * 2.75, -2.15, sz * 1.35);
          siloGroup.add(rail);
        }
      }

      siloLight.position.set(0, -1.5, 0);
      siloGroup.add(siloLight);

      // Biparting Subterranean Blast Hatch Doors (swing open during the 4-second underground ascent)
      hatchPivotL.position.set(-shaftR, 0.02, 0);
      hatchPivotR.position.set(shaftR, 0.02, 0);
      siloGroup.add(hatchPivotL, hatchPivotR);

      const hatchLeafGeo = new THREE.BoxGeometry(shaftR * 0.96, 0.06, shaftR * 1.65);
      const leafL = new THREE.Mesh(hatchLeafGeo, armJointMat);
      leafL.position.set(shaftR * 0.48, 0, 0);
      hatchPivotL.add(leafL);

      const leafR = new THREE.Mesh(hatchLeafGeo, armJointMat);
      leafR.position.set(-shaftR * 0.48, 0, 0);
      hatchPivotR.add(leafR);

      // Hydraulic Elevator Platform + Telescoping Chrome Ram Piston
      siloGroup.add(elevatorPlatform);
      const platDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftR - 0.05, shaftR - 0.08, 0.22, 48),
        padMat,
      );
      platDisc.receiveShadow = true;
      elevatorPlatform.add(platDisc);

      const platRing = new THREE.Mesh(
        new THREE.RingGeometry(shaftR - 0.34, shaftR - 0.12, 48),
        ringMat,
      );
      platRing.rotation.x = -Math.PI / 2;
      platRing.position.y = 0.115;
      elevatorPlatform.add(platRing);

      // Twin wheel guide runners on the elevator platform
      for (const side of [-1, 1] as const) {
        const trackBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.03, 4.2),
          armSteelMat,
        );
        trackBar.position.set(side * 0.78, 0.12, 0);
        elevatorPlatform.add(trackBar);
      }

      // Central telescoping chrome hydraulic piston beneath the platform
      const piston = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.52, 4.2, 24),
        armRodMat,
      );
      piston.position.y = -2.2;
      elevatorPlatform.add(piston);
    } else {
      // Standard lodge landing pads
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 1.01, p.r * 1.12, 0.28, 64),
        plinthMat,
      );
      plinth.position.set(p.x, p.h - 0.125, p.z);
      plinth.receiveShadow = true;
      scene.add(plinth);

      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 64), padMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, p.h + 0.018, p.z);
      disc.receiveShadow = true;
      scene.add(disc);
    }

    const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.91, p.r * 0.96, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.h + 0.022, p.z);
    scene.add(ring);

    const innerRing = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.4, p.r * 0.43, 48), ringMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(p.x, p.h + 0.022, p.z);
    scene.add(innerRing);

    for (let k = 0; k < 4; k++) {
      const ang = Math.PI / 4 + (k * Math.PI) / 2;
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.18), ringMat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = -ang;
      tick.position.set(
        p.x + Math.cos(ang) * (p.r * 0.82),
        p.h + 0.023,
        p.z + Math.sin(ang) * (p.r * 0.82),
      );
      scene.add(tick);
    }

    // Articulated Catch Arms on each pad (matching Catch_wide.png / rc_scene.py)
    const { group: armsGroup, armPivots } = buildPadCatchArms(
      armSteelMat,
      armJointMat,
      armRodMat,
      hazardMat,
    );
    armsGroup.position.set(p.x, p.h, p.z);
    scene.add(armsGroup);
    padArmsList.push({ padX: p.x, padY: p.h, padZ: p.z, armPivots });

    // Geodesic Habitat Dome + Wireframe Ribs (matching Catch_wide.png)
    const domeGeo = new THREE.SphereGeometry(p.domeR, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(p.domeX, p.domeH, p.domeZ);
    dome.castShadow = true;
    dome.receiveShadow = true;
    scene.add(dome);

    const domeRibs = new THREE.Mesh(
      new THREE.SphereGeometry(p.domeR * 1.005, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      domeRibMat,
    );
    domeRibs.position.set(p.domeX, p.domeH, p.domeZ);
    scene.add(domeRibs);

    const viewportRing = new THREE.Mesh(
      new THREE.CylinderGeometry(p.domeR * 0.975, p.domeR * 0.988, 0.38, 32, 1, true),
      windowMat,
    );
    viewportRing.position.set(p.domeX, p.domeH + 1.5, p.domeZ);
    scene.add(viewportRing);

    const berm = new THREE.Mesh(
      new THREE.CylinderGeometry(p.domeR * 1.02, p.domeR * 1.2, 0.65, 48),
      bermMat,
    );
    berm.position.set(p.domeX, p.domeH + 0.12, p.domeZ);
    berm.receiveShadow = true;
    scene.add(berm);

    const dx = p.x - p.domeX;
    const dz = p.z - p.domeZ;
    const len = Math.hypot(dx, dz) || 1;
    const airlock = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.2, 24), airlockMat);
    airlock.rotation.x = Math.PI / 2;
    airlock.rotation.z = -Math.atan2(dx, dz);
    airlock.position.set(
      p.domeX + (dx / len) * (p.domeR + 0.4),
      p.domeH + 1.15,
      p.domeZ + (dz / len) * (p.domeR + 0.4),
    );
    airlock.castShadow = true;
    airlock.receiveShadow = true;
    scene.add(airlock);

    const tag = labelSprite(p.name.toUpperCase());
    tag.position.set(p.domeX, p.domeH + p.domeR + 2.6, p.domeZ);
    tag.scale.set(p.domeR * 2.4, p.domeR * 0.6, 1);
    scene.add(tag);
  }

  // ============================================================================
  // EMPIRE-STATE-BUILDING-SIZED TESLA ORBITAL STATION (443.2 m tall)
  // WITH 4 DOCKED 50 m SPACEX STARSHIPS & ORBITAL ROADSTER CATCH DECK
  // ============================================================================
  const stationSteelMat = new THREE.MeshStandardMaterial({
    color: 0xc8cdd4,
    roughness: 0.22,
    metalness: 0.92,
  });
  const stationDarkTrussMat = new THREE.MeshStandardMaterial({
    color: 0x1e232b,
    roughness: 0.48,
    metalness: 0.78,
  });
  const starshipMirrorMat = new THREE.MeshStandardMaterial({
    color: 0xdde2e8,
    roughness: 0.12,
    metalness: 0.96,
  });
  const starshipTpsMat = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.65,
    metalness: 0.25,
  });
  const solarArrayMat = new THREE.MeshStandardMaterial({
    color: 0x18345c,
    emissive: 0x0a1c36,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.65,
  });
  const teslaRedBeaconMat = new THREE.MeshBasicMaterial({
    color: 0xff2a22,
  });
  const cyanBeaconMat = new THREE.MeshBasicMaterial({
    color: 0x6ce2ff,
    transparent: true,
    opacity: 0.85,
  });

  function buildDockedStarship(): THREE.Group {
    const ship = new THREE.Group();
    // 50 m tall × 9 m diameter Starship (barrel: 32 m, ogive nosecone: 18 m)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 32, 36), starshipMirrorMat);
    barrel.position.y = 16;
    ship.add(barrel);

    // Black TPS heatshield half-shell on the windward side
    const tpsBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(4.54, 4.54, 31.8, 24, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
      starshipTpsMat,
    );
    tpsBarrel.position.y = 16;
    ship.add(tpsBarrel);

    // 18 m Ogive Nosecone
    const nosePoints = [
      new THREE.Vector2(4.5, 0),
      new THREE.Vector2(4.1, 4.5),
      new THREE.Vector2(3.2, 9.5),
      new THREE.Vector2(1.95, 14.0),
      new THREE.Vector2(0.75, 17.0),
      new THREE.Vector2(0.0, 18.0),
    ];
    const noseGeo = new THREE.LatheGeometry(nosePoints, 36);
    const nose = new THREE.Mesh(noseGeo, starshipMirrorMat);
    nose.position.y = 32;
    ship.add(nose);

    // Forward & Aft Aero Flaps
    for (const side of [-1, 1] as const) {
      const aftFlap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 8.5, 0.36), starshipTpsMat);
      aftFlap.position.set(side * 5.8, 5.2, 0);
      aftFlap.rotation.z = -side * 0.14;
      ship.add(aftFlap);

      const fwdFlap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.28), starshipTpsMat);
      fwdFlap.position.set(side * 3.8, 41.5, 0);
      fwdFlap.rotation.z = -side * 0.28;
      ship.add(fwdFlap);
    }

    // Illuminated Starship crew viewport strip
    const crewWin = new THREE.Mesh(
      new THREE.CylinderGeometry(3.32, 3.68, 1.4, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7),
      windowMat,
    );
    crewWin.position.y = 39.5;
    ship.add(crewWin);

    // 6 Raptor Engine Bells (3 center SL + 3 large Vacuum Raptors) inside aft skirt
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      const rVac = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 2.6, 20, 1, true),
        stationDarkTrussMat,
      );
      rVac.position.set(Math.cos(a) * 2.55, -0.8, Math.sin(a) * 2.55);
      ship.add(rVac);

      const rSl = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 1.8, 16, 1, true),
        stationSteelMat,
      );
      rSl.position.set(Math.cos(a + 0.52) * 1.05, -0.5, Math.sin(a + 0.52) * 1.05);
      ship.add(rSl);
    }

    return ship;
  }

  const stationGroup = new THREE.Group();
  stationGroup.position.set(ORBITAL_STATION.x, ORBITAL_STATION.dockY, ORBITAL_STATION.z);
  scene.add(stationGroup);

  // Instant procedural fallback group for the Orbital Station (hidden once /tesla-orbital-station.glb loads)
  const stationFallbackGroup = new THREE.Group();
  stationGroup.add(stationFallbackGroup);

  const dockPlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(
      ORBITAL_STATION.dockR * 1.04,
      ORBITAL_STATION.dockR * 0.72,
      14,
      48,
    ),
    stationDarkTrussMat,
  );
  dockPlinth.position.y = -7.0;
  stationFallbackGroup.add(dockPlinth);

  const dockDisc = new THREE.Mesh(
    new THREE.CircleGeometry(ORBITAL_STATION.dockR, 64),
    padMat,
  );
  dockDisc.rotation.x = -Math.PI / 2;
  dockDisc.position.y = 0.02;
  dockDisc.receiveShadow = true;
  stationFallbackGroup.add(dockDisc);

  const dockOuterRing = new THREE.Mesh(
    new THREE.RingGeometry(ORBITAL_STATION.dockR * 0.92, ORBITAL_STATION.dockR * 0.98, 64),
    cyanBeaconMat,
  );
  dockOuterRing.rotation.x = -Math.PI / 2;
  dockOuterRing.position.y = 0.04;
  stationGroup.add(dockOuterRing);

  const dockInnerRing = new THREE.Mesh(
    new THREE.RingGeometry(6.8, 7.4, 48),
    ringMat,
  );
  dockInnerRing.rotation.x = -Math.PI / 2;
  dockInnerRing.position.y = 0.04;
  stationFallbackGroup.add(dockInnerRing);

  const { group: stationCatchArms, armPivots: stationArmPivots } = buildPadCatchArms(
    armSteelMat,
    armJointMat,
    armRodMat,
    hazardMat,
  );
  stationFallbackGroup.add(stationCatchArms);
  padArmsList.push({
    padX: ORBITAL_STATION.x,
    padY: ORBITAL_STATION.dockY,
    padZ: ORBITAL_STATION.z,
    armPivots: stationArmPivots,
  });

  const lowerKeel = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 4, 18, 8),
    stationSteelMat,
  );
  lowerKeel.position.y = -23;
  stationFallbackGroup.add(lowerKeel);

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 34, 4.2),
        stationDarkTrussMat,
      );
      col.position.set(sx * 19, 17, sz * 19);
      stationFallbackGroup.add(col);
    }
  }

  const esbTiers: { y0: number; h: number; w: number; d: number }[] = [
    { y0: 34, h: 52, w: 68, d: 46 },
    { y0: 86, h: 44, w: 54, d: 38 },
    { y0: 130, h: 145, w: 38, d: 30 },
    { y0: 275, h: 42, w: 28, d: 23 },
    { y0: 317, h: 24, w: 19, d: 17 },
  ];

  for (const tier of esbTiers) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w, tier.h, tier.d),
      stationSteelMat,
    );
    body.position.y = tier.y0 + tier.h / 2;
    stationFallbackGroup.add(body);

    const flute = new THREE.Mesh(
      new THREE.BoxGeometry(tier.w * 1.015, tier.h * 0.92, tier.d * 0.62),
      stationDarkTrussMat,
    );
    flute.position.y = tier.y0 + tier.h / 2;
    stationFallbackGroup.add(flute);

    for (let b = 0; b < 3; b++) {
      const wy = tier.y0 + tier.h * (0.22 + b * 0.28);
      const winBand = new THREE.Mesh(
        new THREE.BoxGeometry(tier.w * 1.02, 1.8, tier.d * 1.02),
        windowMat,
      );
      winBand.position.y = wy;
      stationFallbackGroup.add(winBand);
    }
  }

  const teslaCrownRing = new THREE.Mesh(
    new THREE.BoxGeometry(21.5, 2.6, 19.5),
    teslaRedBeaconMat,
  );
  teslaCrownRing.position.y = 338;
  stationFallbackGroup.add(teslaCrownRing);

  const teslaBaseBeacon = new THREE.Mesh(
    new THREE.BoxGeometry(70, 2.2, 48),
    teslaRedBeaconMat,
  );
  teslaBaseBeacon.position.y = 35.5;
  stationFallbackGroup.add(teslaBaseBeacon);

  const mooringMast = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 8.2, 32, 16),
    stationSteelMat,
  );
  mooringMast.position.y = 357;
  stationFallbackGroup.add(mooringMast);

  const spireShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 3.2, 38.2, 12),
    stationSteelMat,
  );
  spireShaft.position.y = 392.1;
  stationFallbackGroup.add(spireShaft);

  const spireTipBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 16, 16),
    teslaRedBeaconMat,
  );
  spireTipBeacon.position.y = 411.2;
  stationFallbackGroup.add(spireTipBeacon);

  const gravityRingA = new THREE.Group();
  gravityRingA.position.y = 175;
  stationFallbackGroup.add(gravityRingA);
  gravityRingA.add(
    new THREE.Mesh(new THREE.TorusGeometry(68, 3.6, 16, 64), stationSteelMat),
  );
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 134, 12),
      stationDarkTrussMat,
    );
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (k * Math.PI) / 2;
    gravityRingA.add(spoke);
  }

  const gravityRingB = new THREE.Group();
  gravityRingB.position.y = 235;
  stationFallbackGroup.add(gravityRingB);
  gravityRingB.add(
    new THREE.Mesh(new THREE.TorusGeometry(50, 2.8, 16, 56), stationSteelMat),
  );
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 98, 12),
      stationDarkTrussMat,
    );
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (k * Math.PI) / 2;
    gravityRingB.add(spoke);
  }

  for (const side of [-1, 1] as const) {
    for (const wy of [115, 292] as const) {
      const wingBoom = new THREE.Mesh(
        new THREE.BoxGeometry(145, 1.4, 1.4),
        stationDarkTrussMat,
      );
      wingBoom.position.set(side * 96, wy, 0);
      stationFallbackGroup.add(wingBoom);

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(125, 0.35, 18),
        solarArrayMat,
      );
      panel.position.set(side * 98, wy, 0);
      panel.rotation.x = 0.35;
      stationFallbackGroup.add(panel);
    }
  }

  const dockedStarshipsFallback = new THREE.Group();
  stationGroup.add(dockedStarshipsFallback);
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2;
    const dockRadius = 56.1;
    const starship = buildDockedStarship();
    starship.position.set(
      Math.cos(ang) * dockRadius,
      -32,
      Math.sin(ang) * dockRadius,
    );
    starship.rotation.y = -ang + Math.PI / 2;
    dockedStarshipsFallback.add(starship);
  }

  const stationLabel = labelSprite(
    "TESLA ORBITAL · 443.2M · 4 STARSHIPS",
    "#6ce2ff",
  );
  stationLabel.material.depthTest = true;
  stationLabel.position.set(0, 29, 25);
  stationLabel.scale.set(28, 7, 1);
  stationGroup.add(stationLabel);

  // South Pole HLS Surface Starship Landing Pad (50 m Starship standing near the Shackleton Garage)
  const hlsPlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(SURFACE_STARSHIP.r * 1.02, SURFACE_STARSHIP.r * 1.15, 0.36, 64),
    plinthMat,
  );
  hlsPlinth.position.set(SURFACE_STARSHIP.x, SURFACE_STARSHIP.h - 0.16, SURFACE_STARSHIP.z);
  hlsPlinth.receiveShadow = true;
  scene.add(hlsPlinth);

  const hlsDisc = new THREE.Mesh(new THREE.CircleGeometry(SURFACE_STARSHIP.r, 64), padMat);
  hlsDisc.rotation.x = -Math.PI / 2;
  hlsDisc.position.set(SURFACE_STARSHIP.x, SURFACE_STARSHIP.h + 0.025, SURFACE_STARSHIP.z);
  hlsDisc.receiveShadow = true;
  scene.add(hlsDisc);

  const hlsRing = new THREE.Mesh(
    new THREE.RingGeometry(SURFACE_STARSHIP.r * 0.91, SURFACE_STARSHIP.r * 0.96, 64),
    ringMat,
  );
  hlsRing.rotation.x = -Math.PI / 2;
  hlsRing.position.set(SURFACE_STARSHIP.x, SURFACE_STARSHIP.h + 0.03, SURFACE_STARSHIP.z);
  scene.add(hlsRing);

  const surfaceStarshipGroup = new THREE.Group();
  surfaceStarshipGroup.position.set(
    SURFACE_STARSHIP.x,
    SURFACE_STARSHIP.h + 2.55,
    SURFACE_STARSHIP.z,
  );
  surfaceStarshipGroup.rotation.y = -0.65;
  scene.add(surfaceStarshipGroup);
  const surfaceStarshipFallback = buildDockedStarship();
  surfaceStarshipGroup.add(surfaceStarshipFallback);

  const hlsLabel = labelSprite("STARSHIP HLS · 50M", "#e3a14a");
  hlsLabel.position.set(SURFACE_STARSHIP.x, SURFACE_STARSHIP.h + 55, SURFACE_STARSHIP.z);
  hlsLabel.scale.set(24, 6, 1);
  scene.add(hlsLabel);

  // 310 m Lunar Electromagnetic Mass-Driver Track Corridor (x = -26, z = +85 .. -225)
  const massDriverGroup = new THREE.Group();
  scene.add(massDriverGroup);

  const massDriverLabel = labelSprite("MASS-DRIVER · 310M · 3G", "#e3a14a");
  massDriverLabel.position.set(
    MASS_DRIVER_TRACK.x,
    MASS_DRIVER_TRACK.h + 7.2,
    MASS_DRIVER_TRACK.startZ - 8,
  );
  massDriverLabel.scale.set(22, 5.5, 1);
  scene.add(massDriverLabel);

  // 6) 3D Orbital Ascent Skyway Rings leading from the Shackleton rim up to the Tesla Orbital Station
  const gateRings: THREE.Mesh[] = [];
  const gateGeo = new THREE.TorusGeometry(18, 0.45, 12, 48);
  for (const g of APPROACH_GATES) {
    const gate = new THREE.Mesh(gateGeo, cyanBeaconMat);
    gate.position.set(g.x, g.y, g.z);
    gate.rotation.x = g.pitch;
    scene.add(gate);
    gateRings.push(gate);
  }

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.72 + 0.12);
    const r = 48000;
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph);
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xe7e2d6, size: 1.0, sizeAttenuation: true }),
    ),
  );

  // Earth low on the horizon
  const earthDist = 42000;
  const earthElev = (4.5 * Math.PI) / 180;
  const earthAz = 1.15;
  const earthR = earthDist * Math.tan(((1.9 / 2) * Math.PI) / 180);
  const earth = new THREE.Group();
  earth.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(earthR, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x3d7eb5 }),
    ),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(earthR * 1.03, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xd5e4ee, transparent: true, opacity: 0.38 }),
  );
  earth.add(clouds);
  earth.position.set(
    earthDist * Math.cos(earthElev) * Math.sin(earthAz),
    earthDist * Math.sin(earthElev),
    earthDist * Math.cos(earthElev) * Math.cos(earthAz),
  );
  scene.add(earth);

  // ============================================================================
  // ALL 3 1:1 ROADSTER MODELS + STARMAN IVA SUIT:
  // 1) /roadster.glb (Standard Wing · 15 km)
  // 2) /roadster-catch.glb (Catch · 200 km with 8-sided LCH4/LOX jacket tanks, gold MLI & lit gauges)
  // 3) /roadster-railgun.glb (Railgun · 250 km with Sled_Plate & Hardpoint_L/R pins)
  // 4) /starman.glb (Rigged Starman IVA spacesuit seated at the steering yoke)
  // ============================================================================
  const car = new THREE.Group();
  car.rotation.order = "YXZ";
  scene.add(car);

  const chassis = new THREE.Group();
  car.add(chassis);

  const fallbackGroup = new THREE.Group();
  const fbHull = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.44, 4.4),
    new THREE.MeshStandardMaterial({ color: 0xa9abb0, metalness: 0.75, roughness: 0.25 }),
  );
  fbHull.position.set(0, 0.46, 0);
  fbHull.castShadow = true;
  fallbackGroup.add(fbHull);
  chassis.add(fallbackGroup);

  const headLightL = new THREE.SpotLight(0xf2f7ff, 18, 95, 0.52, 0.65, 1.3);
  headLightL.position.set(-0.62, 0.52, -2.05);
  headLightL.target.position.set(-0.7, 0.1, -24);
  chassis.add(headLightL, headLightL.target);

  const headLightR = new THREE.SpotLight(0xf2f7ff, 18, 95, 0.52, 0.65, 1.3);
  headLightR.position.set(0.62, 0.52, -2.05);
  headLightR.target.position.set(0.7, 0.1, -24);
  chassis.add(headLightR, headLightR.target);

  const tailGlowLight = new THREE.PointLight(0xe0362c, 1.8, 8);
  tailGlowLight.position.set(0, 0.68, 2.35);
  chassis.add(tailGlowLight);

  const bellWarmLight = new THREE.PointLight(0xff4a1c, 1.4, 3.5);
  bellWarmLight.position.set(0, 0.18, 1.63);
  chassis.add(bellWarmLight);

  const cabinWarmLight = new THREE.PointLight(0xffb46b, 0, 3.2);
  cabinWarmLight.position.set(0, 0.88, 0.05);
  chassis.add(cabinWarmLight);

  const rearLocals: [number, number, number][] = [
    [-0.36, 0.44, 2.22],
    [-0.12, 0.44, 2.22],
    [0.12, 0.44, 2.22],
    [0.36, 0.44, 2.22],
  ];
  const downLocals: [number, number, number][] = [
    [-0.78, 0.16, -0.82],
    [0.78, 0.16, -0.82],
    [-0.82, 0.16, 1.62],
    [0.82, 0.16, 1.62],
  ];

  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xd8f0ff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const methaloxMat = new THREE.MeshBasicMaterial({
    color: 0x6cb8ff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const rearCones: THREE.Mesh[] = [];
  const rearConeGeo = new THREE.ConeGeometry(0.09, 1.35, 12, 1, true);
  rearConeGeo.translate(0, -0.67, 0);
  rearConeGeo.rotateX(-Math.PI / 2);
  for (const [lx, ly, lz] of rearLocals) {
    const m = new THREE.Mesh(rearConeGeo, shockMat);
    m.position.set(lx, ly, lz);
    m.visible = false;
    chassis.add(m);
    rearCones.push(m);
  }

  const downCones: THREE.Mesh[] = [];
  const downConeGeo = new THREE.ConeGeometry(0.11, 1.1, 12, 1, true);
  downConeGeo.translate(0, -0.55, 0);
  for (const [lx, ly, lz] of downLocals) {
    const m = new THREE.Mesh(downConeGeo, shockMat);
    m.position.set(lx, ly, lz);
    m.visible = false;
    chassis.add(m);
    downCones.push(m);
  }

  // Central under-tail CH4/LOX Bell Mach-diamond plume (at BELL_X = 3.83 -> z = +1.63 in car frame)
  const bellConeGeo = new THREE.ConeGeometry(0.18, 2.2, 16, 1, true);
  bellConeGeo.translate(0, -1.1, 0);
  const bellCone = new THREE.Mesh(bellConeGeo, methaloxMat);
  bellCone.position.set(0, 0.12, 1.63);
  bellCone.visible = false;
  chassis.add(bellCone);

  const bundles: Partial<Record<CarVariantId, LoadedCarBundle>> = {};
  const loadingVariants = new Set<CarVariantId>();

  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);

  // Dynamic glTF references for Orbital Station, Mass-Driver Track, and Starman
  let glbGravityRingLower: THREE.Object3D | null = null;
  let glbGravityRingUpper: THREE.Object3D | null = null;
  let glbStationCatchArmL: THREE.Object3D | null = null;
  let glbStationCatchArmR: THREE.Object3D | null = null;
  let glbLaunchSled: THREE.Object3D | null = null;
  let glbTrackCatchArmL: THREE.Object3D | null = null;
  let glbTrackCatchArmR: THREE.Object3D | null = null;
  let starmanRoot: THREE.Object3D | null = null;
  let starmanHead: THREE.Object3D | null = null;
  let starmanSpine: THREE.Object3D | null = null;
  let secondaryAssetsStarted = false;

  function loadSecondaryWorldAssets() {
    if (secondaryAssetsStarted) return;
    secondaryAssetsStarted = true;

    // Preload the other two Roadster variants
    for (const vid of ["condo", "lr200", "railgun"] as const) {
      if (vid !== sim.variant) loadVariantModel(vid);
    }

    // Load 1:1 Lunar Mass-Driver Track (/lunar-mass-driver.glb) -> 5 × 50 m segments + 60 m Brake Terminal + movable Launch Sled
    loader.load(
      "/lunar-mass-driver.glb",
      (gltf) => {
        if (!alive) return;
        const root = gltf.scene;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        const segTemplate = root.getObjectByName("Track_Segment_50m");
        const brakeTerm = root.getObjectByName("Track_Brake_Terminal");
        const sled = root.getObjectByName("Launch_Sled");

        const railY = MASS_DRIVER_TRACK.h + 0.18;
        if (segTemplate) {
          for (let i = 0; i < MASS_DRIVER_TRACK.segments; i++) {
            const seg = segTemplate.clone(true);
            seg.position.set(
              MASS_DRIVER_TRACK.x,
              railY,
              MASS_DRIVER_TRACK.startZ - i * MASS_DRIVER_TRACK.segmentLengthM,
            );
            massDriverGroup.add(seg);
          }
        }
        if (brakeTerm) {
          const term = brakeTerm.clone(true);
          term.position.set(
            MASS_DRIVER_TRACK.x,
            railY,
            MASS_DRIVER_TRACK.terminalStartZ,
          );
          term.traverse((o) => {
            if (o.name === "CatchArm_L") glbTrackCatchArmL = o;
            if (o.name === "CatchArm_R") glbTrackCatchArmR = o;
          });
          massDriverGroup.add(term);
        }
        if (sled) {
          const sledObj = sled.clone(true);
          sledObj.position.set(MASS_DRIVER_TRACK.x, railY + 0.04, sim.sledZ);
          massDriverGroup.add(sledObj);
          glbLaunchSled = sledObj;
        }
      },
      undefined,
      (err) => console.error("Could not load /lunar-mass-driver.glb:", err),
    );

    // Load 1:1 SpaceX Starship (/starship.glb, 50 m × 9 m) -> 4 docked at Orbital Station + 1 landed at South Pole HLS pad
    loader.load(
      "/starship.glb",
      (gltf) => {
        if (!alive) return;
        const baseShip = gltf.scene;
        baseShip.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        const dockConfigs: { x: number; y: number; z: number; ry: number }[] = [
          { x: 0, y: -32, z: -56.1, ry: Math.PI }, // DockPort_N
          { x: 0, y: -32, z: 56.1, ry: 0 }, // DockPort_S
          { x: 56.1, y: -32, z: 0, ry: Math.PI / 2 }, // DockPort_E
          { x: -56.1, y: -32, z: 0, ry: -Math.PI / 2 }, // DockPort_W
        ];
        for (const cfg of dockConfigs) {
          const clone = baseShip.clone(true);
          clone.position.set(cfg.x, cfg.y, cfg.z);
          clone.rotation.y = cfg.ry;
          stationGroup.add(clone);
        }
        dockedStarshipsFallback.visible = false;

        // 5th Starship landed vertically on the Lunar South Pole HLS Pad
        const landedShip = baseShip.clone(true);
        surfaceStarshipGroup.add(landedShip);
        surfaceStarshipFallback.visible = false;
      },
      undefined,
      (err) => console.error("Could not load /starship.glb:", err),
    );

    // Load 1:1 Tesla Orbital Station (/tesla-orbital-station.glb, 443.2 m tall)
    loader.load(
      "/tesla-orbital-station.glb",
      (gltf) => {
        if (!alive) return;
        const stScene = gltf.scene;
        stScene.traverse((o) => {
          if (o.name === "GravityRing_Lower") glbGravityRingLower = o;
          if (o.name === "GravityRing_Upper") glbGravityRingUpper = o;
          if (o.name === "Station_CatchArm_L") glbStationCatchArmL = o;
          if (o.name === "Station_CatchArm_R") glbStationCatchArmR = o;
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.receiveShadow = true;
          }
        });
        stationGroup.add(stScene);
        stationFallbackGroup.visible = false;
      },
      undefined,
      (err) => console.error("Could not load /tesla-orbital-station.glb:", err),
    );
  }

  // Load 1:1 Starman IVA Spacesuit Driver (/starman.glb) into the Roadster cabin immediately
  loader.load(
    "/starman.glb",
    (gltf) => {
      if (!alive) return;
      const sm = gltf.scene;
      sm.rotation.y = Math.PI / 2;
      sm.traverse((o) => {
        if (o.name.endsWith("_Ref")) {
          o.visible = false;
        }
        if (o.name === "Head") starmanHead = o;
        if (o.name === "Spine") starmanSpine = o;
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      starmanRoot = sm;
      chassis.add(sm);
    },
    undefined,
    (err) => console.error("Could not load /starman.glb:", err),
  );

  function loadVariantModel(variantId: CarVariantId) {
    if (bundles[variantId] || loadingVariants.has(variantId)) return;
    loadingVariants.add(variantId);
    const url = CAR_VARIANTS[variantId].glbUrl;
    loader.load(
      url,
      (gltf) => {
        if (!alive) return;
        const model = gltf.scene;
        model.rotation.y = Math.PI / 2;
        const nodes: Record<string, THREE.Object3D> = {};
        const mats: LoadedCarBundle["mats"] = {};
        model.traverse((o) => {
          if (o.name) nodes[o.name] = o;
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of list) {
              if (m && m.name) {
                mats[m.name] = m as THREE.MeshStandardMaterial;
              }
            }
          }
        });

        const g = mats["RD_glass"];
        if (g) {
          g.transmission = 0;
          g.transparent = true;
          g.opacity = 0.62;
          g.depthWrite = false;
          g.color.set(0x3a2a1e);
          g.roughness = 0.04;
          g.metalness = 0.2;
          g.envMapIntensity = 1.4;
        }
        for (const n of [
          "RD_light_white",
          "RD_light_red",
          "RD_light_amber",
          "RD_gauge_ch4",
          "RD_gauge_lox",
        ]) {
          const m = mats[n];
          if (m) m.userData.base = m.emissiveIntensity || 1;
        }
        if (nodes.WingPivot) {
          nodes.WingPivot.userData.y0 = nodes.WingPivot.position.y;
        }
        for (const t of ["FL", "FR", "RL", "RR"]) {
          const w = nodes["Wheel_" + t];
          if (w) w.rotation.order = "YZX";
        }

        const root = new THREE.Group();
        root.add(model);
        root.visible = sim.variant === variantId;
        chassis.add(root);
        bundles[variantId] = {
          root,
          nodes,
          mats,
          appliedPaintIdx: -1,
        };

        if (sim.variant === variantId) {
          fallbackGroup.visible = false;
          sim.modelLoaded = true;
          sim.modelLoadPct = 100;
          window.__roadster = {
            nodes: Object.keys(nodes).length,
            mats: Object.keys(mats),
          };
        }
        loadSecondaryWorldAssets();
      },
      (e) => {
        if (e.total && sim.variant === variantId) {
          sim.modelLoadPct = Math.round((100 * e.loaded) / e.total);
        }
      },
      (err) => {
        console.error(`Could not load ${url}:`, err);
        loadSecondaryWorldAssets();
      },
    );
  }

  // Load the active hero Roadster first so it decodes immediately without Draco queue contention
  loadVariantModel(sim.variant);

  // Cryo-nitrogen / Methalox, wheel roostertail & orbital speed-mote particle system
  const plumeGeo = new THREE.BufferGeometry();
  const POOL = 900;
  const plumePos = new Float32Array(POOL * 3);
  const plumeCol = new Float32Array(POOL * 3);
  plumeGeo.setAttribute("position", new THREE.BufferAttribute(plumePos, 3));
  plumeGeo.setAttribute("color", new THREE.BufferAttribute(plumeCol, 3));
  const plume = new THREE.Points(
    plumeGeo,
    new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.42,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(plume);
  const particles: Particle[] = Array.from({ length: POOL }, () => ({
    life: 0,
    maxLife: 0.5,
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  let pCursor = 0;

  const thrusterLight = new THREE.PointLight(0x88c8ff, 0, 26);
  chassis.add(thrusterLight);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const small = w < 760;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  window.__controlsTest = {
    getYaw: () => sim.yaw,
    getSpeed: () => sim.speed,
    setSteer: (v) => {
      input.steerOverride = v;
    },
    setKeys: (codes) => {
      input.injected = codes.length ? codes : null;
    },
  };

  const onKeyDown = (e: KeyboardEvent) => {
    input.keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === "KeyE") sim.toggleDoors();
      if (e.code === "KeyT") sim.toggleFrunk();
      if (e.code === "KeyF") sim.toggleWing();
      if (e.code === "KeyL") sim.toggleLights();
      if (e.code === "KeyC") sim.cycleCamera();
      if (e.code === "KeyV") sim.toggleVariant();
      if (e.code === "KeyO") sim.warpToStationApproach();
      if (e.code === "KeyP") sim.toggleAutopilot();
      if (e.code === "KeyH") sim.toggleHoverHold();
      if (e.code === "KeyG") sim.launchRailgun();
      if (e.code === "KeyI" || e.code === "KeyR") sim.triggerIntro();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    input.keys.delete(e.code);
  };
  const clearKeys = () => input.keys.clear();

  let dragging = false;
  let lastPx = 0;
  let lastPy = 0;
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    lastPx = e.clientX;
    lastPy = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastPx;
    const dy = e.clientY - lastPy;
    lastPx = e.clientX;
    lastPy = e.clientY;
    input.orbitYaw -= dx * 0.007;
    input.orbitPitch = Math.max(0.06, Math.min(1.35, input.orbitPitch + dy * 0.006));
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    if (sim.camMode === "orbit") {
      input.orbitDist = Math.max(3.0, Math.min(18, input.orbitDist + e.deltaY * 0.006));
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);

  const camPos = new THREE.Vector3(0, 2.5, 5.6);
  const prevCarPos = new THREE.Vector3(sim.x, sim.y, sim.z);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let currentFov = 54;
  let last = performance.now();
  let raf = 0;
  let alive = true;
  let wheelSpin = 0;
  let fanSpin = 0;
  let modelWaitTime = 0;

  const wheelLocals: [number, number, number][] = [
    [-0.84, 0.06, -1.35],
    [0.84, 0.06, -1.35],
    [-0.86, 0.06, 1.38],
    [0.86, 0.06, 1.38],
  ];

  function spawn(
    lx: number,
    ly: number,
    lz: number,
    back: number,
    down: number,
    kind: "cryo" | "methalox" | "dust" | "mote",
  ) {
    const c = Math.cos(sim.yaw);
    const s = Math.sin(sim.yaw);
    const p = particles[pCursor]!;
    const idx = pCursor;
    pCursor = (pCursor + 1) % POOL;
    const maxLife = kind === "mote" ? 0.22 + Math.random() * 0.18 : 0.35 + Math.random() * 0.35;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.x = sim.x + lx * c + lz * s;
    p.y = sim.y + sim.elevatorOffset + ly;
    p.z = sim.z - lx * s + lz * c;
    const spread = kind === "dust" ? 3.2 : kind === "mote" ? 0.8 : 1.7;
    const jx = (Math.random() - 0.5) * spread;
    const jz = (Math.random() - 0.5) * spread;
    p.vx = s * back + jx;
    p.vz = c * back + jz;
    p.vy = -down + (Math.random() - 0.35) * 1.4;
    if (kind === "methalox") {
      plumeCol[idx * 3] = 0.48;
      plumeCol[idx * 3 + 1] = 0.78;
      plumeCol[idx * 3 + 2] = 1.0;
    } else if (kind === "cryo") {
      plumeCol[idx * 3] = 0.82;
      plumeCol[idx * 3 + 1] = 0.92;
      plumeCol[idx * 3 + 2] = 1.0;
    } else if (kind === "mote") {
      plumeCol[idx * 3] = 0.72;
      plumeCol[idx * 3 + 1] = 0.88;
      plumeCol[idx * 3 + 2] = 1.0;
    } else {
      plumeCol[idx * 3] = 0.74;
      plumeCol[idx * 3 + 1] = 0.71;
      plumeCol[idx * 3 + 2] = 0.64;
    }
  }

  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Hold the start of the 4-second subterranean elevator ascent briefly (up to 0.75 s) until the active Roadster GLB finishes decoding
    if (!bundles[sim.variant] && modelWaitTime < 0.75) {
      modelWaitTime += dt;
    } else {
      if (input.running) sim.step(dt, readDrive());
      sim.stepAnimations(dt);
    }

    fallbackGroup.visible = !bundles[sim.variant];

    const catchHover = ease(sim.catchBlend) * 0.3;
    car.position.set(sim.x, sim.y + catchHover + sim.elevatorOffset, sim.z);
    car.rotation.y = sim.yaw;
    car.rotation.x = sim.pitch * (1 - ease(sim.catchBlend));
    car.rotation.z = sim.roll * (1 - ease(sim.catchBlend));
    chassis.position.y = sim.suspOffset * (1 - ease(sim.catchBlend));

    // Animate Subterranean Garage Elevator Platform & Biparting Blast Hatch Doors at PADS[0]
    elevatorPlatform.position.y = sim.elevatorOffset - 0.1;
    if (sim.introTimer > 0) {
      const u = 1 - sim.introTimer / sim.introDuration; // 0 -> 1 over 4.0 s
      // Hatch doors open fast (0..0.15), stay open while car clears shaft (0.15..0.85), then fold flush (0.85..1.0)
      const openIn = Math.min(1, u / 0.14);
      const closeOut = Math.max(0, Math.min(1, (1 - u) / 0.14));
      const hatchBlend = ease(Math.min(openIn, closeOut));
      const hatchAngle = hatchBlend * THREE.MathUtils.degToRad(84);
      hatchPivotL.rotation.z = hatchAngle;
      hatchPivotR.rotation.z = -hatchAngle;
      siloLight.intensity = 4 + 8 * Math.sin(u * Math.PI);

      // Vent cold-gas depressurization mist upward from the subterranean elevator shaft rim
      if (u > 0.04 && u < 0.88 && Math.random() < 0.75) {
        const ang = Math.random() * Math.PI * 2;
        const rimR = 2.6 + Math.random() * 0.5;
        spawn(
          Math.cos(ang) * rimR,
          0.08 - sim.elevatorOffset,
          Math.sin(ang) * rimR,
          0,
          -(2.8 + Math.random() * 2.2),
          "cryo",
        );
      }
    } else {
      hatchPivotL.rotation.z = 0;
      hatchPivotR.rotation.z = 0;
      siloLight.intensity = 2.0;
    }

    // Rotate the Tesla Orbital Station centrifuge gravity rings & pulse orbital approach gates
    gravityRingA.rotation.y += dt * 0.18;
    gravityRingB.rotation.y -= dt * 0.24;
    if (glbGravityRingLower) glbGravityRingLower.rotation.y += dt * 0.18;
    if (glbGravityRingUpper) glbGravityRingUpper.rotation.y -= dt * 0.24;
    cyanBeaconMat.opacity = 0.55 + 0.32 * Math.sin(now * 0.004);
    for (let gi = 0; gi < gateRings.length; gi++) {
      gateRings[gi]!.rotation.z = now * 0.0005 * (gi % 2 === 0 ? 1 : -1);
    }

    // Update Mass-Driver Launch Sled position & Brake Terminal Catch Arms
    if (glbLaunchSled) {
      glbLaunchSled.position.z = sim.sledZ;
    }
    if (glbTrackCatchArmL && glbTrackCatchArmR) {
      const distToTrackCatch = Math.hypot(
        sim.x - MASS_DRIVER_TRACK.x,
        sim.y - MASS_DRIVER_TRACK.h,
        sim.z - MASS_DRIVER_TRACK.catchZ,
      );
      const trackCatch = distToTrackCatch < 8.5 ? ease(sim.catchBlend) : 0;
      const trackOpen = (1 - trackCatch) * 0.38;
      glbTrackCatchArmL.rotation.y = -trackOpen;
      glbTrackCatchArmR.rotation.y = trackOpen;
    }

    // Animate GLB Orbital Station Catch Arms
    if (glbStationCatchArmL && glbStationCatchArmR) {
      const distToStationCatch = Math.hypot(
        sim.x - ORBITAL_STATION.x,
        sim.y - ORBITAL_STATION.dockY,
        sim.z - ORBITAL_STATION.z,
      );
      const stCatch = distToStationCatch < 9.0 ? ease(sim.catchBlend) : 0;
      const stOpen = (1 - stCatch) * 0.38;
      glbStationCatchArmL.rotation.y = -stOpen;
      glbStationCatchArmR.rotation.y = stOpen;
    }

    // Update modulo-wrapped near-field 3D lunar cobbles around the Roadster for ground speed cues
    const agl = Math.max(0, sim.y - terrainHeight(sim.x, sim.z));
    nearCobbles.visible = agl < 65 && !sim.onStationDeck;
    if (nearCobbles.visible) {
      const baseX = sim.x - NEAR_SPAN / 2;
      const baseZ = sim.z - NEAR_SPAN / 2;
      for (let i = 0; i < NEAR_COUNT; i++) {
        const co = cobbleOffsets[i]!;
        const wx = Math.floor((baseX - co.ox) / NEAR_SPAN + 1) * NEAR_SPAN + co.ox;
        const wz = Math.floor((baseZ - co.oz) / NEAR_SPAN + 1) * NEAR_SPAN + co.oz;
        const onAnyPad =
          PADS.some(
            (p) =>
              Math.hypot(wx - p.x, wz - p.z) < p.r * 1.45 ||
              Math.hypot(wx - p.domeX, wz - p.domeZ) < p.domeR * 1.35,
          ) ||
          Math.hypot(wx - SURFACE_STARSHIP.x, wz - SURFACE_STARSHIP.z) <
            SURFACE_STARSHIP.r * 1.45 ||
          (Math.abs(wx - MASS_DRIVER_TRACK.x) < 7.0 &&
            wz <= MASS_DRIVER_TRACK.startZ + 8 &&
            wz >= MASS_DRIVER_TRACK.endZ - 8);
        if (onAnyPad) {
          dummy.position.set(wx, -9999, wz);
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          const wy = terrainHeight(wx, wz) + co.s * 0.24;
          dummy.position.set(wx, wy, wz);
          dummy.rotation.set(co.ry, co.ry * 0.7, co.ry * 0.4);
          dummy.scale.set(co.s * 1.25, co.s * 0.72, co.s);
        }
        dummy.updateMatrix();
        nearCobbles.setMatrixAt(i, dummy.matrix);
      }
      nearCobbles.instanceMatrix.needsUpdate = true;
    }

    // Animate pad & orbital Catch Arms: open by default so you can drive in, closing onto the bottle collars when caught
    for (const pa of padArmsList) {
      const dist = Math.hypot(sim.x - pa.padX, sim.y - pa.padY, sim.z - pa.padZ);
      const localCatch = dist < 8.5 ? ease(sim.catchBlend) : 0;
      const openAngle = (1 - localCatch) * 0.42;
      for (const ap of pa.armPivots) {
        ap.upper.rotation.z = -ap.side * openAngle;
        ap.forearm.rotation.z = ap.side * openAngle * 1.35;
      }
    }

    // Animate Starman IVA Driver (head turns into corners & pitches toward flight vector; hidden in 1st-person cockpit view)
    if (starmanRoot) {
      starmanRoot.visible = sim.camMode !== "cockpit";
      if (starmanHead) {
        starmanHead.rotation.y = sim.steerAngle * 0.65;
        starmanHead.rotation.z = -sim.pitch * 0.35;
      }
      if (starmanSpine) {
        starmanSpine.rotation.x = -sim.steerAngle * 0.18;
      }
    }

    // Show the active 3D Roadster bundle (Standard Wing, Catch 200 km, or Railgun 250 km)
    for (const vId of ["condo", "lr200", "railgun"] as const) {
      const b = bundles[vId];
      if (!b) continue;
      b.root.visible = sim.variant === vId;
      if (sim.variant !== vId) continue;

      if (b.appliedPaintIdx !== sim.paintIdx) {
        b.appliedPaintIdx = sim.paintIdx;
        const paintHex = PAINTS[sim.paintIdx]?.hex ?? 0xa9abb0;
        for (const n of ["RD_paint", "RD_tail"]) {
          const m = b.mats[n];
          if (m) m.color.setHex(paintHex).convertSRGBToLinear();
        }
      }

      const d = ease(sim.doorsState);
      const f = ease(sim.frunkState);
      const w = ease(sim.wingState);
      if (b.nodes.DoorHinge_L) b.nodes.DoorHinge_L.rotation.x = THREE.MathUtils.degToRad(72) * d;
      if (b.nodes.DoorHinge_R) b.nodes.DoorHinge_R.rotation.x = -THREE.MathUtils.degToRad(72) * d;
      if (b.nodes.FrunkHinge) b.nodes.FrunkHinge.rotation.z = THREE.MathUtils.degToRad(50) * f;
      if (b.nodes.WingPivot && typeof b.nodes.WingPivot.userData.y0 === "number") {
        b.nodes.WingPivot.position.y = b.nodes.WingPivot.userData.y0 - 0.21 * (1 - w);
      }
      if (b.nodes.Yoke) {
        b.nodes.Yoke.rotation.x = -sim.steerAngle * 1.35;
      }

      wheelSpin += (sim.speed / 0.343) * dt;
      for (const t of ["FL", "FR", "RL", "RR"] as const) {
        const wn = b.nodes["Wheel_" + t];
        if (wn) {
          wn.rotation.z = -wheelSpin;
          if (t === "FL" || t === "FR") {
            wn.rotation.y = sim.steerAngle;
          }
        }
      }

      const fanRate = Math.abs(sim.speed) * 2.4 + (sim.firing ? 65 : 4);
      fanSpin += fanRate * dt;
      for (let i = 0; i < 4; i++) {
        const fn = b.nodes[`Fan_${i}_rotor`];
        if (fn) fn.rotation.x = fanSpin;
      }

      const lFactor = 0.03 + 0.97 * sim.lightsState;
      if (b.mats["RD_light_white"]) {
        b.mats["RD_light_white"].emissiveIntensity =
          (b.mats["RD_light_white"].userData.base || 1) * lFactor;
      }
      if (b.mats["RD_light_amber"]) {
        b.mats["RD_light_amber"].emissiveIntensity =
          (b.mats["RD_light_amber"].userData.base || 1) * lFactor;
      }
      if (b.mats["RD_light_red"]) {
        const brakeBoost = sim.braking ? 2.4 : 1.0;
        b.mats["RD_light_red"].emissiveIntensity =
          (b.mats["RD_light_red"].userData.base || 1) * lFactor * brakeBoost;
      }

      // Modulate the Catch Roadster's lit amber LCH4 and blue LOX fill-gauge strips with tank level
      const fillFrac = Math.max(0.08, sim.gas / Math.max(1, sim.spec.fuelCapacityKg));
      for (const gn of ["RD_gauge_ch4", "RD_gauge_lox"] as const) {
        const gm = b.mats[gn];
        if (gm) {
          gm.emissiveIntensity = (gm.userData.base || 1) * (0.25 + 1.15 * fillFrac);
        }
      }
    }

    const d = ease(sim.doorsState);
    headLightL.intensity = 18 * sim.lightsState;
    headLightR.intensity = 18 * sim.lightsState;
    tailGlowLight.intensity = (sim.braking ? 4.2 : 1.6) * sim.lightsState;
    cabinWarmLight.intensity = d * 2.2;
    bellWarmLight.intensity = sim.spec.hasCatchBottles ? (sim.lifting ? 6.5 : 1.4) : 0;

    // Cold-gas & Methalox shock diamonds + particle plumes
    const showRear = sim.boosting || (sim.firing && !sim.lifting);
    const showDown = sim.lifting;
    const isCatch = sim.spec.hasCatchBottles;
    const flicker = 0.82 + Math.random() * 0.35;
    for (const rc of rearCones) {
      rc.visible = showRear;
      rc.material = isCatch ? methaloxMat : shockMat;
      rc.scale.set(1, 1, flicker);
    }
    for (const dc of downCones) {
      dc.visible = showDown;
      dc.scale.set(1, flicker, 1);
    }
    bellCone.visible = showDown && isCatch;
    bellCone.scale.set(1, flicker * 1.15, 1);

    thrusterLight.intensity = showDown ? (isCatch ? 14 : 9) : showRear ? 6 : 0;
    thrusterLight.position.set(0, showDown ? 0.15 : 0.45, showDown ? 0.8 : 2.35);

    if (showRear) {
      for (const [lx, ly, lz] of rearLocals) {
        spawn(lx, ly, lz, 24, 0.8, isCatch ? "methalox" : "cryo");
      }
    }
    if (showDown) {
      if (isCatch) {
        // Under-tail CH4/LOX main bell plume
        spawn(0, 0.1, 1.63, 2.2, 24, "methalox");
        spawn((Math.random() - 0.5) * 0.16, 0.1, 1.63, 2.2, 24, "methalox");
      }
      for (const [lx, ly, lz] of downLocals) {
        spawn(lx, ly, lz, 1.5, 18, "cryo");
        if (agl < 14 && !sim.onStationDeck) {
          spawn(lx * 1.3, 0.08, lz, (Math.random() - 0.5) * 8, -2.4, "dust");
        }
      }
    }

    // 4-Wheel high-speed lunar regolith roostertails when driving fast on the Moon
    const absSpd = Math.abs(sim.speed);
    if (sim.grounded && !sim.onStationDeck && absSpd > 3.5) {
      const count = absSpd > 28 ? 2 : 1;
      for (let cIdx = 0; cIdx < count; cIdx++) {
        const w = wheelLocals[Math.floor(Math.random() * 4)]!;
        const backVel = Math.min(22, absSpd * 0.38);
        spawn(
          w[0] + (Math.random() - 0.5) * 0.18,
          w[1],
          w[2] + 0.25,
          backVel,
          -(1.4 + Math.min(3.5, absSpd * 0.06)),
          "dust",
        );
      }
    }

    // High-speed orbital ascent motes passing the Roadster at high 3D velocity
    const speed3D = Math.hypot(sim.vx, sim.vy, sim.vz);
    if (speed3D > 22) {
      const moteCount = speed3D > 65 ? 3 : 1;
      for (let m = 0; m < moteCount; m++) {
        spawn(
          (Math.random() - 0.5) * 9,
          0.5 + (Math.random() - 0.3) * 4.5,
          -12 - Math.random() * 14,
          speed3D * 0.65,
          sim.vy * 0.35,
          "mote",
        );
      }
    }

    for (let i = 0; i < POOL; i++) {
      const p = particles[i]!;
      if (p.life <= 0) {
        plumePos[i * 3 + 1] = -999;
        continue;
      }
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const gnd = (sim.onStationDeck ? ORBITAL_STATION.dockY : terrainHeight(p.x, p.z)) + 0.05;
      if (p.y < gnd && sim.introTimer <= 0) {
        p.y = gnd;
        p.vy = Math.abs(p.vy) * 0.25;
        p.vx *= 0.85;
        p.vz *= 0.85;
      }
      plumePos[i * 3] = p.x;
      plumePos[i * 3 + 1] = p.y;
      plumePos[i * 3 + 2] = p.z;
    }
    const posAttr = plumeGeo.getAttribute("position");
    const colAttr = plumeGeo.getAttribute("color");
    if (posAttr) posAttr.needsUpdate = true;
    if (colAttr) colAttr.needsUpdate = true;

    // ========================================================================
    // SPEED-AUDITED CAMERA + 4-SECOND SUBTERRANEAN GARAGE EMERGENCE SWEEP
    // ========================================================================
    const speedRatio = Math.min(1, speed3D / 95);
    const targetFov =
      sim.introTimer > 0
        ? 46
        : sim.camMode === "orbit" || dragging
          ? 50
          : 54 + speedRatio * 12 + (sim.boosting ? 4 : 0);
    currentFov += (targetFov - currentFov) * (1 - Math.exp(-7 * dt));
    if (Math.abs(camera.fov - currentFov) > 0.05) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }

    // Carry camera along with the vehicle's frame displacement so high-speed flight (600+ km/h)
    // never causes exponential world-space distance lag behind the Roadster
    const carStepX = sim.x - prevCarPos.x;
    const carStepY = sim.y - prevCarPos.y;
    const carStepZ = sim.z - prevCarPos.z;
    prevCarPos.set(sim.x, sim.y, sim.z);
    if (Math.hypot(carStepX, carStepY, carStepZ) < 120) {
      camPos.x += carStepX;
      camPos.y += carStepY;
      camPos.z += carStepZ;
    }

    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    const surfaceFloor = (x: number, z: number) =>
      sim.onStationDeck ? ORBITAL_STATION.dockY : terrainHeight(x, z);

    if (sim.introTimer > 0 && !dragging) {
      // 4.0-second in-game subterranean garage ascent camera choreography:
      // Starts looking down into the open underground garage shaft as the hydraulic lift raises
      // the Roadster + Starman from -3.4 m below ground through the opening blast doors, then
      // orbits around the rising vehicle into the rear chase camera at t = 4.0 s.
      const u = 1 - sim.introTimer / sim.introDuration; // 0 -> 1 over 4.0 s
      const chaseX = sim.x - fx * 5.6;
      const chaseY = sim.y + 1.38;
      const chaseZ = sim.z - fz * 5.6;
      const chaseLookX = sim.x + fx * 4.8;
      const chaseLookY = sim.y + 0.68;
      const chaseLookZ = sim.z + fz * 4.8;

      const az = 2.15 * (1 - ease(Math.min(1, u / 0.88)));
      const rad = 4.25 + 1.35 * ease(u);
      const orbitCamX = sim.x + Math.sin(az) * rad;
      const orbitCamY = sim.y + 1.18 + 0.2 * ease(u);
      const orbitCamZ = sim.z + Math.cos(az) * rad;

      const orbitLookX = sim.x;
      const orbitLookY = sim.y + sim.elevatorOffset * 0.68 + 0.65;
      const orbitLookZ = sim.z - 0.3 * ease(u);

      const endBlend = u > 0.72 ? ease((u - 0.72) / 0.28) : 0;
      camPos.set(
        orbitCamX * (1 - endBlend) + chaseX * endBlend,
        orbitCamY * (1 - endBlend) + chaseY * endBlend,
        orbitCamZ * (1 - endBlend) + chaseZ * endBlend,
      );
      look.set(
        orbitLookX * (1 - endBlend) + chaseLookX * endBlend,
        orbitLookY * (1 - endBlend) + chaseLookY * endBlend,
        orbitLookZ * (1 - endBlend) + chaseLookZ * endBlend,
      );
      camera.up.set(0, 1, 0);
    } else if (sim.camMode === "orbit" || dragging) {
      const oy = sim.yaw + input.orbitYaw;
      const op = input.orbitPitch;
      const od = input.orbitDist;
      desired.set(
        sim.x + Math.sin(oy) * Math.cos(op) * od,
        sim.y + Math.sin(op) * od + 0.55 + catchHover + sim.elevatorOffset,
        sim.z + Math.cos(oy) * Math.cos(op) * od,
      );
      const floor = surfaceFloor(desired.x, desired.z) + 0.42;
      if (desired.y < floor) desired.y = floor;
      camPos.lerp(desired, 1 - Math.exp(-10 * dt));
      look.set(sim.x, sim.y + 0.62 + catchHover + sim.elevatorOffset, sim.z);
      camera.up.set(0, 1, 0);
    } else if (sim.camMode === "low") {
      const dist = 4.8 + speedRatio * 0.75;
      desired.set(
        sim.x - fx * dist + fz * 0.9,
        sim.y + 0.86 + catchHover + sim.elevatorOffset,
        sim.z - fz * dist - fx * 0.9,
      );
      const floor = surfaceFloor(desired.x, desired.z) + 0.38;
      if (desired.y < floor) desired.y = floor;
      camPos.lerp(desired, 1 - Math.exp(-12 * dt));
      look.set(sim.x + fx * 6.0, sim.y + 0.55 + catchHover + sim.elevatorOffset, sim.z + fz * 6.0);
      camera.up.set(-sim.steerAngle * speedRatio * 0.14, 1, 0).normalize();
    } else if (sim.camMode === "cockpit") {
      desired.set(
        sim.x - fx * 0.15,
        sim.y + 0.92 + sim.suspOffset + catchHover + sim.elevatorOffset,
        sim.z - fz * 0.15,
      );
      camPos.copy(desired);
      look.set(
        sim.x + fx * 18,
        sim.y + 0.82 + Math.sin(sim.pitch) * 18 + catchHover + sim.elevatorOffset,
        sim.z + fz * 18,
      );
      camera.up.set(-sim.roll * 0.6, 1, 0).normalize();
    } else {
      // Low, tight, zero-lag high-speed chase camera
      const dist = 5.6 + speedRatio * 0.85;
      const crouch = sim.grounded ? speedRatio * 0.18 : 0;
      const height = 1.38 - crouch + Math.min(0.65, agl * 0.01);
      desired.set(
        sim.x - fx * dist,
        sim.y + height + catchHover + sim.elevatorOffset,
        sim.z - fz * dist,
      );
      const floor = surfaceFloor(desired.x, desired.z) + 0.48;
      if (desired.y < floor) desired.y = floor;
      const vib = sim.impact * 0.22 + (sim.boosting ? 0.025 : 0) + (sim.grounded ? speedRatio * 0.018 : 0);
      desired.x += (Math.random() - 0.5) * vib;
      desired.y += (Math.random() - 0.5) * vib;
      const k = 1 - Math.exp(-12 * dt);
      camPos.lerp(desired, input.running ? k : 1);
      // Aim slightly upward when climbing or facing the Tesla Orbital Station so both car & station stay framed
      const climbLook = Math.max(-0.9, Math.min(1.6, sim.vy * 0.03));
      look.set(
        sim.x + fx * 4.8,
        sim.y + 0.68 + climbLook + catchHover + sim.elevatorOffset,
        sim.z + fz * 4.8,
      );
      const bank = -sim.steerAngle * speedRatio * 0.12;
      camera.up.set(bank, 1, 0).normalize();
    }
    camera.position.copy(camPos);
    camera.lookAt(look);

    // Grazing 6.5° Lunar South Pole sunlight for long chiselled regolith & boulder shadows
    const sunElev = (6.5 * Math.PI) / 180;
    sun.position.set(sim.x + 420, sim.y + Math.sin(sunElev) * 440, sim.z + 160);
    sun.target.position.set(sim.x, sim.y, sim.z);
    sun.target.updateMatrixWorld();

    earth.rotation.y += dt * 0.05;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    draco.dispose();
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    if (window.__controlsTest) delete window.__controlsTest;
    envTex.dispose();
    regolithTex.dispose();
    renderer.dispose();
    groundGeo.dispose();
    rockGeo.dispose();
    gateGeo.dispose();
    plumeGeo.dispose();
    rearConeGeo.dispose();
    downConeGeo.dispose();
    bellConeGeo.dispose();
  };
}

