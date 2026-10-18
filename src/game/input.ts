export type CamMode = "chase" | "low" | "orbit" | "cockpit";

export const input = {
  keys: new Set<string>(),
  injected: null as string[] | null,
  steerOverride: null as number | null,
  touchThrottle: 0,
  touchSteer: 0,
  touchLift: false,
  touchDescend: false,
  touchBoost: false,
  running: false,
  orbitYaw: 0.55,
  orbitPitch: 0.28,
  orbitDist: 6.8,
};

export type DriveInput = {
  throttle: number;
  steer: number;
  lift: boolean;
  descend: boolean;
  boost: boolean;
  brake: boolean;
};

function down(code: string): boolean {
  if (input.injected) return input.injected.includes(code);
  return input.keys.has(code);
}

function readGamepad(): {
  throttle: number;
  steer: number;
  lift: boolean;
  descend: boolean;
  boost: boolean;
} | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const rawX = gp.axes[0] ?? 0;
    // Deadzone 0.12; left on stick (rawX < 0) => steer > 0 (+yaw = left)
    const steer = Math.abs(rawX) > 0.12 ? -rawX : 0;
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    const rawY = gp.axes[1] ?? 0;
    let throttle = rt - lt;
    if (Math.abs(throttle) < 0.08 && Math.abs(rawY) > 0.18) {
      throttle = -rawY;
    }
    const lift = Boolean(gp.buttons[0]?.pressed); // A / Cross
    const descend = Boolean(gp.buttons[1]?.pressed); // B / Circle
    const boost = Boolean(gp.buttons[5]?.pressed || gp.buttons[2]?.pressed); // RB or X
    if (
      Math.abs(steer) > 0.01 ||
      Math.abs(throttle) > 0.01 ||
      lift ||
      descend ||
      boost
    ) {
      return { throttle, steer, lift, descend, boost };
    }
  }
  return null;
}

export function readDrive(): DriveInput {
  let throttle = 0;
  if (down("KeyW") || down("ArrowUp")) throttle += 1;
  if (down("KeyS") || down("ArrowDown")) throttle -= 1;
  let steer = 0;
  if (down("KeyA") || down("ArrowLeft")) steer += 1;
  if (down("KeyD") || down("ArrowRight")) steer -= 1;
  if (input.steerOverride !== null) steer = input.steerOverride;

  let gpLift = false;
  let gpDescend = false;
  let gpBoost = false;

  if (!input.injected) {
    const gp = readGamepad();
    if (gp) {
      throttle += gp.throttle;
      steer += gp.steer;
      gpLift = gp.lift;
      gpDescend = gp.descend;
      gpBoost = gp.boost;
    }
    throttle = Math.max(-1, Math.min(1, throttle + input.touchThrottle));
    steer = Math.max(-1, Math.min(1, steer + input.touchSteer));
  }

  const lift = down("Space") || (!input.injected && (input.touchLift || gpLift));
  const descend =
    down("KeyZ") ||
    down("ControlLeft") ||
    down("ControlRight") ||
    (!input.injected && (input.touchDescend || gpDescend));
  const boost =
    down("ShiftLeft") ||
    down("ShiftRight") ||
    down("KeyB") ||
    (!input.injected && (input.touchBoost || gpBoost));
  const brake = down("KeyX");
  return { throttle, steer, lift, descend, boost, brake };
}

