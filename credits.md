# Project Credits & Asset Licenses

**Project:** SOL 7 — Mars Survival Trainer
**Team:** Team Sehnsucht (2026 NASA Space Apps Challenge)
**Challenge:** Build a Junior Astronaut Mission Trainer

In the game, the space agency is the fictional **HMSA (Huraira Meerab Space Agency)**. The NASA name is not used in-game. This is an independent project and is not endorsed by NASA.

---

## 1. NASA Open Data & Scientific Sources

SOL 7 is a scripted game, but its values come from real NASA data. The numbers were collected from the sources below and built into the game as static reference data. The game makes no live API calls, and nothing here is presented as live. No NASA images, 3D models, logos or video files are bundled.

| Source | Used for | Link |
|---|---|---|
| NASA DONKI (Space Weather Database) | Space weather, solar activity and radiation values | https://ccmc.gsfc.nasa.gov/tools/DONKI |
| NASA Open Science Data Repository (OSDR) | Radiation dosimetry and space plant research | https://osdr.nasa.gov/bio/repo |
| NASA Mars Trek | Mars surface and Jezero Crater terrain | https://trek.nasa.gov/mars/ |
| Curiosity REMS weather data (NASA PDS Atmospheres Node) | Surface weather, pressure and temperature | https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html |
| NASA MOXIE oxygen experiment | Oxygen production mechanic | https://www.nasa.gov/missions/mars-2020-perseverance/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/ |
| NASA Mars 2020 Perseverance rover data (PDS), including MEDA weather | Jezero weather and rover data | https://pds-geosciences.wustl.edu/missions/mars2020 |
| NASA Mars moons: Phobos and Deimos facts | Moon sizes and night sky | https://science.nasa.gov/mars/moons/facts |
| NASA Deimos | Deimos size and details | https://science.nasa.gov/mars/moons/deimos/ |

In-game fact captions and subtitles are written by the team from NASA public information and are shown as HMSA facts.

> NASA content is generally not subject to copyright in the United States. NASA logos, flags and mission identifiers are not used.

---

## 2. Code & Game Engine

* **Three.js** (MIT license), 3D rendering, geometry and shaders: https://threejs.org/
* **Electron** (MIT license), desktop wrapper: https://www.electronjs.org/
* **electron-builder** (MIT license), Windows packaging: https://www.electron.build/
* **Web Audio API**, in-browser sound synthesis.
* **Language:** JavaScript (ES modules), HTML and CSS, no bundler.
* **Source code:** https://github.com/noobtonightmare-byte/SOL-7-survive-the-red-planet
* **Game code:** written by Team Sehnsucht.

---

## 3. UI, Art & Audio Assets

* **Art:** All 3D models, terrain, textures, skies, moons and UI are generated in code. No third-party art files are used, and no image carries an SI watermark because none is SI-generated.
* **Audio:** Music and ambience are synthesized in real time with the Web Audio API. No audio files or samples are used.
* **Fonts:** System fonts only (Segoe UI, Consolas, Impact, Arial).
* **Logo:** The HMSA logo was made by the team.

---

## 4. Super Intelligence (SI) Use

In line with the Space Apps SI policy:

* **Code:** SI chatbots were used for coding help, debugging and troubleshooting, including a helper script (`scripts/vendor-three.js`) that copies Three.js into the project.
* **Writing and presentation text:** SI was used to help write and edit documentation and presentation text, including the README, this credits file, the feature list and the slide and form wording.
* **Images, video and audio:** No SI was used. All visuals and sound are generated in code.
* **Game design, science content and data selection:** by Team Sehnsucht.

---

## 5. Team

* **Huraira:** code and engine
* **Meerab:** science, biological mechanics, narrative, UI structure and presentation
