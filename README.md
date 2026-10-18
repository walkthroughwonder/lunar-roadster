# Lunar Roadster · Shackleton Rim to Tesla Orbital Station (2036)

A 1:1 scale 3D Lunar Roadster driving, mass-driver railgun, and orbital flight simulator set at the Shackleton Crater rim on the Lunar South Pole.

## Features

- **4-Second Subterranean Garage Elevator Intro**: Start or reset (`R`) at Shackleton Garage (`PADS[0]`) to watch the Roadster and Starman rise `-3.4 m` from the lit underground garage bay through opening blast doors on a telescoping hydraulic column.
- **All 7 Custom 1:1 `.glb` Models Integrated**:
  - `public/roadster.glb` — **Wing · 15 km** (`RDSTR-N2-15K`) with active swan-neck rear wing (`F`), gull-wing doors (`E`), frunk (`T`), and cold-gas $\text{N}_2$ thrusters.
  - `public/roadster-catch.glb` — **Catch · 200 km** (`RDSTR-CH4-200K`) with redesigned 8-sided brushed-steel $\text{LCH}_4 + \text{LOX}$ cryogenic tanks (`1.6 m × 0.4 m`), 3-section gold MLI foil gaps, frosted steel inner domes, lit blue `LOX` / amber `LCH4` fill-gauge strips, stencilled labels, 8-sided saddle straps, catch collars, and ventral `Bell_CH4LOX` thruster.
  - `public/roadster-railgun.glb` — **Railgun · 250 km** (`RDSTR-EM-250K`) tankless electromagnetic mass-driver variant with ventral `Sled_Plate` and exposed `Hardpoint_L/R` catch pins.
  - `public/starman.glb` — **Rigged Starman** IVA spacesuit seated at the yoke with animated `Head` and `Spine` tracking steering and acceleration.
  - `public/lunar-mass-driver.glb` — **310 m Electromagnetic Mass-Driver Track** ($5 \times 50\text{ m}$ linear-induction rail segments + $60\text{ m}$ eddy-current brake terminal, articulated `CatchArm_L/R`, and moving `Launch_Sled`).
  - `public/tesla-orbital-station.glb` — **443.2 m Empire-State-Building-scale Tesla Orbital Station** with rotating habitats, solar arrays, docking ring, and magnetic capture arms.
  - `public/starship.glb` — **50 m × 9 m SpaceX Starships** (4 radially docked at the Tesla Orbital Station + 1 landed vertically at the South Pole HLS pad).
- **Simulator-Grade Lunar Physics**:
  - Tsiolkovsky rocket mass depletion ($\dot{m} = F / (I_{\text{sp}} g_0)$) with live $\Delta v$ and lunar TWR telemetry.
  - 4-mode control architecture (`ROVER`, `RAILGUN`, `VTOL`, `ORBITAL`) with inertial hover hold (`H`), autopilot flight director (`P`), 3G railgun catapult (`G`), and orbital approach warp (`O`).

## Running Locally

```bash
npm install
npm run dev
```
