# Precinct 12 — Police Patrol & Detective Simulator (prototype)

A playable 3D police game that runs in a desktop browser. It uses Three.js and plain JavaScript, with no build step and nothing to install.

**Graphics:** physically based materials, a physical sky with HDR city lighting and reflections (glass, car paint), soft sun shadows, filmic (ACES) tone mapping, ambient occlusion (GTAO), bloom on emergency lights and SMAA anti-aliasing. Textures (asphalt, brick, concrete, plaster, glass curtain walls, grass, foliage) are generated procedurally with normal and roughness maps.

You drive a police cruiser around a low-poly city and answer dispatch calls. At each crime scene you get out of the car, look at evidence, question witnesses and accuse the culprit. Two of the five cases end in a short shootout with suspects who use cover.

![Core loop](https://img.shields.io/badge/loop-patrol%20→%20dispatch%20→%20investigate%20→%20arrest-1f3a68)

> **Unreal Engine 5 version:** a higher-fidelity port (Lumen GI, virtual shadow maps, volumetric clouds, slots for photoreal characters and cars) lives in [`unreal/PrecinctTwelve`](unreal/PrecinctTwelve/README.md). See that README for setup.

---

## Running it locally

You need a modern desktop browser: **Chrome or Edge** (recommended) or Firefox. The game includes its own copies of Three.js and its lighting data, so it works without an internet connection.

### Option A: use a local web server (recommended, works best with a steering wheel)

| Your system | Steps |
|---|---|
| **Windows** | Double-click **`start-windows.bat`**. It uses Node.js or Python, whichever is installed, and opens the game in your browser. |
| **macOS / Linux** | Run `./start-mac-linux.sh` in a terminal. |
| **Any system with Node.js** | Run `npm start`, then open <http://localhost:8080>. |
| **Any system with Python** | Run `python -m http.server 8080` in this folder, then open <http://localhost:8080>. |

### Option B: open the file directly

Double-click **`index.html`**. The game uses only classic `<script>` tags, so it also runs from `file://`. Some browsers restrict the Gamepad API on `file://` pages. If your wheel isn't detected this way, use Option A.

### Getting the code

```bash
git clone https://github.com/cloudgal1234-cyber/Police-simulator.git
cd Police-simulator
git checkout claude/police-detective-game-prototype-f114kb
```

---

## Xbox steering wheel and controller setup

1. Plug in the wheel or controller **before** you open the game.
2. **Press any button or turn the wheel.** For privacy reasons, browsers only show a gamepad to a page after it has received input.
3. The welcome screen should then say **"Steering wheel detected"** or **"Gamepad detected"**.

| Wheel type | What to do |
|---|---|
| Xbox / XInput wheels that report the *standard* mapping (common on Windows, e.g. Logitech G920/G923 Xbox in XInput mode, Thrustmaster TMX/T248 Xbox) | Works out of the box. Steering is axis 0, **RT is throttle and LT is brake**. |
| Wheels that report a *non-standard* mapping (pedals on separate axes) | Click **🛞 Calibrate wheel & pedals** on the welcome screen, or press Esc in game and then Calibrate. The 4-step wizard records the steering axis, the throttle and brake channels, and their rest and pressed values. The calibration is saved in this browser for that device. |

Settings: the **wheel sensitivity** slider sets how far you turn the wheel for full steering lock. If auto-detection guesses the device type wrong, you can set it to *Steering wheel* or *Gamepad* under **Device type**.

---

## Controls

The welcome screen and the pause menu (Esc) both show the full list.

### Driving
| Action | Keyboard | Xbox controller / wheel |
|---|---|---|
| Accelerate | W / ↑ | RT / throttle pedal |
| Brake / reverse | S / ↓ | LT / brake pedal |
| Steer | A, D / ←, → | Left stick / steering wheel |
| Handbrake (drift) | Space | B |
| Siren & lights | H | X |
| Enter / exit the cruiser | F | Y |
| Horn | G | — |
| Switch camera (chase / hood) | C | LB |

### On foot (detective phase)
| Action | Keyboard / mouse | Controller / wheel |
|---|---|---|
| Move | W A S D | Left stick (on a wheel: pedals walk, the wheel turns) |
| Look | Mouse (click the game to lock the pointer), ← → | Right stick |
| Run | Shift | L3 |
| Inspect evidence / talk | E | A |
| Aim *(standoffs only)* | Right mouse | LT |
| Fire *(standoffs only)* | Left mouse | RT (on a wheel: RB) |
| Reload | R | X |

### General
| Action | Keyboard | Controller |
|---|---|---|
| Dialogue choices | 1–9, or ↑ ↓ + Enter, or click | D-pad + A (B = goodbye) |
| Case notebook | Tab / J | RB |
| City map | M | View / Back |
| Pause & settings | Esc / P | Menu / Start |

---

## How to play

1. **Patrol.** Drive around until a 📻 **dispatch** call arrives. A **blue GPS route** appears on the minimap, a compass at the top of the screen shows direction and distance, and a blue light beacon marks the scene. Turn on the siren on the way for a *Code 3 response bonus*.
2. **Investigate.** Park, press **F** to get out, and look around:
   - ◆ **Yellow markers** are physical evidence. Press **E** to inspect them.
   - ◆ **Blue markers** are people with something to say. Talk to them. Options marked **★** are new leads that your evidence has unlocked.
   - Everything you find goes into your **notebook** (Tab).
3. **Accuse.** When you have enough evidence, an **⚖ Accuse** option appears in every conversation. A wrong accusation costs points.
4. **Standoffs.** In two cases the culprit and accomplices pull guns instead of surrendering. Your sidearm is drawn only in these moments. Use crates and dumpsters as cover, and take your shots when suspects peek out. Suspects who are hit enough times surrender and are taken into custody. If you go down, backup arrives and the encounter resets.
5. **Wrap up.** You get a case summary with your score breakdown. Get back in your car and the next call comes in shortly after.

### The case roster
| # | Case | Type |
|---|---|---|
| 1 | Vandalism at Greenway Park | Investigation |
| 2 | Armed Robbery: Quik-Stop Market | Investigation + **standoff** |
| 3 | Burglary at Elm St. Apartments | Investigation (staged break-in) |
| 4 | Hit-and-Run outside Lucano's | Investigation |
| 5 | Shots Fired: Dockside Storage | Investigation + **standoff** |

After case 5, the roster starts again from the beginning.

---

## Project structure

```
index.html          Page layout: HUD, dialogue, menus, script tags
css/style.css       All UI styling
vendor/three-bundle.min.js Three.js r160 + post-processing add-ons (MIT) in one file, so the game works offline
assets/hdri-city.js CC0 city HDRI (Poly Haven, via @pmndrs/assets) for lighting & reflections
js/
  util.js           Namespace, math, seeded RNG, circle/box collision, raycasts
  textures.js       Procedural PBR textures (albedo / normal / roughness)
  graphics.js       Renderer, sky, sun & shadows, HDR environment, post-processing, quality presets
  input.js          Keyboard + mouse + Gamepad API (wheel detection, calibration data, deadzones)
  audio.js          Procedural WebAudio: engine, siren, gunshots, UI sounds (no audio files)
  models.js         Low-poly procedural people, cars and props
  world.js          City grid, merged building mesh with window texture, trees, lamps, colliders
  vehicle.js        Cruiser physics (bicycle model, grip/drift, collisions), light bar
  traffic.js        AI traffic following lanes and turning at intersections; pedestrians
  player.js         On-foot movement and over-the-shoulder camera state
  cases-data.js     The five cases: evidence, props, NPCs, dialogue topics, culprits
  case-manager.js   Game loop states: patrol → dispatch → respond → investigate → accuse/standoff → wrap-up
  combat.js         Standoff AI (cover → peek → shoot → surrender), hitscan shooting, tracers
  ui.js             HUD, minimap/GPS, compass, dialogue, notebook, summary, calibration wizard
  main.js           Bootstrap, render loop, drive/foot switching, cameras
server.js           Tiny zero-dependency static server (`npm start`)
```

### Adding a new case

Add an object to `PD.CASES` in `js/cases-data.js`. Positions are relative to the centre of the city block the case uses, with **+z facing the street**. The fields are:

- `evidence`: items that can go in the notebook
- `clues`: placed props that link to evidence ids
- `npcs`: each NPC has `topics`, which can be gated with `req` and can add evidence with `gives`
- `culprit` and `minEvidence`
- optionally `armed: true` with `accomplices`, plus `cover: true` on props suspects can hide behind

Special blocks are mapped to block types in `SPECIAL` at the top of `js/world.js`.

## Graphics quality & performance

Set **Graphics quality** on the welcome screen or in the pause menu:

| Preset | What you get |
|---|---|
| **Auto** (default) | Starts at High, then drops a level if the frame rate stays under 40 fps |
| Low | 1024 shadows, no ambient occlusion or bloom |
| Medium | 2048 soft shadows, bloom, SMAA |
| High | 4096 soft shadows, GTAO ambient occlusion, bloom, SMAA |
| Ultra | High at 1.5× render resolution |

A dedicated graphics card is recommended for High and Ultra. Wall geometry is batched per material, and windows, trees, lamps, traffic lights and wheels are instanced or merged, so the whole city draws in a few dozen calls.
