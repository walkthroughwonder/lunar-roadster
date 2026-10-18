/** 1 unit = 1 meter. Figures are published lunar values (LRO / LOLA South Pole datum). */

export const RIDE = 0;
export const MOON_RADIUS = 1_737_400;
export const SHACKLETON_R = 10_500;
export const SHACKLETON_DEPTH = 4_200;
export const SHACKLETON_RIM = 480;
export const SHACKLETON_CENTER_Z = -SHACKLETON_R;
const CENTER_Z = SHACKLETON_CENTER_Z;

export const RIM_BOUNDS = {
  cx: 0,
  cz: CENTER_Z,
  rhoMin: 8_800,
  rhoMax: 11_200,
  thetaMax: 0.16,
};

export type Pad = {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  h: number;
  lodge: boolean;
  domeX: number;
  domeZ: number;
  domeR: number;
  domeH: number;
};

type Crater = { x: number; z: number; d: number };

export function polar(theta: number, rho: number) {
  return {
    x: Math.sin(theta) * rho,
    z: CENTER_Z + Math.cos(theta) * rho,
  };
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

const SITE_DEFS = [
  { id: "garage", name: "Garage", theta: 0, lodge: false, domeR: 6 },
  { id: "rim", name: "Rim Lodge", theta: 0.05, lodge: true, domeR: 9 },
  { id: "peak", name: "Peak Suite", theta: -0.05, lodge: true, domeR: 9 },
  { id: "basin", name: "Basin House", theta: 0.1, lodge: true, domeR: 9 },
  { id: "earth", name: "Earthview", theta: -0.1, lodge: true, domeR: 9 },
];

const APRON_R = 8;

function isNearAnySite(x: number, z: number, minDist: number): boolean {
  for (const s of SITE_DEFS) {
    const domeRho = SHACKLETON_R + 18;
    const parkRho = domeRho + s.domeR + 22 + APRON_R;
    const dome = polar(s.theta, domeRho);
    const park = polar(s.theta, parkRho);
    if (
      Math.hypot(x - dome.x, z - dome.z) < minDist ||
      Math.hypot(x - park.x, z - park.z) < minDist
    ) {
      return true;
    }
  }
  return false;
}

/** Simple-crater morphometry (Pike 1977): depth ≈ 0.196 D, rim ≈ 0.036 D. */
const CRATERS: Crater[] = [
  // Rim-zone named/hero craters near the drive corridor (kept clear of pads/domes)
  { ...polar(0.024, SHACKLETON_R + 135), d: 68 },
  { ...polar(-0.027, SHACKLETON_R + 210), d: 38 },
  { ...polar(0.075, SHACKLETON_R + 160), d: 52 },
  { ...polar(-0.076, SHACKLETON_R + 145), d: 84 },
  { ...polar(0.135, SHACKLETON_R + 220), d: 44 },
  { ...polar(-0.132, SHACKLETON_R + 150), d: 34 },
  { ...polar(0, SHACKLETON_R + 280), d: 58 },
  { ...polar(0.165, SHACKLETON_R + 90), d: 66 },
  // Larger highland & outer-flank impact craters visible across the lunar horizon
  { ...polar(0.28, SHACKLETON_R + 1400), d: 920 },
  { ...polar(-0.24, SHACKLETON_R + 1150), d: 780 },
  { ...polar(0.09, SHACKLETON_R + 980), d: 520 },
  { ...polar(-0.15, SHACKLETON_R + 820), d: 440 },
  { ...polar(0.42, SHACKLETON_R + 2400), d: 1650 },
  { ...polar(-0.38, SHACKLETON_R + 2100), d: 1420 },
  { ...polar(0.0, SHACKLETON_R + 1850), d: 860 },
];

// Additional procedural secondary craters along the South Pole rim
for (let i = 0; i < 28; i++) {
  const th = (hash(i * 7 + 1) - 0.5) * 0.42;
  const rho = SHACKLETON_R - 250 + hash(i * 7 + 2) * 1450;
  const d = 18 + hash(i * 7 + 3) ** 2 * 110;
  const c = polar(th, rho);
  if (isNearAnySite(c.x, c.z, d * 0.9 + 55)) continue;
  CRATERS.push({ x: c.x, z: c.z, d });
}

function craterDelta(x: number, z: number, c: Crater): number {
  const R = c.d / 2;
  const dx = x - c.x;
  const dz = z - c.z;
  const r2 = dx * dx + dz * dz;
  const maxR = R * 2.2;
  if (r2 >= maxR * maxR) return 0;
  const r = Math.sqrt(r2);
  const depth = 0.196 * c.d;
  const rim = 0.042 * c.d;
  if (r <= R) {
    const u = r / R;
    // C1-smooth parabolic bowl rising to a rounded rim crest at u = 1 (zero slope at u = 0 and u = 1)
    const s = u * u * (3 - 2 * u);
    return -depth + (depth + rim) * s;
  }
  // Smooth C1 ejecta apron decaying from +rim at r = R to 0 at r = maxR
  const t = (r - R) / (maxR - R);
  const fade = (1 - t * t) ** 2;
  return rim * fade;
}

/**
 * Authentic LOLA-inspired Shackleton Crater + Lunar South Pole relief:
 * - 21 km diameter, 4.2 km deep flat-floored simple-to-complex transition crater
 * - C1-continuous transitions at floor edge (u = floorR) and rim crest (u = 1)
 * - Terraced inner slump walls & subtle central floor mound
 * - Asymmetric rim crest with Peaks of Eternal Light & Connecting Ridge massif
 * - True spherical lunar curvature datum (R = 1,737.4 km)
 */
export function relief(x: number, z: number): number {
  const dz = z - CENTER_Z;
  const rho = Math.hypot(x, dz);
  const theta = Math.atan2(x, dz);
  const R = SHACKLETON_R;
  const u = rho / R;
  const floorR = 0.38;

  // Natural azimuthal variation of Shackleton's rim crest (Peaks of Eternal Light)
  const rimCrest =
    SHACKLETON_RIM +
    Math.cos(theta * 3 - 0.35) * 65 +
    Math.sin(theta * 7 + 1.1) * 32 +
    Math.cos(theta * 13) * 14;

  let h: number;
  if (u < floorR) {
    // Crater floor at -4200 m with subtle 85 m central hummock mound (smoothly 0 at u = floorR)
    const fu = u / floorR;
    const edgeFade = (1 - fu * fu) ** 2;
    const mound =
      (Math.exp(-fu * fu * 5.0) * 85 + Math.sin(x * 0.004) * Math.cos(z * 0.004) * 12) *
      edgeFade;
    h = -SHACKLETON_DEPTH + mound;
  } else if (u < 1) {
    const t = (u - floorR) / (1 - floorR);
    const s = t * t * (3 - 2 * t);
    const wallEnvelope = t * t * (1 - t) * (1 - t) * 16;
    // Inner wall slump terraces + radial gullies (smoothly vanishing at t = 0 and t = 1)
    const terrace =
      Math.sin(t * Math.PI * 5 + Math.sin(theta * 9) * 0.6) * 24 * wallEnvelope * 0.35;
    const radialRibs = Math.sin(theta * 28 + t * 2.2) * 12 * wallEnvelope * 0.25;
    h = -SHACKLETON_DEPTH + (SHACKLETON_DEPTH + rimCrest) * s + terrace + radialRibs;
  } else {
    const beyond = rho - R;
    // Smooth ramp that is 0 (with 0 derivative) at beyond = 0 so the rim crest has no cliff
    const outerRamp = (beyond / (beyond + 360)) ** 2;
    // Outer ejecta blanket decay + radial hummocky ejecta rays
    const ejectaBlanket = rimCrest * Math.exp(-2.4 * (beyond / 3100) ** 2);
    const ejectaRays =
      outerRamp *
      Math.sin(theta * 19 + beyond * 0.0007) *
      Math.cos(theta * 11 - beyond * 0.0005) *
      20 *
      Math.exp(-beyond / 4500);
    // Connecting Ridge / South Pole massif rising in the distance
    const massif =
      outerRamp *
      (Math.max(0, Math.cos(theta - 0.55)) ** 4 *
        620 *
        Math.exp(-(((beyond - 5200) / 3400) ** 2)) +
        Math.max(0, Math.cos(theta + 0.62)) ** 4 *
          540 *
          Math.exp(-(((beyond - 6000) / 3800) ** 2)));
    h = ejectaBlanket + ejectaRays + massif;
  }

  // Subtle multi-octave regolith undulation along the drive zone
  const microUndulation =
    Math.sin(x * 0.011 + z * 0.007) * 0.65 +
    Math.cos(x * 0.029 - z * 0.023) * 0.24;
  h += microUndulation;

  // Spherical lunar datum drop-off relative to the rim reference distance
  const dDatum = rho - SHACKLETON_R;
  h += -(dDatum * dDatum) / (2 * MOON_RADIUS);

  for (let i = 0; i < CRATERS.length; i++) {
    h += craterDelta(x, z, CRATERS[i]!);
  }
  return h;
}

/** Distance from point (x, z) to line segment (ax, az)-(bx, bz). */
function distToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = x - ax;
  const wz = z - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(x - ax, z - az);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(x - bx, z - bz);
  const t = c1 / c2;
  return Math.hypot(x - (ax + t * vx), z - (az + t * vz));
}

