import {
  APPROACH_GATES,
  LODGES,
  MASS_DRIVER_TRACK,
  ORBITAL_STATION,
  PADS,
  RIDE,
  RIM_BOUNDS,
  terrainHeight,
  terrainNormal,
} from "./world";
import type { CamMode, DriveInput } from "./input";

const BEST_KEY = "lunar-roadster-best-alt";
const STATION_KEY = "lunar-roadster-station-docked";
const G = 1.622; // Lunar surface gravity (m/s²)
const G0 = 9.80665; // Standard Earth gravity for Isp & G-load
const STARMAN_MASS_KG = 85; // Seated Starman + IVA suit mass

export type CarVariantId = "condo" | "lr200" | "railgun";
export type ControlRegime = "SURFACE" | "FLIGHT" | "DOCKING" | "RAILGUN" | "AUTOPILOT";

export type CarVariantSpec = {
  id: CarVariantId;
  code: string;
  label: string;
  subtitle: string;
  glbUrl: string;
  hasWing: boolean;
  hasCatchBottles: boolean;
  hasRailgunSled: boolean;
  dryMassKg: number;
  fuelCapacityKg: number;
  rangeKm: number;
  liftNewtons: number;
  groundAccel: number;
  boostAccel: number;
  airAccel: number;
  maxGroundSpeed: number;
  maxBoostSpeed: number;
  maxClimbRate: number;
  propellantName: string;
  ispSeconds: number;
  unlockFullCrater: boolean;
};

export const CAR_VARIANTS: Record<CarVariantId, CarVariantSpec> = {
  condo: {
    id: "condo",
    code: "WING · 15 KM",
    label: "Standard Wing",
    subtitle: "250 kg Cold-Gas N₂ · Swan-Neck Wing",
    glbUrl: "/roadster.glb",
    hasWing: true,
    hasCatchBottles: false,
    hasRailgunSled: false,
    dryMassKg: 1450,
    fuelCapacityKg: 250,
    rangeKm: 15,
    liftNewtons: 24000,
    groundAccel: 24,
    boostAccel: 48,
    airAccel: 26,
    maxGroundSpeed: 64,
    maxBoostSpeed: 98,
    maxClimbRate: 38,
    propellantName: "Cold gas N₂",
    ispSeconds: 73,
    unlockFullCrater: false,
  },
  lr200: {
    id: "lr200",
    code: "CATCH · 200 KM",
    label: "Catch · 200 km",
    subtitle: "LCH₄ + LOX Saddle Bottles · Under-Tail Bell",
    glbUrl: "/roadster-catch.glb",
    hasWing: false,
    hasCatchBottles: true,
    hasRailgunSled: false,
    dryMassKg: 1550,
    fuelCapacityKg: 1200,
    rangeKm: 200,
    liftNewtons: 58000,
    groundAccel: 30,
    boostAccel: 68,
    airAccel: 54,
    maxGroundSpeed: 82,
    maxBoostSpeed: 165,
    maxClimbRate: 88,
    propellantName: "LCH₄ / LOX",
    ispSeconds: 345,
    unlockFullCrater: true,
  },
  railgun: {
    id: "railgun",
    code: "RAILGUN · 250 KM",
    label: "Railgun · 250 km",
    subtitle: "Mass-Driver Sled Plate · Bare Hardpoint Pins · Attitude N₂",
    glbUrl: "/roadster-railgun.glb",
    hasWing: false,
    hasCatchBottles: false,
    hasRailgunSled: true,
    dryMassKg: 1380,
    fuelCapacityKg: 180,
    rangeKm: 250,
    liftNewtons: 32000,
    groundAccel: 32,
    boostAccel: 56,
    airAccel: 42,
    maxGroundSpeed: 86,
    maxBoostSpeed: 175,
    maxClimbRate: 78,
    propellantName: "Attitude N₂",
    ispSeconds: 73,
    unlockFullCrater: true,
  },
};

export const PAINTS = [
  { name: "Silver", hex: 0xa9abb0, css: "#a9abb0" },
  { name: "Midnight", hex: 0x121318, css: "#121318" },
  { name: "Red", hex: 0x8f0f12, css: "#8f0f12" },
  { name: "Deep blue", hex: 0x14264f, css: "#14264f" },
  { name: "Pearl", hex: 0xe7e5df, css: "#e7e5df" },
] as const;

export type Snapshot = {
  variant: CarVariantId;
  variantSpec: CarVariantSpec;
  controlRegime: ControlRegime;
  introActive: boolean;
  introProgress: number;
  elevatorOffset: number;
  hoverHold: boolean;
  autopilot: boolean;
  railgunActive: boolean;
  onMassDriver: boolean;
  sledZ: number;
  slipAngleDeg: number;
  totalMassKg: number;
  deltaVRemainingMs: number;
  twrMoon: number;
  gLoad: number;
  trackEnergyKwh: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  speed3D: number;
  agl: number;
  gasKg: number;
  fuelCapacityKg: number;
  rangeRemainingKm: number;
  odometerKm: number;
  grounded: boolean;
  firing: boolean;
  lifting: boolean;
  descending: boolean;
  boosting: boolean;
  caught: boolean;
  onStationDeck: boolean;
  stationDocked: boolean;
  stationDist: number;
  stationCapturing: boolean;
  dockTarget: {
    name: string;
    dx: number;
    dy: number;
    dz: number;
    horizDist: number;
  } | null;
  visited: string[];
  best: number;
  hop: number;
  nearest: { name: string; dist: number } | null;
  refilling: boolean;
  impact: number;
  doors: boolean;
  frunk: boolean;
  wing: boolean;
  lights: boolean;
  paintIdx: number;
  camMode: CamMode;
  modelLoaded: boolean;
  modelLoadPct: number;
};

