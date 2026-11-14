# SOL 7 — Mars Survival Trainer

> A first-person, browser/desktop Mars survival game built for the **NASA Space Apps Challenge** — *Build a Junior Astronaut Mission Trainer*.

**Team Sehnsucht** · Code & engine: **Huraira** · Science & design: **Meerab**

Launch from Earth, fly the retro-propulsive landing yourself, then survive on the Martian surface: salvage the lander, melt ice for water, break rocks for minerals, craft tools, build a research base and grow potatoes in the greenhouse. Ride out a dust storm and a meteor shower, restore power, unlock the data chips from Mission Control, and program your capsule to fly you home. There is no rescue ship: you get yourself back to Earth.

---

## Gameplay at a glance

SOL 7 takes place over seven Sols on Mars. Every Sol is a new problem, and every fix costs something.

| Sol | What happens |
|-----|--------------|
| 1 | Arrival and salvage: recover supplies, melt ice, break rocks, craft a table, build the base from a blueprint hologram |
| 2 | Storm damage: the dust storm hits the solar panels |
| 3 | The long night: survive an EVA in the cold |
| 4 | Isolation storm: a global dust storm blocks the sun |
| 5 | Meteor shower |
| 6 | Going home: get the data chips from Mission Control, power the capsule through an RTG and cable |
| 7 | Launch day: load the last data chip, program the capsule and fly home |

1. **Launch**: countdown, ascent and the trip to Mars with in-game fact captions.
2. **Landing**: fly the lander yourself (thrust, tilt, fine RCS). Crash and retry.
3. **Survive**: oxygen, water, food, power and radiation all pull on each other.
4. **Day and night**: each Sol is about 5 minutes of daylight. At night, stay inside the base or you freeze.
5. **Go home**: unlock the data chips, charge the capsule, program it and launch.

Scientific terms (sol, RTG, MOXIE and others) are explained in the in-game subtitles as you meet them.

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
| `M` | Cycle night-sky facts |
| `R` | Retry (landing, or after death) · `Shift+R` resets the base phase |
| `Esc` | Pause menu (music / sound volume, rendering quality, gamma) |

## Real science in the game

- Martian gravity (3.71 m/s²), planet radius and the **Jezero Crater** landing site
- Water-ice melting with the **latent heat of fusion** (multi-step thermodynamics)
- **MOXIE**-style oxygen production, solar power, dust storms and battery management
- Greenhouse potato farming with watering and nitrate-rich soil (plant-science mechanics)
- Realistic **Phobos and Deimos** (true sizes and angular diameters), Milky Way and meteor showers
- Radiation, RTG power, and in-game fact captions
- Base telemetry screens (weather, power, comms, life support) with REMS/MAVEN-style readouts

> **In-game agency:** In the game, the space agency is the fictional **HMSA (Huraira Meerab Space Agency)**. The values behind the game come from real public space-science data, and every source is credited in `credits.md`.
>
> **Data & credits:** Data sources are listed in full See `credits.md`.

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
| `daynight.js` / `nightsky.js` | Day/night cycle, Sol 2-7 events, data chips, return capsule, night sky and moons |

## Settings

Press `Esc` in-game for music volume, sound volume, rendering quality (Low → Ultra) and gamma. Settings are saved in `localStorage`. **Lower your volume before launch — it is loud!**

## Team

| Name | Role |
|------|------|
| Huraira | Code and engine |
| Meerab | Science, biological mechanics, narrative, UI structure and presentation |

## Acknowledgements

Built for the NASA Space Apps Challenge. The in-game agency is the fictional HMSA. Real space-science data comes from public NASA sources, credited in `credits.md`. This project is independent and not endorsed by NASA.

## License

Add a license before making the repository public (e.g. MIT). Note that NASA media has its own usage guidelines.