function blendSiteTerrace(h: number, x: number, z: number, p: Pad): number {
  // Grade a unified flat terrace around each pad, its dome, and the causeway between them
  const dPad = Math.hypot(x - p.x, z - p.z) - p.r * 1.35;
  const dDome = Math.hypot(x - p.domeX, z - p.domeZ) - p.domeR * 1.35;
  const dCauseway = distToSegment(x, z, p.x, p.z, p.domeX, p.domeZ) - 6.5;
  const signedDist = Math.min(dPad, dDome, dCauseway);
  const blendWidth = 22.0;
  if (signedDist >= blendWidth) return h;
  if (signedDist <= 0) return p.h;
  const t = signedDist / blendWidth;
  const b = 1 - t * t * (3 - 2 * t);
  return h * (1 - b) + p.h * b;
}

export const PADS: Pad[] = SITE_DEFS.map((s) => {
  const domeRho = SHACKLETON_R + 18;
  const parkRho = domeRho + s.domeR + 22 + APRON_R;
  const dome = polar(s.theta, domeRho);
  const park = polar(s.theta, parkRho);
  const siteH = relief(park.x, park.z);
  return {
    id: s.id,
    name: s.name,
    x: park.x,
    z: park.z,
    r: APRON_R,
    h: siteH,
    lodge: s.lodge,
    domeX: dome.x,
    domeZ: dome.z,
    domeR: s.domeR,
    domeH: siteH,
  };
});

