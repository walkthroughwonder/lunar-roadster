import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Compass, Flame, Gauge, MapPin, Orbit, RotateCcw, Zap } from "lucide-react";
import { input } from "@/game/input";
import { CAR_VARIANTS, PAINTS, sim, type CarVariantId, type Snapshot } from "@/game/sim";
import { LODGES, MASS_DRIVER_TRACK, ORBITAL_STATION, SURFACE_STARSHIP } from "@/game/world";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [specs, setSpecs] = useState(false);
  const [hud, setHud] = useState<Snapshot>(() => sim.snapshot());
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef({ x: 0, y: 0 });
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    input.running = true;
    sim.triggerIntro();
    let dispose = () => {};
    let cancel = false;
    void import("@/game/mount").then((m) => {
      if (cancel) return;
      dispose = m.startLunar(canvas);
    });
    const id = window.setInterval(() => setHud(sim.snapshot()), 60);
    return () => {
      cancel = true;
      dispose();
      window.clearInterval(id);
    };
  }, []);

  function launch() {
    input.running = true;
    setPlaying(true);
  }

  function reset() {
    input.running = true;
    setPlaying(true);
    sim.reset();
    setHud(sim.snapshot());
  }

  function warpToOrbit() {
    sim.warpToStationApproach();
    input.running = true;
    setPlaying(true);
    setHud(sim.snapshot());
  }

  function fireRailgun() {
    sim.launchRailgun();
    input.running = true;
    setPlaying(true);
    setHud(sim.snapshot());
  }

  function toggleAutopilot() {
    sim.toggleAutopilot();
    input.running = true;
    setPlaying(true);
    setHud(sim.snapshot());
  }

  function selectVariant(v: CarVariantId) {
    sim.setVariant(v);
    if (Math.hypot(sim.x, sim.z) < 9.5 && sim.grounded) {
      sim.triggerIntro();
    }
    setHud(sim.snapshot());
  }

  function setStick(clientX: number, clientY: number, el: HTMLDivElement) {
    const r = el.getBoundingClientRect();
    let dx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    knob.current = { x: dx, y: dy };
    setKnobPos({ x: dx, y: dy });
    input.touchSteer = -dx;
    input.touchThrottle = -dy;
  }

  function endStick() {
    knob.current = { x: 0, y: 0 };
    setKnobPos({ x: 0, y: 0 });
    input.touchSteer = 0;
    input.touchThrottle = 0;
  }

  const kmh = Math.max(Math.abs(hud.speed), hud.speed3D) * 3.6;
  const heading = ((-hud.yaw * 180) / Math.PI + 3600) % 360;
  const gasPct = Math.round((hud.gasKg / Math.max(1, hud.fuelCapacityKg)) * 100);
  const rangePct = Math.round(
    (hud.rangeRemainingKm / Math.max(1, hud.variantSpec.rangeKm)) * 100,
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-void text-dust">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 md:p-6">
        <div className="rounded-2xl border border-line bg-ink/80 px-4 py-2.5 backdrop-blur-md">
          <p className="font-mono text-xs tracking-[0.22em] text-ice">
            SHACKLETON · 2036 · {hud.variantSpec.code} · MODE: {hud.controlRegime}
          </p>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Lunar Roadster{" "}
            <span className="font-mono text-sm font-normal text-ice">
              ({hud.variantSpec.rangeKm} km)
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-mute">
            {hud.visited.length}/{LODGES.length} lodges ·{" "}
            <span className={hud.stationDocked ? "text-ice font-semibold" : "text-ember"}>
              {hud.onStationDeck
                ? "ON TESLA ORBITAL DECK (443.2m)"
                : hud.stationDocked
                  ? "TESLA ORBITAL DOCKED ✓"
                  : `GOAL: TESLA ORBITAL (${(hud.stationDist / 1000).toFixed(2)} km)`}
            </span>
            {hud.autopilot ? " · flight director autopilot" : ""}
            {hud.railgunActive ? " · 3G mass-driver railgun" : ""}
            {hud.onMassDriver && !hud.railgunActive ? " · on mass-driver rail" : ""}
            {hud.stationCapturing ? " · magnetic capture" : ""}
            {hud.caught ? " · catch arms latched (+30 cm)" : ""}
            {hud.refilling && !hud.caught ? " · refilling" : ""}
            {!hud.grounded ? ` · Vy ${hud.vy >= 0 ? "+" : ""}${hud.vy.toFixed(1)} m/s` : ""}
            {!hud.modelLoaded ? ` · loading 3D ${hud.modelLoadPct}%` : ""}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex h-11 items-center rounded-full border border-line bg-ink/80 p-1 text-xs backdrop-blur-sm"
            title="Switch Roadster version (V)"
          >
            {(Object.keys(CAR_VARIANTS) as CarVariantId[]).map((vid) => {
              const spec = CAR_VARIANTS[vid];
              const active = hud.variant === vid;
              return (
                <button
                  key={vid}
                  type="button"
                  onClick={() => selectVariant(vid)}
                  className={`h-9 rounded-full px-3 font-mono text-xs transition ${
                    active
                      ? vid === "lr200"
                        ? "bg-ice text-void font-semibold"
                        : "bg-ember text-void font-semibold"
                      : "text-dust/80 hover:text-dust"
                  }`}
                >
                  {spec.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleAutopilot}
            className={`flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium backdrop-blur-sm transition ${
              hud.autopilot
                ? "border-ice bg-ice text-void font-semibold"
                : "border-line bg-ink/80 text-dust hover:border-ice/50"
            }`}
            title="Toggle Skyway & Orbital Autopilot Flight Director (P)"
          >
            <Compass className="size-3.5" />
            <span>{hud.autopilot ? "Autopilot ON" : "Autopilot (P)"}</span>
          </button>
          <button
            type="button"
            onClick={fireRailgun}
            className="flex h-11 items-center gap-1.5 rounded-full border border-ember/50 bg-ember/15 px-3 text-sm font-medium text-ember backdrop-blur-sm hover:bg-ember/25"
            title="Launch 3G Electromagnetic Mass-Driver Catapult (G)"
          >
            <Zap className="size-3.5" />
            <span>Railgun (G)</span>
          </button>
          <button
            type="button"
            onClick={warpToOrbit}
            className="flex h-11 items-center gap-1.5 rounded-full border border-ice/50 bg-ice/15 px-3 text-sm font-medium text-ice backdrop-blur-sm hover:bg-ice/25"
            title="Warp to Tesla Orbital Station approach / Dock (O)"
          >
            <Orbit className="size-3.5" />
            <span>{hud.stationDist < 280 && !hud.onStationDeck ? "Dock Station" : "Orbit (O)"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sim.cycleCamera();
              setHud(sim.snapshot());
            }}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line bg-ink/80 px-3 text-sm text-dust backdrop-blur-sm"
            title="Cycle camera (C)"
          >
            <Camera className="size-3.5 text-ice" />
            <span className="capitalize">{hud.camMode}</span>
          </button>
          <a
            href="/lunar-roadster-source.zip"
            download="lunar-roadster-source.zip"
            className="grid h-11 place-items-center rounded-full border border-line bg-ink/80 px-3 text-sm text-dust backdrop-blur-sm"
          >
            Code
          </a>
          <button
            type="button"
            onClick={() => setSpecs((v) => !v)}
            className="h-11 rounded-full border border-line bg-ink/80 px-3 text-sm text-dust backdrop-blur-sm"
          >
            Specs
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset to garage"
            className="grid size-11 place-items-center rounded-full border border-line bg-ink/80 text-dust backdrop-blur-sm"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </header>

      {/* Non-blocking 4-second subterranean garage elevator telemetry pill */}
      {hud.introActive && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-ice/40 bg-ink/80 px-4 py-1.5 font-mono text-xs text-ice backdrop-blur-md">
          SUBTERRANEAN GARAGE BAY · BLAST DOORS OPEN · LIFT{" "}
          {Math.round(hud.introProgress * 100)}%
        </div>
      )}

      {/* SpaceX Dragon-style RCS Docking Alignment Reticle when approaching Orbital Station or Catch Pad */}
      {playing &&
        !hud.introActive &&
        hud.dockTarget &&
        (!hud.grounded || hud.onStationDeck || hud.caught) && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-2xl border border-ice/40 bg-ink/75 px-4 py-2.5 font-mono text-xs backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 text-[11px] tracking-wider text-ice">
            <span>{hud.dockTarget.name}</span>
            <span>
              {hud.caught
                ? "LATCHED (+30 CM)"
                : hud.stationCapturing
                  ? "MAGNETIC CAPTURE"
                  : "RCS ALIGN"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-dust">
            <span>ΔH {hud.dockTarget.horizDist.toFixed(1)}m</span>
            <span>
              ΔY {hud.dockTarget.dy >= 0 ? "+" : ""}
              {hud.dockTarget.dy.toFixed(1)}m
            </span>
            <span>
              Vy {hud.vy >= 0 ? "+" : ""}
              {hud.vy.toFixed(1)} m/s
            </span>
          </div>
        </div>
      )}

      <section className="pointer-events-none absolute right-4 top-24 w-56 space-y-2 font-mono text-xs md:right-6 md:top-28 md:w-64 md:text-sm">
        <Meter icon={<Gauge className="size-3.5" />} label="Speed" value={`${kmh.toFixed(0)} km/h`} />
        <Meter icon={<Flame className="size-3.5" />} label="Altitude" value={`${hud.agl.toFixed(1)} m`} />
        <Meter
          icon={<Orbit className="size-3.5 text-ice" />}
          label="Tesla Station"
          value={
            hud.onStationDeck
              ? "DOCKED"
              : hud.stationDist < 1000
                ? `${hud.stationDist.toFixed(0)} m`
                : `${(hud.stationDist / 1000).toFixed(2)} km`
          }
        />
        <div className="rounded-xl border border-line bg-panel px-3 py-2 backdrop-blur-sm">
          <div className="mb-1 flex justify-between text-mute">
            <span>Range</span>
            <span className="text-dust">
              {hud.rangeRemainingKm.toFixed(1)} / {hud.variantSpec.rangeKm} km
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink">
            <div
              className={`h-full ${hud.variant === "lr200" ? "bg-ice" : "bg-ember"}`}
              style={{ width: `${rangePct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3 py-2 backdrop-blur-sm">
          <div className="mb-1 flex justify-between text-mute">
            <span>{hud.variantSpec.propellantName}</span>
            <span className="text-dust">
              {hud.gasKg.toFixed(0)} / {hud.fuelCapacityKg} kg
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink">
            <div
              className={`h-full ${hud.variant === "lr200" ? "bg-ice" : "bg-ember"}`}
              style={{ width: `${gasPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3 py-2 text-xs backdrop-blur-sm">
          <div className="flex justify-between text-mute">
            <span>Mass {hud.totalMassKg.toFixed(0)} kg</span>
            <span className="text-ice">Δv {hud.deltaVRemainingMs.toFixed(0)} m/s</span>
          </div>
          <div className="mt-0.5 flex justify-between text-mute">
            <span>TWR {hud.twrMoon.toFixed(2)} (Moon)</span>
            <span>G-Load {hud.gLoad.toFixed(2)}g</span>
          </div>
          {(hud.onMassDriver || hud.trackEnergyKwh > 0.05) && (
            <div className="mt-0.5 flex justify-between text-ember">
              <span>Mass-Driver Sled</span>
              <span>{hud.trackEnergyKwh.toFixed(1)} kWh</span>
            </div>
          )}
          <p className="mt-1 border-t border-line/60 pt-1 text-mute">
            HDG {heading.toFixed(0).padStart(3, "0")}° · {hud.controlRegime}
            {hud.hoverHold ? " · HOVER" : ""}
          </p>
          <p className="mt-0.5 text-mute">
            Odo {hud.odometerKm.toFixed(2)} km · Best alt {hud.best.toFixed(0)} m
          </p>
          {hud.onStationDeck && (
            <p className="mt-1 font-semibold text-ice">
              Docked on Tesla Orbital Station (443.2 m · 4 Starships)
            </p>
          )}
          {hud.caught && !hud.onStationDeck && (
            <p className="mt-1 text-ice">Catch arms locked — quick-disconnect refill active</p>
          )}
          {hud.gasKg < 15 && !hud.refilling && hud.fuelCapacityKg > 0 && (
            <p className="mt-1 text-ember">Tanks low — roll onto a pad</p>
          )}
        </div>
      </section>

      <Minimap
        x={hud.x}
        z={hud.z}
        yaw={hud.yaw}
        visited={hud.visited}
        stationDocked={hud.stationDocked}
      />

      {specs && (
        <aside className="absolute bottom-28 left-4 z-10 w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-ink/90 p-4 text-sm shadow-lg backdrop-blur-md md:bottom-auto md:top-28 md:left-6">
          <p className="font-mono text-xs tracking-[0.18em] text-ice">
            RDSTR · {hud.variantSpec.code} · {hud.controlRegime} · Isp {hud.variantSpec.ispSeconds}s
          </p>
          <p className="mt-1 font-medium text-dust">{hud.variantSpec.label}</p>
          <p className="mt-1 text-xs text-mute">{hud.variantSpec.subtitle}</p>
          <ul className="mt-3 space-y-1.5 text-xs text-dust/95">
            <li>
              <strong>1:1 Simulator Physics &amp; Scale:</strong>
              <ul className="mt-1 ml-3 list-disc space-y-0.5 text-mute">
                <li>
                  <strong className="text-dust">Tsiolkovsky Rocket Equation:</strong> Instantaneous
                  mass m(t) = {hud.variantSpec.dryMassKg} kg dry + 110 kg Starman + propellant,
                  exhaust velocity v_e = I_sp · g₀, live Δv &amp; lunar TWR
                </li>
                <li>
                  <strong className="text-dust">310 m Mass-Driver Track (`lunar-mass-driver.glb`):</strong>{" "}
                  5 × 50 m linear-induction rail segments + 60 m eddy-current brake terminal &amp;
                  moving Launch Sled (3.0 g₀ catapult, press G or drive onto x = -26 m)
                </li>
                <li>
                  <strong className="text-dust">443.2 m Tesla Orbital Station &amp; 5 Starships:</strong>{" "}
                  Empire State Building scale station (`tesla-orbital-station.glb`) with 4 radially
                  docked 50 m × 9 m Starships (`starship.glb`) + 1 landed at the South Pole HLS pad
                </li>
              </ul>
            </li>
            {hud.variant === "lr200" ? (
              <li>
                <strong>Catch · 200 km (`roadster-catch.glb`):</strong> Redesigned 8-sided
                brushed-steel LCH₄ + LOX jacket tanks (1.6 m × 0.4 m) with 3-section gold MLI foil
                gaps, frosted steel inner domes, lit blue LOX / amber LCH4 70% fill bars, stencilled
                labels, 8-sided saddle straps &amp; under-tail <strong>Bell_CH4LOX</strong>
              </li>
            ) : hud.variant === "railgun" ? (
              <li>
                <strong>Railgun · 250 km (`roadster-railgun.glb`):</strong> Tankless electromagnetic
                launch vehicle with ventral <strong>Sled_Plate</strong> induction shoe &amp; exposed{" "}
                <strong>Hardpoint_L/R</strong> brake catch pins
              </li>
            ) : (
              <li>
                <strong>Wing · 15 km (`roadster.glb`):</strong> Deployable swan-neck wing (F), 250 kg
                cold-gas N₂ thrusters, gull-wing doors (E), frunk (T), rigged{" "}
                <strong>Starman (`starman.glb`)</strong> at the yoke
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-mute">
            Gamepad supported (Left stick steer, RT/LT throttle, A lift, B descend, RB boost).
          </p>
        </aside>
      )}

      {playing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex flex-wrap items-center justify-center gap-2 px-4 md:bottom-11">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-line bg-ink/85 px-3 py-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                sim.toggleVariant();
                setHud(sim.snapshot());
              }}
              className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition ${
                hud.variant === "lr200"
                  ? "bg-ice text-void"
                  : "bg-ember/25 text-ember hover:bg-ember/35"
              }`}
              title="Cycle Roadster variant (V)"
            >
              {hud.variantSpec.label}
            </button>
            <div className="mx-0.5 h-4 w-px bg-line" />
            <button
              type="button"
              onClick={() => {
                sim.toggleHoverHold();
                setHud(sim.snapshot());
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                hud.hoverHold ? "bg-ice/25 text-ice" : "text-mute hover:bg-panel"
              }`}
              title="Toggle Inertial RCS Hover Damper (H)"
            >
              Hover (H)
            </button>
            <button
              type="button"
              onClick={toggleAutopilot}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                hud.autopilot ? "bg-ice text-void font-semibold" : "text-dust hover:bg-panel"
              }`}
              title="Toggle Skyway & Orbital Autopilot (P)"
            >
              Autopilot (P)
            </button>
            <div className="mx-0.5 h-4 w-px bg-line" />
            <button
              type="button"
              onClick={() => {
                sim.toggleDoors();
                setHud(sim.snapshot());
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                hud.doors ? "bg-ember text-void" : "text-dust hover:bg-panel"
              }`}
            >
              Doors
            </button>
            <button
              type="button"
              onClick={() => {
                sim.toggleFrunk();
                setHud(sim.snapshot());
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                hud.frunk ? "bg-ember text-void" : "text-dust hover:bg-panel"
              }`}
            >
              Frunk
            </button>
            {hud.variantSpec.hasWing && (
              <button
                type="button"
                onClick={() => {
                  sim.toggleWing();
                  setHud(sim.snapshot());
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  hud.wing ? "bg-ember text-void" : "text-dust hover:bg-panel"
                }`}
              >
                Wing
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                sim.toggleLights();
                setHud(sim.snapshot());
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                hud.lights ? "bg-ember text-void" : "text-dust hover:bg-panel"
              }`}
            >
              Lights
            </button>
            <div className="mx-1 h-4 w-px bg-line" />
            <div className="flex items-center gap-1.5">
              {PAINTS.map((p, idx) => (
                <button
                  key={p.name}
                  type="button"
                  title={`${p.name} paint`}
                  aria-label={`${p.name} paint`}
                  onClick={() => {
                    sim.setPaint(idx);
                    setHud(sim.snapshot());
                  }}
                  className={`size-5 rounded-full border transition ${
                    hud.paintIdx === idx ? "scale-110 border-dust" : "border-line opacity-80"
                  }`}
                  style={{ backgroundColor: p.css }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {playing && (
        <div className="absolute inset-x-0 bottom-4 flex items-end justify-between px-4 md:hidden">
          <div
            ref={stick}
            className="relative size-28 touch-none rounded-full border border-line bg-ink/70 backdrop-blur-sm"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setStick(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              setStick(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerUp={endStick}
            onPointerCancel={endStick}
          >
            <span
              className="absolute size-12 rounded-full bg-dust/90"
              style={{
                left: `calc(50% + ${knobPos.x * 32}px)`,
                top: `calc(50% + ${knobPos.y * 32}px)`,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="grid size-16 place-items-center rounded-full border border-line bg-ink/80 text-[11px] font-semibold tracking-wide text-dust"
              onPointerDown={() => {
                input.touchDescend = true;
              }}
              onPointerUp={() => {
                input.touchDescend = false;
              }}
              onPointerLeave={() => {
                input.touchDescend = false;
              }}
              onPointerCancel={() => {
                input.touchDescend = false;
              }}
            >
              DOWN
            </button>
            <button
              type="button"
              className="grid size-20 place-items-center rounded-full border border-ice bg-ice/20 text-xs font-semibold tracking-wide text-ice"
              onPointerDown={() => {
                input.touchBoost = true;
              }}
              onPointerUp={() => {
                input.touchBoost = false;
              }}
              onPointerLeave={() => {
                input.touchBoost = false;
              }}
              onPointerCancel={() => {
                input.touchBoost = false;
              }}
            >
              BOOST
            </button>
            <button
              type="button"
              className="grid size-20 place-items-center rounded-full border border-ember bg-ember/20 text-sm font-semibold tracking-wide text-ember"
              onPointerDown={() => {
                input.touchLift = true;
              }}
              onPointerUp={() => {
                input.touchLift = false;
              }}
              onPointerLeave={() => {
                input.touchLift = false;
              }}
              onPointerCancel={() => {
                input.touchLift = false;
              }}
            >
              LIFT
            </button>
          </div>
        </div>
      )}

      {playing && (
        <p className="pointer-events-none absolute bottom-2.5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-ink/80 px-4 py-1 font-mono text-xs text-mute backdrop-blur-md md:block">
          W/S drive · A/D steer · Space climb · Z/Ctrl descend · Shift boost · H hover · P autopilot · G railgun · O orbit · C cam
        </p>
      )}

      {!playing && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-void via-void/75 to-transparent p-4 md:items-center md:bg-void/40">
          <div className="fade-rise w-full max-w-lg rounded-3xl border border-line bg-ink/90 p-6 backdrop-blur-md md:p-8">
            <p className="font-mono text-xs tracking-[0.22em] text-ice">
              SHACKLETON RIM · MASS-DRIVER · TESLA ORBITAL STATION
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Leave the dust.</h2>
            <p className="mt-3 text-sm text-mute">
              Drive all three 1:1 Lunar Roadsters with{" "}
              <strong className="text-dust">Starman</strong> at the yoke — featuring the redesigned
              8-sided brushed-steel <span className="text-dust">LCH₄ + LOX</span> tanks with gold
              MLI foil and lit fill gauges, the <strong>310 m Mass-Driver Track</strong>, and the{" "}
              <strong>443.2 m Tesla Orbital Station</strong> with{" "}
              <strong>5 SpaceX Starships</strong>.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(Object.keys(CAR_VARIANTS) as CarVariantId[]).map((vid) => {
                const spec = CAR_VARIANTS[vid];
                const active = hud.variant === vid;
                return (
                  <button
                    key={vid}
                    type="button"
                    onClick={() => selectVariant(vid)}
                    className={`rounded-2xl border p-2.5 text-left transition ${
                      active
                        ? vid === "lr200"
                          ? "border-ice bg-ice/15 text-dust"
                          : "border-ember bg-ember/15 text-dust"
                        : "border-line bg-panel/60 text-mute hover:text-dust"
                    }`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-ice">
                      {spec.code}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-dust">{spec.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-mute">
                      {spec.fuelCapacityKg > 0
                        ? `${spec.fuelCapacityKg} kg ${spec.propellantName}`
                        : spec.propellantName}
                    </p>
                  </button>
                );
              })}
            </div>
            <ul className="mt-4 space-y-1 font-mono text-xs text-dust/90">
              <li className="flex items-center gap-2 text-ice">
                <Orbit className="size-3.5" /> Ascend through the skyway rings (or press P / G / O)
                to dock at the 443.2 m Tesla Orbital Station
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="size-3.5 text-ember" /> Check in at all four Shackleton rim lodges
                &amp; inspect the landed 50 m Starship HLS
              </li>
              <li>Pad, Station &amp; Mass-Driver Catch Arms latch the collars (+30 cm)</li>
              <li className="md:hidden">Stick to drive · Lift / Down / Boost for 3D flight</li>
              <li className="hidden md:list-item">
                WASD drive · Space climb · Z/Ctrl descend · Shift boost · P autopilot · G railgun
              </li>
            </ul>
            <button
              type="button"
              onClick={launch}
              className="mt-6 h-12 w-full rounded-full bg-ember text-base font-semibold text-void"
            >
              Start ({hud.variantSpec.label})
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Meter({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 backdrop-blur-sm">
      <span className="flex items-center gap-1.5 text-mute">
        {icon}
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function Minimap({
  x,
  z,
  yaw,
  visited,
  stationDocked,
}: {
  x: number;
  z: number;
  yaw: number;
  visited: string[];
  stationDocked: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(16,20,26,0.72)";
    g.fillRect(0, 0, w, h);
    const span = 3800;
    const scale = w / span;
    const toX = (wx: number) => w / 2 + (wx - x) * scale;
    const toY = (wz: number) => h / 2 + (wz - z) * scale;
    g.strokeStyle = "#2c3644";
    g.strokeRect(8, 8, w - 16, h - 16);

    // 310 m Mass-Driver Track line
    g.strokeStyle = "#e3a14a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(toX(MASS_DRIVER_TRACK.x), toY(MASS_DRIVER_TRACK.startZ));
    g.lineTo(toX(MASS_DRIVER_TRACK.x), toY(MASS_DRIVER_TRACK.endZ));
    g.stroke();

    // Landed South Pole HLS Starship pad marker
    g.strokeStyle = "#8fbfc9";
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(toX(SURFACE_STARSHIP.x), toY(SURFACE_STARSHIP.z), 3.5, 0, Math.PI * 2);
    g.stroke();

    for (const p of LODGES) {
      g.fillStyle = visited.includes(p.id) ? "#8fbfc9" : "#e3a14a";
      g.beginPath();
      g.arc(toX(p.x), toY(p.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    // Tesla Orbital Station marker
    const sx = Math.max(14, Math.min(w - 14, toX(ORBITAL_STATION.x)));
    const sy = Math.max(14, Math.min(h - 14, toY(ORBITAL_STATION.z)));
    g.strokeStyle = stationDocked ? "#6ce2ff" : "#ff4a3a";
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(sx, sy, 6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#6ce2ff";
    g.beginPath();
    g.arc(sx, sy, 2.5, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.translate(toX(x), toY(z));
    g.rotate(-yaw);
    g.fillStyle = "#e6e0d4";
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
  }, [x, z, yaw, visited, stationDocked]);

  return (
    <canvas
      ref={ref}
      width={148}
      height={148}
      className="pointer-events-none absolute bottom-4 left-4 hidden rounded-2xl border border-line md:block"
    />
  );
}