function loadBest(): number {
  if (typeof localStorage === "undefined") return 0;
  const n = Number(localStorage.getItem(BEST_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}

function loadStationDocked(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STATION_KEY) === "1";
}

export class Sim {
  variant: CarVariantId = "lr200";
  readonly introDuration = 4.0;
  introTimer = 4.0;
  elevatorOffset = -3.4;
  x = 0;
  y = 2;
  z = 10;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  steerAngle = 0;
  slipAngle = 0;
  suspOffset = 0;
  suspVel = 0;
  speed = 0;
  gas = 1;
  odometerM = 0;
  grounded = true;
  firing = false;
  lifting = false;
  descending = false;
  boosting = false;
  braking = false;
  hoverHold = true;
  autopilot = false;
  railgunTimer = 0;
  onMassDriver = false;
  sledZ = MASS_DRIVER_TRACK.startZ - 4;
  trackEnergyKwh = 0;
  gLoad = G / G0;
  caught = false;
  catchBlend = 0;
  onStationDeck = false;
  stationDocked = false;
  stationCapturing = false;
  impact = 0;
  hop = 0;
  best = 0;
  visited = new Set<string>();

  // Roadster interactive state (matches viewer controls)
  doorsTarget = 0;
  frunkTarget = 0;
  wingTarget = 1;
  lightsTarget = 1;
  doorsState = 0;
  frunkState = 0;
  wingState = 1;
  lightsState = 1;
  paintIdx = 0;
  camMode: CamMode = "chase";
  modelLoaded = false;
  modelLoadPct = 0;

  private hopPeak = 0;

  constructor() {
    this.best = loadBest();
    this.stationDocked = loadStationDocked();
    this.reset(false);
  }

  get spec(): CarVariantSpec {
    return CAR_VARIANTS[this.variant];
  }

  /** Starts the 4.0-second subterranean garage elevator ascent at Shackleton Garage (`PADS[0]`). */
  triggerIntro() {
    const pad = PADS[0]!;
    this.x = pad.x;
    this.z = pad.z;
    this.y = terrainHeight(this.x, this.z) + RIDE;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.speed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.grounded = true;
    this.onStationDeck = false;
    this.onMassDriver = false;
    this.autopilot = false;
    this.railgunTimer = 0;
    this.caught = false;
    this.catchBlend = 0;
    this.introTimer = this.introDuration;
    this.elevatorOffset = -3.4;
  }

  setVariant(v: CarVariantId) {
    if (this.variant === v) return;
    this.variant = v;
    this.gas = 1;
    const pad = PADS[0]!;
    if (
      Math.hypot(this.x - pad.x, this.z - pad.z) < 6.5 &&
      Math.abs(this.speed) < 1.0 &&
      this.grounded &&
      !this.onStationDeck
    ) {
      this.triggerIntro();
    }
  }

  toggleVariant() {
    const order: CarVariantId[] = ["condo", "lr200", "railgun"];
    const next = order[(order.indexOf(this.variant) + 1) % order.length]!;
    this.setVariant(next);
  }

  toggleHoverHold() {
    this.hoverHold = !this.hoverHold;
  }

  toggleAutopilot() {
    this.autopilot = !this.autopilot;
    if (this.autopilot) {
      this.introTimer = 0;
      this.elevatorOffset = 0;
      if (this.variant === "condo") this.variant = "lr200";
      if (this.gas < 0.25) this.gas = 1;
      this.caught = false;
      this.onMassDriver = false;
    }
  }

  /**
   * Positions the Roadster on the 310 m Electromagnetic Mass-Driver Track (`x = -26, z = 81`)
   * locked onto the `Launch_Sled` and fires the 3.0g linear-induction catapult along -Z.
   * Hold S / X before z = -165 to test the 60 m Magnetic Brake Terminal + Catch Arms,
   * or stay off the brakes to launch off the rim into the orbital Skyway corridor!
   */
  launchRailgun() {
    this.introTimer = 0;
    this.elevatorOffset = 0;
    this.variant = "railgun";
    this.gas = 1;
    this.autopilot = false;
    this.caught = false;
    this.onStationDeck = false;
    this.grounded = true;
    this.onMassDriver = true;
    this.x = MASS_DRIVER_TRACK.x;
    this.z = MASS_DRIVER_TRACK.startZ - 4;
    this.sledZ = this.z;
    this.y = MASS_DRIVER_TRACK.h + RIDE;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = -18;
    this.speed = 18;
    this.trackEnergyKwh = 0;
    this.railgunTimer = 4.2;
  }

  reset(keepVisits = false) {
    const pad = PADS[0]!;
    this.x = pad.x;
    this.z = pad.z;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.steerAngle = 0;
    this.slipAngle = 0;
    this.suspOffset = 0;
    this.suspVel = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.speed = 0;
    this.gas = 1;
    this.odometerM = 0;
    this.y = terrainHeight(this.x, this.z) + RIDE;
    this.grounded = true;
    this.onStationDeck = false;
    this.stationCapturing = false;
    this.autopilot = false;
    this.railgunTimer = 0;
    this.onMassDriver = false;
    this.sledZ = MASS_DRIVER_TRACK.startZ - 4;
    this.trackEnergyKwh = 0;
    this.gLoad = G / G0;
    this.firing = false;
    this.lifting = false;
    this.descending = false;
    this.boosting = false;
    this.braking = false;
    this.caught = false;
    this.catchBlend = 0;
    this.introTimer = this.introDuration;
    this.elevatorOffset = -3.4;
    this.impact = 0;
    this.hop = 0;
    this.hopPeak = 0;
    if (!keepVisits) this.visited.clear();
  }

  /** Places the Roadster on final orbital approach (or docks directly if already near the station). */
  warpToStationApproach() {
    this.introTimer = 0;
    this.elevatorOffset = 0;
    if (this.variant === "condo") this.variant = "lr200";
    this.gas = 1;
    this.autopilot = false;
    this.railgunTimer = 0;
    this.onMassDriver = false;
    const dist = Math.hypot(
      this.x - ORBITAL_STATION.x,
      this.y - ORBITAL_STATION.dockY,
      this.z - ORBITAL_STATION.z,
    );
    if (dist < 280 && !this.onStationDeck) {
      // Dock directly onto the Tesla Orbital Station Catch Deck
      this.x = ORBITAL_STATION.x;
      this.y = ORBITAL_STATION.dockY;
      this.z = ORBITAL_STATION.z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.speed = 0;
      this.yaw = 0;
      this.pitch = 0;
      this.roll = 0;
      this.grounded = true;
      this.onStationDeck = true;
      this.caught = true;
      this.stationDocked = true;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STATION_KEY, "1");
      }
    } else {
      // Place 185 m out on final orbital approach facing the Tesla Orbital Station
      this.x = ORBITAL_STATION.x;
      this.y = ORBITAL_STATION.dockY - 34;
      this.z = ORBITAL_STATION.z + 185;
      this.yaw = 0;
      this.pitch = 0.18;
      this.roll = 0;
      this.vx = 0;
      this.vy = 14;
      this.vz = -48;
      this.speed = 48;
      this.grounded = false;
      this.onStationDeck = false;
      this.caught = false;
    }
  }

  toggleDoors() {
    this.doorsTarget = this.doorsTarget ? 0 : 1;
  }

  toggleFrunk() {
    this.frunkTarget = this.frunkTarget ? 0 : 1;
  }

  toggleWing() {
    this.wingTarget = this.wingTarget ? 0 : 1;
  }

  toggleLights() {
    this.lightsTarget = this.lightsTarget ? 0 : 1;
  }

  setPaint(idx: number) {
    this.paintIdx = ((idx % PAINTS.length) + PAINTS.length) % PAINTS.length;
  }

  cycleCamera() {
    const order: CamMode[] = ["chase", "orbit", "low", "cockpit"];
    const next = (order.indexOf(this.camMode) + 1) % order.length;
    this.camMode = order[next]!;
  }

  stepAnimations(dt: number) {
    const stepToward = (cur: number, tgt: number, dur: number) =>
      cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), dt / dur);
    this.doorsState = stepToward(this.doorsState, this.doorsTarget, 1.1);
    this.frunkState = stepToward(this.frunkState, this.frunkTarget, 1.1);
    const effectiveWing = this.firing ? 1 : this.wingTarget;
    this.wingState = stepToward(this.wingState, effectiveWing, 0.9);
    this.lightsState = stepToward(this.lightsState, this.lightsTarget, 0.35);
    this.catchBlend = stepToward(this.catchBlend, this.caught ? 1 : 0, 0.45);
    if (!this.onMassDriver) {
      this.sledZ = stepToward(this.sledZ, MASS_DRIVER_TRACK.startZ - 4, 0.04);
    }

    // 4.0-second subterranean garage elevator ascent at Shackleton Garage
    if (this.introTimer > 0) {
      const prevTimer = this.introTimer;
      this.introTimer = Math.max(0, this.introTimer - dt);
      const u = 1 - this.introTimer / this.introDuration; // 0 -> 1 over 4.0 s
      // 0.0 s..0.4 s: blast hatch opens; 0.4 s..3.7 s: smooth hydraulic ascent; 3.7 s..4.0 s: surface lock
      const tLift = Math.max(0, Math.min(1, (u - 0.1) / 0.82));
      const sLift = tLift * tLift * (3 - 2 * tLift);
      this.elevatorOffset = -3.4 * (1 - sLift);
      if (prevTimer > 0.32 && this.introTimer <= 0.32) {
        this.suspVel = -0.38;
        this.impact = 0.25;
      }
      if (this.introTimer === 0) {
        this.elevatorOffset = 0;
      }
    } else {
      this.elevatorOffset = 0;
    }
  }

  private burnRate(mode: "boost" | "air" | "lift"): number {
    if (this.variant === "lr200") {
      if (mode === "boost") return 0.00038;
      if (mode === "air") return 0.00032;
      return 0.00045;
    }
    if (this.variant === "railgun") {
      if (mode === "boost") return 0.0045;
      if (mode === "air") return 0.0032;
      return 0.0055;
    }
    if (mode === "boost") return 0.045;
    if (mode === "air") return 0.032;
    return 0.065;
  }

  step(dt: number, rawInp: DriveInput) {
    dt = Math.min(dt, 0.05);
    const spec = this.spec;
    const dryWithDriver = spec.dryMassKg + STARMAN_MASS_KG;
    const totalMass = dryWithDriver + this.gas * spec.fuelCapacityKg;
    const prevVx = this.vx;
    const prevVy = this.vy;
    const prevVz = this.vz;

    // While rising on the subterranean garage elevator (first 3.4 s), hold position on the lift platform
    if (this.introTimer > 0) {
      const u = 1 - this.introTimer / this.introDuration;
      if (u > 0.85 && (Math.abs(rawInp.throttle) > 0.1 || rawInp.lift || rawInp.boost)) {
        this.introTimer = 0;
        this.elevatorOffset = 0;
      } else {
        const pad = PADS[0]!;
        this.x = pad.x;
        this.z = pad.z;
        this.y = pad.h + RIDE;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.speed = 0;
        this.grounded = true;
        this.caught = false;
        // Still step suspension settle at top of lift
        const springK = 68;
        const dampC = 11.5;
        const suspAccel = -springK * this.suspOffset - dampC * this.suspVel;
        this.suspVel += suspAccel * dt;
        this.suspOffset = Math.max(-0.18, Math.min(0.18, this.suspOffset + this.suspVel * dt));
        this.impact = Math.max(0, this.impact - dt * 2.2);
        return;
      }
    }

    // Cancel autopilot if player gives strong manual steering or brake input
    if (this.autopilot && (Math.abs(rawInp.steer) > 0.35 || rawInp.brake)) {
      this.autopilot = false;
    }

    // Compute autopilot virtual commands if active
    const inp: DriveInput = { ...rawInp };
    if (this.autopilot) {
      if (this.onStationDeck && this.caught) {
        this.autopilot = false;
      } else {
        // Select next waypoint: next Skyway Gate ahead of us, or the Orbital Station Catch Deck
        let wpX = ORBITAL_STATION.x;
        let wpY = ORBITAL_STATION.dockY + 1.2;
        let wpZ = ORBITAL_STATION.z;
        let isFinalTarget = true;
        for (const g of APPROACH_GATES) {
          if (this.z > g.z + 35 && this.y < ORBITAL_STATION.dockY - 120) {
            wpX = g.x;
            wpY = g.y;
            wpZ = g.z;
            isFinalTarget = false;
            break;
          }
        }
        const dx = wpX - this.x;
        const dy = wpY - this.y;
        const dz = wpZ - this.z;
        const horizDist = Math.hypot(dx, dz);
        const desiredYaw = horizDist > 0.5 ? Math.atan2(-dx, -dz) : 0;
        const yawErr = Math.atan2(
          Math.sin(desiredYaw - this.yaw),
          Math.cos(desiredYaw - this.yaw),
        );

        // Steer nose toward waypoint and directly damp yaw error
        this.yaw += yawErr * Math.min(1, dt * 4.5);
        inp.steer = Math.max(-1, Math.min(1, yawErr * 2.4));

        // Closed-loop 3D PD Velocity Guidance (prevents tangential orbiting around the station)
        const dirX = horizDist > 0.2 ? dx / horizDist : 0;
        const dirZ = horizDist > 0.2 ? dz / horizDist : -1;
        const targetHorizSpd = isFinalTarget
          ? horizDist < 4.0
            ? 0
            : Math.min(135, Math.sqrt(2 * 14.5 * horizDist))
          : 125;
        const desiredVx = dirX * targetHorizSpd;
        const desiredVz = dirZ * targetHorizSpd;
        const desiredVy = Math.max(-24, Math.min(62, dy * 0.65));

        const kGuide = 1 - Math.exp(-(isFinalTarget && horizDist < 260 ? 3.8 : 2.2) * dt);
        this.vx += (desiredVx - this.vx) * kGuide;
        this.vz += (desiredVz - this.vz) * kGuide;
        this.vy += (desiredVy + G * dt - this.vy) * kGuide;

        this.grounded = false;
        inp.throttle = horizDist > 8 ? 1 : 0;
        inp.boost = horizDist > 90;
        inp.lift = dy > 2 || !this.onStationDeck;
        inp.descend = dy < -6;
      }
    }

    const lifting = inp.lift && this.gas > 0.0001;
    const descending = inp.descend && !this.grounded;
    const boosting = inp.boost && this.gas > 0.0001;
    this.lifting = lifting;
    this.descending = descending;
    this.boosting = boosting;
    this.braking = inp.throttle < -0.1 || inp.brake;

    const targetSteerAngle = inp.steer * 0.42;
    this.steerAngle += (targetSteerAngle - this.steerAngle) * (1 - Math.exp(-14 * dt));

    // Check if Roadster is riding on the 310 m Electromagnetic Mass-Driver Track
    if (this.onMassDriver) {
      this.x += (MASS_DRIVER_TRACK.x - this.x) * Math.min(1, dt * 16);
      this.yaw *= Math.exp(-12 * dt);
      this.vx = 0;

      if (Math.abs(rawInp.steer) > 0.65 && Math.abs(this.vz) < 25) {
        // Allow steering off the track at low speed
        this.onMassDriver = false;
        this.railgunTimer = 0;
      } else if (this.z > MASS_DRIVER_TRACK.terminalStartZ && !this.braking) {
        // 250 m Linear-Induction Launch Run (3.0 g0 = 29.42 m/s², 0 kg onboard fuel consumed)
        const railAccel = 3.0 * G0; // 29.42 m/s²
        this.vz = Math.max(-145, this.vz - railAccel * dt);
        this.speed = -this.vz;
        this.sledZ = Math.max(MASS_DRIVER_TRACK.terminalStartZ, this.z);
        this.trackEnergyKwh = (0.5 * totalMass * this.speed * this.speed) / 3_600_000;
        this.firing = true;
        this.boosting = true;
        this.railgunTimer = Math.max(0.2, this.railgunTimer - dt);
      } else if (this.braking || this.z <= MASS_DRIVER_TRACK.terminalStartZ) {
        if (this.braking) {
          // 60 m Eddy-Current Magnetic Brake Terminal: arrest velocity toward CatchArm_L/R at catchZ (-217.95 m)
          const distToCatch = this.z - MASS_DRIVER_TRACK.catchZ;
          if (distToCatch > 0.4) {
            const desiredSpd = Math.min(Math.abs(this.vz), Math.sqrt(2 * 32 * distToCatch));
            this.vz = -desiredSpd;
            this.speed = desiredSpd;
          } else {
            this.z = MASS_DRIVER_TRACK.catchZ;
            this.vz = 0;
            this.speed = 0;
            this.railgunTimer = 0;
          }
          this.sledZ = Math.max(MASS_DRIVER_TRACK.terminalStartZ, this.z);
          this.firing = false;
          this.boosting = false;
        } else {
          // Electromagnetic Mass-Driver Ramp Release at z = -165 m -> Ballistic Orbital Skyway Injection!
          this.onMassDriver = false;
          this.grounded = false;
          this.y += 1.6;
          this.vy = 58;
          this.vz = Math.min(this.vz, -126);
          this.speed = -this.vz;
          this.pitch = 0.4;
          this.railgunTimer = 1.8;
        }
      }
    } else if (this.railgunTimer > 0) {
      // Post-release ballistic climb boost
      this.railgunTimer = Math.max(0, this.railgunTimer - dt);
      this.vy += 10.5 * dt;
      this.firing = true;
      this.boosting = true;
    }

    if (!this.onMassDriver) {
      if (this.grounded && !lifting && this.railgunTimer <= 0) {
        // REGIME 1: LUNAR SURFACE DRIVE (Ackermann Bicycle Geometry + 1/6g Regolith Slip Physics)
        let drive = inp.throttle > 0 ? spec.groundAccel : 32;
        if (boosting) {
          drive = spec.boostAccel;
          this.gas = Math.max(0, this.gas - this.burnRate("boost") * dt);
        }
        const effThrottle = inp.brake
          ? -1
          : boosting
            ? Math.max(inp.throttle, 1)
            : inp.throttle;

        // High-g cold-gas retro braking when pressing S while moving forward
        if (effThrottle < -0.1 && this.speed > 1.0) {
          this.speed = Math.max(0, this.speed + effThrottle * 42 * dt);
        } else {
          this.speed += effThrottle * drive * dt;
        }

        if (Math.abs(this.speed) > 0.5 && !boosting && this.variant !== "condo") {
          const distM = Math.abs(this.speed) * dt;
          this.gas = Math.max(0, this.gas - distM / (spec.rangeKm * 1000));
        }
        const drag = inp.brake ? 3.8 : 0.32;
        this.speed *= Math.exp(-drag * dt);
        if (Math.abs(effThrottle) < 0.05 && Math.abs(this.speed) < 0.2) this.speed = 0;
        const maxSpd = boosting ? spec.maxBoostSpeed : spec.maxGroundSpeed;
        this.speed = Math.max(-18, Math.min(maxSpd, this.speed));

        // Progressive speed-sensitive steering (wheelbase L = 2.851 m)
        const absSpd = Math.abs(this.speed);
        const lowSpdRamp = Math.min(1, absSpd / 6);
        const highSpdDamp = 1 / (1 + Math.max(0, absSpd - 22) * 0.011);
        const reverse = this.speed >= -0.2 ? 1 : -1;
        const turnAuthority = absSpd > 0.3 ? Math.max(lowSpdRamp, 0.5) * highSpdDamp : 0;
        this.yaw += inp.steer * 1.95 * turnAuthority * reverse * dt;

        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        const targetVx = fx * this.speed;
        const targetVz = fz * this.speed;

        // Lunar 1/6g regolith lateral grip: blends velocity vector toward nose heading with controllable slip
        const gripRate = absSpd < 12 ? 22 : boosting ? 9.5 : 13.5;
        const gripBlend = 1 - Math.exp(-gripRate * dt);
        this.vx += (targetVx - this.vx) * gripBlend;
        this.vz += (targetVz - this.vz) * gripBlend;

        if (absSpd > 3) {
          const velYaw = Math.atan2(-this.vx, -this.vz);
          this.slipAngle = Math.atan2(
            Math.sin(this.yaw - velYaw),
            Math.cos(this.yaw - velYaw),
          );
        } else {
          this.slipAngle = 0;
        }
        this.firing = boosting;
      } else {
        // REGIME 2: SUB-ORBITAL FLIGHT & RCS MANEUVERING
        if (!this.autopilot) {
          this.yaw += inp.steer * 1.55 * dt;
        }
        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        this.slipAngle *= Math.exp(-4 * dt);

        if (!this.autopilot && (inp.throttle > 0 || boosting) && this.gas > 0) {
          const thrust = boosting ? spec.boostAccel * 0.88 : spec.airAccel;
          const pitchClimb = lifting ? 0.24 : descending ? -0.18 : Math.max(0, this.pitch * 0.45);
          this.vx += fx * thrust * dt;
          this.vz += fz * thrust * dt;
          // Pitch-coupled vertical boost: main engine also aids climb/descent along pitch vector
          this.vy += Math.sin(pitchClimb) * thrust * 0.52 * dt;
          this.gas = Math.max(0, this.gas - this.burnRate(boosting ? "boost" : "air") * dt);
          this.firing = true;
          this.boosting = true;
        } else {
          this.firing = lifting || descending || this.autopilot;
        }

        // Cold-gas RCS Side-Thruster Vector Alignment: rotates airborne velocity vector toward nose heading
        if (!this.autopilot) {
          const fwdVel = this.vx * fx + this.vz * fz;
          if (fwdVel > 1.0) {
            const rcsAlign = 1 - Math.exp(-2.8 * dt);
            this.vx += (fx * fwdVel - this.vx) * rcsAlign;
            this.vz += (fz * fwdVel - this.vz) * rcsAlign;
          }
        }

        if (inp.throttle < 0 || inp.brake) {
          const retroDamp = inp.brake ? 3.2 : 1.95;
          this.vx *= Math.exp(-retroDamp * dt);
          this.vz *= Math.exp(-retroDamp * dt);
        }
        this.vx *= Math.exp(-0.04 * dt);
        this.vz *= Math.exp(-0.04 * dt);
        const horizSpd = Math.hypot(this.vx, this.vz);
        if (horizSpd > spec.maxBoostSpeed) {
          const s = spec.maxBoostSpeed / horizSpd;
          this.vx *= s;
          this.vz *= s;
        }
        this.speed = this.vx * fx + this.vz * fz;
      }

      // Vertical Thrusters: Ventral Lift (Space), Dorsal Descent (Z/Ctrl), & Inertial Hover Damper (H)
      if (!this.autopilot) {
        if (lifting) {
          const climbBoost = boosting ? 1.48 : 1.05;
          this.vy += ((spec.liftNewtons * climbBoost) / totalMass) * dt;
          this.gas = Math.max(0, this.gas - this.burnRate("lift") * dt);
          this.firing = true;
        } else if (descending) {
          const descendThrust = (spec.liftNewtons * 0.75) / totalMass;
          this.vy -= descendThrust * dt;
          if (this.gas > 0) {
            this.gas = Math.max(0, this.gas - this.burnRate("air") * 0.5 * dt);
          }
          this.firing = true;
        } else if (!this.grounded && this.hoverHold && this.railgunTimer <= 0 && this.gas > 0.001) {
          const lunarGroundNow = terrainHeight(this.x, this.z);
          const aglNow = this.y - lunarGroundNow - RIDE;
          const nearStationVert = Math.abs(this.y - ORBITAL_STATION.dockY) < 160;
          if (aglNow > 22 || nearStationVert) {
            this.vy += G * 0.92 * dt;
            this.vy *= Math.exp(-1.35 * dt);
          }
        }
        this.vy -= G * dt;
      }
      this.vy = Math.max(-48, Math.min(spec.maxClimbRate, this.vy));
    }

    // Orbital Magnetic Capture Assist when approaching the Tesla Orbital Station Catch Deck
    const stDx = ORBITAL_STATION.x - this.x;
    const stDy = ORBITAL_STATION.dockY - this.y;
    const stDz = ORBITAL_STATION.z - this.z;
    const stDist3D = Math.hypot(stDx, stDy, stDz);
    const stHorizDist = Math.hypot(stDx, stDz);

    this.stationCapturing = false;
    if (!this.grounded && stDist3D < 110 && !(boosting && rawInp.throttle > 0.5 && stDy < -12)) {
      this.stationCapturing = true;
      const pull = Math.min(1, (110 - stDist3D) / 75);
      this.vx += stDx * 3.4 * pull * dt;
      this.vy += (stDy * 3.8 + G) * pull * dt;
      this.vz += stDz * 3.4 * pull * dt;
      const damp = Math.exp(-3.2 * pull * dt);
      this.vx *= damp;
      this.vy *= damp;
      this.vz *= damp;
    }

    const dx = this.vx * dt;
    const dz = this.vz * dt;
    this.x += dx;
    this.y += this.vy * dt;
    this.z += dz;
    this.odometerM += Math.hypot(dx, dz);

    // Compute instantaneous felt G-load (kinematic acceleration + gravity reaction in Earth g0)
    const ax = (this.vx - prevVx) / Math.max(0.005, dt);
    const ay = (this.vy - prevVy) / Math.max(0.005, dt) + (this.grounded ? G : 0);
    const az = (this.vz - prevVz) / Math.max(0.005, dt);
    const instG = Math.hypot(ax, ay, az) / G0;
    this.gLoad += (instG - this.gLoad) * (1 - Math.exp(-10 * dt));

    const b = RIM_BOUNDS;
    if (spec.unlockFullCrater || this.y > 750) {
      const rho0 = Math.hypot(this.x - b.cx, this.z - b.cz);
      const maxExplorerRho = 28_000;
      if (rho0 > maxExplorerRho) {
        const scale = maxExplorerRho / rho0;
        this.x = b.cx + (this.x - b.cx) * scale;
        this.z = b.cz + (this.z - b.cz) * scale;
        this.vx *= 0.2;
        this.vz *= 0.2;
      }
    } else {
      const rho0 = Math.hypot(this.x - b.cx, this.z - b.cz);
      let theta = Math.atan2(this.x - b.cx, this.z - b.cz);
      let rho = rho0;
      let clamped = false;
      if (rho < b.rhoMin) {
        rho = b.rhoMin;
        clamped = true;
      } else if (rho > b.rhoMax) {
        rho = b.rhoMax;
        clamped = true;
      }
      if (theta > b.thetaMax) {
        theta = b.thetaMax;
        clamped = true;
      } else if (theta < -b.thetaMax) {
        theta = -b.thetaMax;
        clamped = true;
      }
      if (clamped) {
        this.x = b.cx + Math.sin(theta) * rho;
        this.z = b.cz + Math.cos(theta) * rho;
        this.vx *= 0.15;
        this.vz *= 0.15;
      }
    }

    const lunarGround = terrainHeight(this.x, this.z);
    const overStationDeck =
      Math.hypot(this.x - ORBITAL_STATION.x, this.z - ORBITAL_STATION.z) <=
        ORBITAL_STATION.dockR &&
      this.y >= ORBITAL_STATION.dockY - 6.5 &&
      this.vy <= 8.0;

    const effectiveSurface = overStationDeck ? ORBITAL_STATION.dockY : lunarGround;
    const gy = effectiveSurface + RIDE;

    if (this.y <= gy) {
      const hit = Math.max(0, -this.vy);
      if (hit > 1.2) {
        this.impact = Math.min(1, hit / 14);
        this.suspVel -= Math.min(2.2, hit * 0.16);
      }
      this.y = gy;
      this.vy = 0;
      this.grounded = true;
      this.onStationDeck = overStationDeck;
      if (overStationDeck && !this.stationDocked) {
        this.stationDocked = true;
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STATION_KEY, "1");
        }
      }
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.speed = this.vx * fx + this.vz * fz;
      if (this.hopPeak > this.hop) this.hop = this.hopPeak;
      if (this.hopPeak > this.best) {
        this.best = this.hopPeak;
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(BEST_KEY, String(this.best));
        }
      }
      this.hopPeak = 0;
    } else {
      this.grounded = false;
      this.onStationDeck = false;
      const agl = this.y - lunarGround;
      if (agl > this.hopPeak) this.hopPeak = agl;
      if (agl > this.best) {
        this.best = agl;
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(BEST_KEY, String(this.best));
        }
      }
      this.impact *= Math.exp(-4 * dt);
    }

    const springK = 65;
    const dampC = 11;
    this.suspVel += (-springK * this.suspOffset - dampC * this.suspVel) * dt;
    this.suspOffset += this.suspVel * dt;
    this.suspOffset = Math.max(-0.11, Math.min(0.08, this.suspOffset));

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    if (this.grounded) {
      const [nx, , nz] = this.onStationDeck ? [0, 1, 0] : terrainNormal(this.x, this.z);
      const targetPitch = Math.asin(Math.max(-0.45, Math.min(0.45, -(nx * fx + nz * fz))));
      const targetRoll = Math.asin(Math.max(-0.45, Math.min(0.45, nx * rx + nz * rz)));
      const kAtt = 1 - Math.exp(-10 * dt);
      this.pitch += (targetPitch - this.pitch) * kAtt;
      this.roll += (targetRoll - this.roll) * kAtt;
    } else {
      const climbPitch = Math.max(
        -0.34,
        Math.min(0.42, this.vy * 0.0075 + (lifting ? 0.14 : descending ? -0.14 : 0)),
      );
      const airPitch = climbPitch + (inp.throttle > 0 ? -0.04 : inp.throttle < 0 ? 0.05 : 0);
      const airRoll = -inp.steer * 0.22;
      const kAir = 1 - Math.exp(-6 * dt);
      this.pitch += (airPitch - this.pitch) * kAir;
      this.roll += (airRoll - this.roll) * kAir;
    }

    let refilling = false;
    let caught = false;

    if (this.onStationDeck) {
      if (this.gas < 1) {
        this.gas = Math.min(1, this.gas + 0.55 * dt);
        refilling = true;
      }
      if (
        stHorizDist < 6.5 &&
        Math.abs(this.speed) < 1.2 &&
        Math.abs(inp.throttle) < 0.05 &&
        !lifting &&
        !boosting
      ) {
        caught = true;
      }
    }

    // Mass-Driver Track Brake Terminal Catch Arms at (MASS_DRIVER_TRACK.x, MASS_DRIVER_TRACK.catchZ)
    const dTrackCatch = Math.hypot(
      this.x - MASS_DRIVER_TRACK.x,
      this.z - MASS_DRIVER_TRACK.catchZ,
    );
    if (dTrackCatch < 4.2 && this.grounded) {
      if (this.gas < 1) {
        this.gas = Math.min(1, this.gas + 0.5 * dt);
        refilling = true;
      }
      if (
        (spec.hasCatchBottles || spec.hasRailgunSled) &&
        Math.abs(this.speed) < 1.0 &&
        Math.abs(inp.throttle) < 0.05 &&
        !lifting &&
        !boosting
      ) {
        caught = true;
      }
    }

    for (const p of PADS) {
      const d = Math.hypot(this.x - p.x, this.z - p.z);
      if (d < p.r * 0.85 && this.grounded && !this.onStationDeck) {
        if (this.gas < 1) {
          this.gas = Math.min(1, this.gas + 0.35 * dt);
          refilling = true;
        }
        if (p.lodge) this.visited.add(p.id);
        if (
          (spec.hasCatchBottles || spec.hasRailgunSled) &&
          d < 3.6 &&
          Math.abs(this.speed) < 0.8 &&
          Math.abs(inp.throttle) < 0.05 &&
          !lifting &&
          !boosting
        ) {
          caught = true;
        }
      }
    }

    this.caught = caught;
    this._refilling = refilling;
  }

  private _refilling = false;

  snapshot(): Snapshot {
    const spec = this.spec;
    const ground = terrainHeight(this.x, this.z);
    let nearest: Snapshot["nearest"] = null;
    for (const p of LODGES) {
      const dist = Math.hypot(this.x - p.x, this.z - p.z);
      if (!nearest || dist < nearest.dist) nearest = { name: p.name, dist };
    }
    const stationDist = Math.hypot(
      this.x - ORBITAL_STATION.x,
      this.y - ORBITAL_STATION.dockY,
      this.z - ORBITAL_STATION.z,
    );
    const speed3D = Math.hypot(this.vx, this.vy, this.vz);

    const dryWithDriver = spec.dryMassKg + STARMAN_MASS_KG;
    const totalMassKg = dryWithDriver + this.gas * spec.fuelCapacityKg;
    const deltaVRemainingMs =
      spec.ispSeconds * G0 * Math.log(Math.max(1, totalMassKg / dryWithDriver));
    const twrMoon = spec.liftNewtons / (totalMassKg * G);

    // Determine active control regime & docking alignment target
    let controlRegime: ControlRegime = this.grounded ? "SURFACE" : "FLIGHT";
    if (this.autopilot) controlRegime = "AUTOPILOT";
    else if (this.onMassDriver || this.railgunTimer > 0) controlRegime = "RAILGUN";
    else if (
      this.stationCapturing ||
      (stationDist < 120 && !this.grounded) ||
      this.onStationDeck
    ) {
      controlRegime = "DOCKING";
    }

    let dockTarget: Snapshot["dockTarget"] = null;
    if (stationDist < 220) {
      dockTarget = {
        name: "TESLA ORBITAL CATCH DECK",
        dx: ORBITAL_STATION.x - this.x,
        dy: ORBITAL_STATION.dockY - this.y,
        dz: ORBITAL_STATION.z - this.z,
        horizDist: Math.hypot(ORBITAL_STATION.x - this.x, ORBITAL_STATION.z - this.z),
      };
    } else if (
      Math.hypot(this.x - MASS_DRIVER_TRACK.x, this.z - MASS_DRIVER_TRACK.catchZ) < 60
    ) {
      dockTarget = {
        name: "MASS-DRIVER BRAKE TERMINAL",
        dx: MASS_DRIVER_TRACK.x - this.x,
        dy: MASS_DRIVER_TRACK.h + RIDE - this.y,
        dz: MASS_DRIVER_TRACK.catchZ - this.z,
        horizDist: Math.hypot(
          MASS_DRIVER_TRACK.x - this.x,
          MASS_DRIVER_TRACK.catchZ - this.z,
        ),
      };
    } else {
      for (const p of PADS) {
        const hd = Math.hypot(p.x - this.x, p.z - this.z);
        if (hd < 45) {
          const padY = terrainHeight(p.x, p.z) + RIDE;
          dockTarget = {
            name: `${p.name.toUpperCase()} CATCH PAD`,
            dx: p.x - this.x,
            dy: padY - this.y,
            dz: p.z - this.z,
            horizDist: hd,
          };
          if (!this.grounded && hd < 28) controlRegime = "DOCKING";
          break;
        }
      }
    }

    return {
      variant: this.variant,
      variantSpec: spec,
      controlRegime,
      introActive: this.introTimer > 0,
      introProgress: 1 - this.introTimer / this.introDuration,
      elevatorOffset: this.elevatorOffset,
      hoverHold: this.hoverHold,
      autopilot: this.autopilot,
      railgunActive: this.onMassDriver || this.railgunTimer > 0,
      onMassDriver: this.onMassDriver,
      sledZ: this.sledZ,
      slipAngleDeg: (this.slipAngle * 180) / Math.PI,
      totalMassKg,
      deltaVRemainingMs,
      twrMoon,
      gLoad: this.gLoad,
      trackEnergyKwh: this.trackEnergyKwh,
      x: this.x,
      y: this.y,
      z: this.z,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.speed,
      speed3D,
      agl: Math.max(0, this.y - ground - RIDE) + this.catchBlend * 0.3,
      gasKg: this.gas * spec.fuelCapacityKg,
      fuelCapacityKg: spec.fuelCapacityKg,
      rangeRemainingKm: this.gas * spec.rangeKm,
      odometerKm: this.odometerM / 1000,
      grounded: this.grounded,
      firing: this.firing,
      lifting: this.lifting,
      descending: this.descending,
      boosting: this.boosting,
      caught: this.caught,
      onStationDeck: this.onStationDeck,
      stationDocked: this.stationDocked,
      stationDist,
      stationCapturing: this.stationCapturing,
      dockTarget,
      visited: [...this.visited],
      best: this.best,
      hop: Math.max(this.hop, this.hopPeak),
      nearest,
      refilling: this._refilling,
      impact: this.impact,
      doors: this.doorsTarget > 0.5,
      frunk: this.frunkTarget > 0.5,
      wing: this.wingTarget > 0.5,
      lights: this.lightsTarget > 0.5,
      paintIdx: this.paintIdx,
      camMode: this.camMode,
      modelLoaded: this.modelLoaded,
      modelLoadPct: this.modelLoadPct,
    };
  }
}

export const sim = new Sim();

export const LIFT_NEWTONS = CAR_VARIANTS.condo.liftNewtons;
export const CAR_MASS = CAR_VARIANTS.condo.dryMassKg + CAR_VARIANTS.condo.fuelCapacityKg;
export const MOON_G = G;