export const LODGES = PADS.filter((p) => p.lodge);

/**
 * 1:1 Lunar Mass-Driver / Electromagnetic Railgun Track (`/lunar-mass-driver.glb`)
 * - Positioned parallel to the South Pole Garage at x = -26 m, running along -Z from z = +85 m to z = -225 m
 * - 5 × 50 m linear-induction rail segments (250 m launch run) + 60 m magnetic brake terminal (total 310 m)
 * - Terminal Catch Arms (`CatchArm_L/R`) sit at z = startZ - 250 - 52.95 = -217.95 m
 */
export const MASS_DRIVER_TRACK = {
  x: -26,
  startZ: 85,
  segments: 5,
  segmentLengthM: 50,
  terminalStartZ: 85 - 5 * 50, // -165
  terminalLengthM: 60,
  endZ: 85 - 5 * 50 - 60, // -225
  catchZ: 85 - 5 * 50 - 52.95, // -217.95
  h: PADS[0]!.h,
};

/**
 * 1:1 Landed SpaceX Starship HLS (`/starship.glb`, 50 m tall × 9 m diameter)
 * - Berthed on the South Pole HLS Landing Pad at x = +48 m, z = +52 m beside the Garage
 */
export const SURFACE_STARSHIP = {
  x: 48,
  z: 52,
  r: 14,
  h: PADS[0]!.h,
};

export function terrainHeight(x: number, z: number): number {
  let h = relief(x, z);
  for (const p of PADS) {
    h = blendSiteTerrace(h, x, z, p);
  }
  // Grade flat causeway for the 310 m Lunar Mass-Driver Track
  const dTrack =
    distToSegment(
      x,
      z,
      MASS_DRIVER_TRACK.x,
      MASS_DRIVER_TRACK.startZ + 8,
      MASS_DRIVER_TRACK.x,
      MASS_DRIVER_TRACK.endZ - 6,
    ) - 5.2;
  if (dTrack < 18) {
    const t = Math.max(0, dTrack / 18);
    const b = 1 - t * t * (3 - 2 * t);
    h = h * (1 - b) + MASS_DRIVER_TRACK.h * b;
  }
  // Grade flat landing pad for the surface SpaceX Starship HLS
  const dShip = Math.hypot(x - SURFACE_STARSHIP.x, z - SURFACE_STARSHIP.z) - SURFACE_STARSHIP.r * 1.25;
  if (dShip < 20) {
    const t = Math.max(0, dShip / 20);
    const b = 1 - t * t * (3 - 2 * t);
    h = h * (1 - b) + SURFACE_STARSHIP.h * b;
  }
  return h;
}

