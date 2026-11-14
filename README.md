[README.md](https://github.com/user-attachments/files/34851392/README.md)
# SOL 7 — Mars Survival Trainer

> A first-person, browser/desktop Mars survival game built for the **NASA Space Apps Challenge** — *Build a Junior Astronaut Mission Trainer*.

**Team Sehnsucht** · Code & engine: **Huraira** · Science & design: **Meerab**

Launch from Earth, fly the retro-propulsive landing yourself, then survive on the Martian surface: melt ice for water, break rocks for minerals, craft tools, build a research base, grow potatoes in the greenhouse, and keep the crew alive through dust storms, solar flares and equipment failures until the supply ship arrives on **Sol 30**.

---

## Gameplay at a glance

1. **Launch** — countdown, ascent and a cinematic trip to Mars with NASA fact captions.
2. **Landing** — fly the lander yourself (thrust, tilt, fine RCS). Crash and retry.
3. **Sol 1: Arrival & Salvage** — salvage the descent stage, melt ice into drinking water, break rocks, deploy a crafting table and build the base from a blueprint hologram.
4. **Sols 2–30: Campaign** — one unique event per Sol, each with station objectives:

   | Sols | Examples |
   |------|----------|
   | 2–4  | Dust-storm damage, storm pre-warning, global isolation storm |
   | 5–9  | Pressure leak, crop blight, battery overload, seismic tremor, filter clog |
   | 10–18 | Comms alignment, rover battery, drone scouting, O₂ tank drift, solar flare, hydroponic yield |
   | 19–28 | Second storm, comms outage, biomass power, long rover traverse, deep ice drill, MOXIE output |
   | 29–30 | Final preparations and Mission Day |

5. **Day / night** — each Sol is ~5 minutes of daylight. At night, stay **inside** the base for 25 s to reach dawn; outside, you freeze.
6. **Win** — complete Sol 30 and the supply ship is on its way.

Keep an eye on **oxygen, water, food, base power, health and radiation** — warnings fire below 25%.

## Controls

| Key | Action |
|-----|--------|
| `W` / `A` / `D` / `Space` | Lander: thrust / tilt / fine RCS |
| `W A S D` + mouse | Walk and look (click to capture mouse) |
| `E` | Interact (scoop ice, load crucible, use stations, open chest) |
| `F` | Deploy the thermal crucible |
| `G` | Deploy / pick up the crafting table |
| `Q` | Use held item (oxygen, food, health, anti-radiation) |
| `Tab` / `B` | Backpack (15 stacks, 4-slot hotbar, `1`–`4` to assign) |
| `Left-click` | Swing hammer / hold to weld with the torch |
| `N` | Show / hide base blueprint hologram |
| `M` | Cycle NASA night-sky facts |
| `R` | Retry (landing, or after death) · `Shift+R` resets the base phase |
| `Esc` | Pause menu (music / sound volume, rendering quality, gamma) |

## Real science in the game

- Martian gravity (3.71 m/s²), planet radius and the **Jezero Crater** landing site
- Water-ice melting with the **latent heat of fusion** (multi-step thermodynamics)
- **MOXIE**-style oxygen production, solar power, dust storms and battery management
- Greenhouse potato farming with watering and nitrate-rich soil (plant-science mechanics)
- Realistic **Phobos and Deimos** (true sizes and angular diameters), Milky Way and meteor showers
- Radiation / solar-flare events and in-game NASA fact captions
- Base telemetry screens (weather, power, comms, life support) with REMS/MAVEN-style readouts

> **Data & credits:** list every NASA dataset, image or fact source used here (e.g. NASA 3D Resources, NASA Trek, Perseverance/Curiosity weather logs, ECLSS consumption figures, DONKI, OSDR). See `credits.md`.

## Tech stack

- [Three.js](https://threejs.org/) `^0.170` — all 3D rendering (WebGL), procedural geometry and GPU shaders
- Electron — desktop wrapper (`main.js` → `launch.html`)
- electron-builder — Windows portable `.exe`
- Procedural music and sound via the Web Audio API (no audio files)
- Plain ES modules, no bundler

## Project structure

| File | Purpose |
|------|---------|
| `main.js` | Electron entry point |
| `launch.html` | Page shell, HUD and import map |
| `menu.js` | Animated main menu, music, settings and pause menu |
| `loading.js` | Loading screen |
| `launch.js` | Rocket launch and renderer setup |
| `mars.js` | Approach, entry, landing and surface phase |
| `tasks.js` | Surface tasks, tools and backpack |
| `crafting.js` | Crafting table, recipes, blueprint hologram, welding torch |
| `base.js` / `basebuild.js` / `basescreens.js` | Base state machine, geometry, telemetry screens |
| `farm.js` | Greenhouse potato farm |
| `daynight.js` / `nightsky.js` | Day/night cycle, Sol counter, night survival, night sky and moons |

