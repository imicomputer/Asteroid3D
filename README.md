# Asteroid3D

Asteroid3D is a dependency-free WebGPU arcade game. The HTML keeps the original HUD and styles, while the JavaScript is split into focused ES modules:

- `main.js` — application entry point and animation loop.
- `state.js` — DOM references, game state, input flags, and UI helpers.
- `gameplay.js` — spawning, collisions, scoring, simulation, and game lifecycle.
- `input.js` — keyboard, touch, button, pause, and sound controls.
- `audio.js` — Web Audio effects.
- `math.js` — vector and matrix helpers.
- `renderer.js` — WebGPU setup, procedural meshes, shaders, and rendering.

## Run locally

WebGPU and ES modules require a local HTTP server (opening the HTML with `file://` is not supported). From this directory, run for example:

```sh
python3 -m http.server 8084
```

Then open <http://localhost:8084/Asteroid3D.html> in a recent Chrome or Edge build with WebGPU enabled.
On Linux with Brave, launch the browser with WebGPU explicitly enabled:

```sh
brave-browser --enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,WebGPU http://localhost:8084/Asteroid3D.html
```