/** Surface unit normal [nx, ny, nz] via central differences (1 m baseline). */
export function terrainNormal(x: number, z: number): [number, number, number] {
  const eps = 1.0;
  const hx0 = terrainHeight(x - eps, z);
  const hx1 = terrainHeight(x + eps, z);
  const hz0 = terrainHeight(x, z - eps);
  const hz1 = terrainHeight(x, z + eps);
  const dx = (hx1 - hx0) / (2 * eps);
  const dz = (hz1 - hz0) / (2 * eps);
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export type OrbitalStationSpec = {
  name: string;
  x: number;
  dockY: number;
  z: number;
  dockR: number;
  totalHeightM: number;
  spireTopY: number;
  starshipsDocked: number;
};

/**
 * Empire-State-Building-sized Tesla Orbital Station (`/tesla-orbital-station.glb`)
 * holding low perilune station over Shackleton Crater straight ahead (-Z) of the Garage.
 * - Total height: 443.2 m (1,454 ft, matching the Empire State Building from -62 m nadir core to +381.2 m spire tip)
 * - 4 SpaceX Starships (`/starship.glb`, 50 m tall × 9 m diameter each) docked radially at DockPort_N/S/E/W
 * - Orbital Roadster Catch Deck at origin y = 0 -> world dockY = 1,680 m (radius = 28 m)
 */
export const ORBITAL_STATION: OrbitalStationSpec = {
  name: "Tesla Orbital Station",
  x: 0,
  dockY: 1_680,
  z: -1_650,
  dockR: 28,
  totalHeightM: 443.2,
  spireTopY: 1_680 + 381.2,
  starshipsDocked: 4,
};

export type ApproachGate = {
  x: number;
  y: number;
  z: number;
  r: number;
  pitch: number;
};

/** 3D orbital ascent trajectory gates leading from the Shackleton rim up to the Tesla Orbital Station. */
export const APPROACH_GATES: ApproachGate[] = Array.from({ length: 7 }, (_, idx) => {
  const t = (idx + 1) / 8;
  const startZ = -60;
  const startY = 520;
  const x = 0;
  const z = startZ + (ORBITAL_STATION.z - startZ) * t;
  const s = t * t * (3 - 2 * t);
  const y = startY + (ORBITAL_STATION.dockY - startY) * s;
  return {
    x,
    y,
    z,
    r: 18,
    pitch: 0.58 * (1 - t * 0.6),
  };
});

export type Rock = { x: number; y: number; z: number; s: number; ry: number };

export const ROCKS: Rock[] = [];
for (let i = 0; i < 420; i++) {
  const x = (hash(i + 1) - 0.5) * 2600;
  const z = (hash(i + 9) - 0.5) * 1100 - 40;
  const onPad =
    PADS.some(
      (p) =>
        Math.hypot(x - p.x, z - p.z) < p.r * 2.2 + 4 ||
        Math.hypot(x - p.domeX, z - p.domeZ) < p.domeR * 2.0 + 4,
    ) ||
    distToSegment(
      x,
      z,
      MASS_DRIVER_TRACK.x,
      MASS_DRIVER_TRACK.startZ + 12,
      MASS_DRIVER_TRACK.x,
      MASS_DRIVER_TRACK.endZ - 12,
    ) < 14 ||
    Math.hypot(x - SURFACE_STARSHIP.x, z - SURFACE_STARSHIP.z) < SURFACE_STARSHIP.r * 2.0;
  if (onPad) continue;
  const s = 0.22 + hash(i + 3) ** 1.5 * 1.95;
  ROCKS.push({
    x,
    z,
    y: terrainHeight(x, z) + s * 0.22,
    s,
    ry: hash(i + 5) * Math.PI,
  });
}

