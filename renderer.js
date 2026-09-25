import { canvas, noGpuEl, menuEl, game, keys, toast, ARENA, TAU } from './state.js';
import { mulberry, clamp, randRange, sub3, norm3, cross3, mMul, mPerspective, mLookAt, modelMatrix } from './math.js';
/* ---------- WebGPU ---------- */
export let device = null, context = null, canvasFormat = null, depthTexture = null, depthView = null;
let bgPipeline = null, objPipeline = null, fxPipeline = null;
let frameLayout = null, objectLayout = null, frameBindGroup = null, objectBindGroup = null;
let frameBuffer = null, objectBuffer = null;
const frameData = new Float32Array(24);
const objData = new Float32Array(24);
const MAX_DRAWS = 420;
const meshes = {};

const BG_WGSL = `
struct Frame { viewProj : mat4x4<f32>, camera : vec4<f32>, params : vec4<f32> };
@group(0) @binding(0) var<uniform> frame : Frame;
struct Out { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i : u32) -> Out {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o : Out;
  o.pos = vec4<f32>(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  return o;
}
fn hash(p : vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1,311.7))) * 43758.5453); }
@fragment fn fs(in : Out) -> @location(0) vec4<f32> {
  let t = frame.params.x;
  let centered = in.uv - vec2<f32>(0.5, 0.42);
  let d = length(centered * vec2<f32>(1.25, 1.0));
  var col = mix(vec3<f32>(0.055,0.105,0.22), vec3<f32>(0.004,0.008,0.025), smoothstep(0.0, 0.95, d));
  col += vec3<f32>(0.05,0.16,0.30) * exp(-d * 4.2) * 0.75;
  col += vec3<f32>(0.10,0.03,0.14) * smoothstep(0.55, 1.0, in.uv.y) * 0.35;
  let cell = floor(in.uv * vec2<f32>(220.0, 130.0));
  let h = hash(cell);
  if (h > 0.965) {
    let tw = 0.45 + 0.55 * sin(t * (1.0 + h * 4.0) + h * 40.0);
    col += vec3<f32>(0.75,0.9,1.0) * tw * smoothstep(0.965, 1.0, h);
  }
  col += (hash(in.uv * 913.0) - 0.5) * 0.025;
  let vig = smoothstep(1.05, 0.35, length(in.uv - 0.5));
  return vec4<f32>(col * (0.35 + 0.65 * vig), 1.0);
}`;

const OBJ_WGSL = `
struct Frame { viewProj : mat4x4<f32>, camera : vec4<f32>, params : vec4<f32> };
struct Object { model : mat4x4<f32>, color : vec4<f32>, glow : vec4<f32> };
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> obj : Object;
struct In { @location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32>, @location(2) col : vec3<f32> };
struct Out {
  @builtin(position) clip : vec4<f32>,
  @location(0) world : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) color : vec3<f32>
};
@vertex fn vs(in : In) -> Out {
  var o : Out;
  let w = obj.model * vec4<f32>(in.pos, 1.0);
  o.world = w.xyz;
  o.normal = normalize((obj.model * vec4<f32>(in.nrm, 0.0)).xyz);
  o.color = in.col * obj.color.rgb;
  o.clip = frame.viewProj * w;
  return o;
}
@fragment fn fs(in : Out) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let lightDir = normalize(vec3<f32>(-0.48, 0.74, 0.46));
  let viewDir = normalize(frame.camera.xyz - in.world);
  let diff = max(dot(n, lightDir), 0.0);
  let hemi = 0.5 + 0.5 * n.y;
  let spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 28.0) * 0.38;
  var col = in.color * (0.20 + 0.30 * hemi + 1.05 * diff) + vec3<f32>(spec);
  col += obj.glow.rgb * obj.glow.a;
  let dist = distance(frame.camera.xyz, in.world);
  let fog = smoothstep(24.0, 58.0, dist);
  col = mix(col, vec3<f32>(0.018,0.032,0.075), fog * 0.72);
  return vec4<f32>(col, obj.color.a);
}`;

function makeMesh(name, positions, normals, colors, indices) {
  const v = new Float32Array(positions);
  const n = new Float32Array(normals);
  const c = new Float32Array(colors);
  const inter = new Float32Array((v.length / 3) * 9);
  for (let i = 0; i < v.length / 3; i++) {
    inter.set([v[i*3], v[i*3+1], v[i*3+2], n[i*3], n[i*3+1], n[i*3+2], c[i*3], c[i*3+1], c[i*3+2]], i * 9);
  }
  const vb = device.createBuffer({ size: inter.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vb, 0, inter);
  const idx = new Uint32Array(indices);
  const ib = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ib, 0, idx);
  meshes[name] = { vb, ib, count: indices.length };
}
function triSoupToMesh(name, tris) {
  const p = [], n = [], c = [], idx = [];
  tris.forEach((t, k) => {
    const pts = t[0], col = t[1];
    const a = pts[0], b = pts[1], vv = pts[2];
    const ux = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const vx = [vv[0]-a[0], vv[1]-a[1], vv[2]-a[2]];
    const nn = norm3(cross3(ux, vx));
    [a, b, vv].forEach(pt => { p.push(pt[0], pt[1], pt[2]); n.push(nn[0], nn[1], nn[2]); c.push(col[0], col[1], col[2]); });
    idx.push(k*3, k*3+1, k*3+2);
  });
  makeMesh(name, p, n, c, idx);
}
function rockGeometry(seed, index, latBands = 13, longBands = 20) {
  const rng = mulberry(seed);
  const a1 = randRange(rng, 0.10, 0.24), a2 = randRange(rng, 0.06, 0.18), a3 = randRange(rng, 0.04, 0.12);
  const p1 = rng() * TAU, p2 = rng() * TAU, p3 = rng() * TAU;
  const f1 = 2 + Math.floor(rng() * 3), f2 = 3 + Math.floor(rng() * 3), f3 = 4 + Math.floor(rng() * 4);
  const radiusAt = (lat, lon) => 1 + a1 * Math.sin(f1 * lat + p1) * Math.sin(f2 * lon + p2)
    + a2 * Math.sin(f2 * lat * 0.7 + p3) * Math.sin(f3 * lon * 0.6 + p1)
    + a3 * Math.sin((lat + lon) * 2.0 + p2);
  const grid = [];
  for (let la = 0; la <= latBands; la++) {
    const lat = (la / latBands - 0.5) * Math.PI;
    const row = [];
    for (let lo = 0; lo < longBands; lo++) {
      const lon = (lo / longBands) * TAU;
      const r = Math.max(0.62, radiusAt(lat, lon));
      row.push([r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)]);
    }
    grid.push(row);
  }
  const shade = 0.72 + rng() * 0.22;
  const base = [0.46 * shade + 0.10, 0.39 * shade + 0.07, 0.34 * shade + 0.06];
  const p = [], n = [], c = [], idx = [];
  const map = [];
  for (let la = 0; la <= latBands; la++) {
    map[la] = [];
    for (let lo = 0; lo < longBands; lo++) {
      const v = grid[la][lo];
      map[la][lo] = p.length / 3;
      p.push(v[0], v[1], v[2]); n.push(0, 1, 0);
      const dark = clamp((1.25 - Math.hypot(v[0], v[1], v[2])) * 0.55 + 0.72, 0.45, 1.1);
      const jitter = 0.9 + rng() * 0.2;
      c.push(base[0] * dark * jitter, base[1] * dark * jitter, base[2] * dark);
    }
  }
  for (let la = 0; la < latBands; la++) {
    for (let lo = 0; lo < longBands; lo++) {
      const lo2 = (lo + 1) % longBands;
      idx.push(map[la][lo], map[la+1][lo], map[la+1][lo2]);
      idx.push(map[la][lo], map[la+1][lo2], map[la][lo2]);
    }
  }
  const pos = new Float32Array(p);
  const nrm = new Float32Array(p.length);
  const get = i => [pos[i*3], pos[i*3+1], pos[i*3+2]];
  for (let i = 0; i < idx.length; i += 3) {
    const A = get(idx[i]), B = get(idx[i+1]), C = get(idx[i+2]);
    const nn = norm3(cross3(sub3(B, A), sub3(C, A)));
    [idx[i], idx[i+1], idx[i+2]].forEach(k => { nrm[k*3] += nn[0]; nrm[k*3+1] += nn[1]; nrm[k*3+2] += nn[2]; });
  }
  for (let i = 0; i < nrm.length / 3; i++) {
    const l = Math.hypot(nrm[i*3], nrm[i*3+1], nrm[i*3+2]) || 1;
    nrm[i*3] /= l; nrm[i*3+1] /= l; nrm[i*3+2] /= l;
  }
  makeMesh('rock' + index, Array.from(pos), Array.from(nrm), c, idx);
}
function buildMeshes() {
  for (let i = 0; i < 7; i++) rockGeometry(100 + i * 17, i);
  const steel = [0.62, 0.72, 0.86], dark = [0.16, 0.22, 0.34], cyan = [0.25, 0.95, 1.0], orange = [1.0, 0.52, 0.15];
  triSoupToMesh('ship', [
    [[[0,1.75,0.12],[-0.95,-0.75,0.10],[0,-0.20,0.55]], steel],
    [[[0,1.75,0.12],[0,-0.20,0.55],[0.95,-0.75,0.10]], steel],
    [[[0,1.75,0.12],[0.95,-0.75,0.10],[1.55,-0.72,-0.10]], cyan],
    [[[0,1.75,0.12],[-1.55,-0.72,-0.10],[-0.95,-0.75,0.10]], cyan],
    [[[-0.95,-0.75,0.10],[0,-0.20,0.55],[0,-0.95,-0.25]], dark],
    [[[0.95,-0.75,0.10],[0,-0.95,-0.25],[0,-0.20,0.55]], dark],
    [[[-1.55,-0.72,-0.10],[0,1.75,0.12],[0,-0.35,-0.35]], dark],
    [[[1.55,-0.72,-0.10],[0,-0.35,-0.35],[0,1.75,0.12]], dark],
    [[[-0.42,-0.95,0.02],[0.42,-0.95,0.02],[0,-1.25,-0.12]], orange],
    [[[0,1.75,0.12],[0,-0.20,-0.38],[-0.95,-0.75,0.10]], steel],
    [[[0,1.75,0.12],[0.95,-0.75,0.10],[0,-0.20,-0.38]], steel]
  ]);
  triSoupToMesh('cockpit', [
    [[[0,0.55,0.48],[-0.24,-0.05,0.38],[0.24,-0.05,0.38]], [0.55,1.0,1.0]],
    [[[0,0.55,0.48],[0.24,-0.05,0.38],[0,0.05,0.72]], [0.2,0.75,1.0]],
    [[[0,0.55,0.48],[0,0.05,0.72],[-0.24,-0.05,0.38]], [0.2,0.75,1.0]]
  ]);
  triSoupToMesh('bolt', [
    [[[0,0.55,0],[-0.12,0,0.12],[0.12,0,0.12]], cyan],
    [[[0,0.55,0],[0.12,0,0.12],[0.12,0,-0.12]], cyan],
    [[[0,0.55,0],[0.12,0,-0.12],[-0.12,0,-0.12]], cyan],
    [[[0,0.55,0],[-0.12,0,-0.12],[-0.12,0,0.12]], cyan],
    [[[0,-0.55,0],[-0.12,0,0.12],[0.12,0,0.12]], cyan],
    [[[0,-0.55,0],[0.12,0,0.12],[0.12,0,-0.12]], cyan]
  ]);
  triSoupToMesh('spark', [
    [[[0,0.18,0],[-0.15,-0.12,0.1],[0.15,-0.12,-0.05]], [1,1,1]],
    [[[0,0.18,0],[0.15,-0.12,-0.05],[-0.15,-0.12,0.1]], [1,1,1]]
  ]);
  triSoupToMesh('drone', [
    [[[0,0.72,0],[-0.72,0,0],[0,0,0.34]], [1.0,0.28,0.38]],
    [[[0,0.72,0],[0,0,0.34],[0.72,0,0]], [1.0,0.28,0.38]],
    [[[0.72,0,0],[0,0,0.34],[0,-0.72,0]], [0.55,0.08,0.14]],
    [[[-0.72,0,0],[0,-0.72,0],[0,0,0.34]], [0.55,0.08,0.14]],
    [[[0,0.2,0.52],[-0.18,-0.18,0.30],[0.18,-0.18,0.30]], [1.0,0.85,0.25]]
  ]);
  const seg = 48, rp = [], rn = [], rc = [], ri = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    rp.push(c * 0.92, s * 0.92, 0, c * 1.0, s * 1.0, 0);
    rn.push(0, 0, 1, 0, 0, 1);
    rc.push(1, 1, 1, 1, 1, 1);
    if (i < seg) { const k = i * 2; ri.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  }
  makeMesh('ring', rp, rn, rc, ri);
}

async function initGPU() {
  if (!navigator.gpu) { noGpuEl.hidden = false; menuEl.hidden = true; return false; }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { noGpuEl.hidden = false; menuEl.hidden = true; return false; }
  device = await adapter.requestDevice();
  device.lost.then(info => { toast('Konteks GPU hilang: ' + info.reason); game.mode = 'menu'; });
  context = canvas.getContext('webgpu');
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat, alphaMode: 'opaque' });
  frameLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
  objectLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 96 } }] });
  frameBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  objectBuffer = device.createBuffer({ size: MAX_DRAWS * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  frameBindGroup = device.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: frameBuffer } }] });
  objectBindGroup = device.createBindGroup({ layout: objectLayout, entries: [{ binding: 0, resource: { buffer: objectBuffer, size: 96 } }] });
  const bgModule = device.createShaderModule({ code: BG_WGSL });
  const objModule = device.createShaderModule({ code: OBJ_WGSL });
  bgPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout] }),
    vertex: { module: bgModule, entryPoint: 'vs' },
    fragment: { module: bgModule, entryPoint: 'fs', targets: [{ format: canvasFormat }] },
    primitive: { topology: 'triangle-list' }
  });
  const vertexBuffers = [{ arrayStride: 36, attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x3' }
  ]}];
  const blendOff = { color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' } };
  const blendOn = { color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  objPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, objectLayout] }),
    vertex: { module: objModule, entryPoint: 'vs', buffers: vertexBuffers },
    fragment: { module: objModule, entryPoint: 'fs', targets: [{ format: canvasFormat, blend: blendOff, writeMask: GPUColorWrite.ALL }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
  });
  fxPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, objectLayout] }),
    vertex: { module: objModule, entryPoint: 'vs', buffers: vertexBuffers },
    fragment: { module: objModule, entryPoint: 'fs', targets: [{ format: canvasFormat, blend: blendOn, writeMask: GPUColorWrite.ALL }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' }
  });
  buildMeshes();
  resize();
  window.addEventListener('resize', resize);
  return true;
}
function resize() {
  if (!device) return;
  const dprLimit = matchMedia('(pointer: coarse)').matches ? 1.25 : 1.75;
  const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
  const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h && depthTexture) return;
  canvas.width = w; canvas.height = h;
  if (depthTexture) depthTexture.destroy();
  depthTexture = device.createTexture({ size: [canvas.width, canvas.height], sampleCount: 1, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  depthView = depthTexture.createView();
}


/* ---------- render ---------- */
const drawQueue = [];
let drawCount = 0;
function pushDraw(mesh, model, color, glow, fx = false, alpha = 1) {
  if (drawCount >= MAX_DRAWS) return;
  const draw = drawQueue[drawCount] || (drawQueue[drawCount] = { color: [0, 0, 0, 1] });
  draw.mesh = mesh;
  draw.model = model;
  draw.color[0] = color[0];
  draw.color[1] = color[1];
  draw.color[2] = color[2];
  draw.color[3] = alpha;
  draw.glow = glow;
  draw.fx = fx;
  drawCount++;
}
function render() {
  if (!device) return;
  drawCount = 0;
  const t = game.time;
  const s = game.ship;
  const shakeX = (Math.random() - 0.5) * game.shake * 0.55;
  const shakeY = (Math.random() - 0.5) * game.shake * 0.55;
  const eye = [s ? s.x * 0.10 + shakeX : shakeX, -1.6 + (s ? s.y * 0.06 : 0) + shakeY, 22.5];
  const center = [s ? s.x * 0.12 : 0, 0.35 + (s ? s.y * 0.08 : 0), -3];
  const aspect = canvas.width / Math.max(1, canvas.height);
  const viewProj = mMul(mPerspective(58 * Math.PI / 180, aspect, 0.1, 120), mLookAt(eye, center, [0,1,0]));
  frameData.set(viewProj, 0);
  frameData.set([eye[0], eye[1], eye[2], 1], 16);
  frameData.set([t, game.shake, game.wave, 0], 20);
  device.queue.writeBuffer(frameBuffer, 0, frameData);

  if (game.mode === 'play' && s) {
    const rot = s.angle - Math.PI / 2;
    const bank = clamp((keys.left ? 0.28 : 0) + (keys.right ? -0.28 : 0) + (-s.vx * 0.035), -0.55, 0.55);
    const shipModel = modelMatrix(s.x, s.y, s.z, 0, bank, rot, 1);
    const blink = s.invuln > 0 && Math.floor(t * 14) % 2 === 0;
    if (!blink) {
      pushDraw(meshes.ship, shipModel, [1,1,1,1], [0.12,0.55,0.75,0.22]);
      pushDraw(meshes.cockpit, shipModel, [1,1,1,1], [0.25,0.9,1.0,0.55 + Math.sin(t*5)*0.08]);
      if (s.thrustFx > 0.02) {
        const bx = s.x - Math.cos(s.angle) * 1.18, by = s.y - Math.sin(s.angle) * 1.18;
        const flame = modelMatrix(bx, by, s.z - 0.05, 0, 0, rot + Math.PI, [0.55 + s.thrustFx*0.35, 0.9 + s.thrustFx*0.9, 0.55]);
        pushDraw(meshes.bolt, flame, [1.0,0.62,0.22,0.92], [1.0,0.42,0.12,1.4*s.thrustFx], true, 0.92);
      }
      if (keys.shield && game.shieldEnergy > 1) {
        pushDraw(meshes.ring, modelMatrix(s.x, s.y, s.z, 0, 0, t*1.8, 1.7), [0.35,0.9,1.0,0.42], [0.3,0.85,1.0,0.9], true, 0.42);
      }
    }
  } else if (game.mode === 'menu') {
    const demo = modelMatrix(Math.sin(t*0.6)*3, Math.sin(t*0.9)*1.2, -1, t*0.25, t*0.4, Math.sin(t*0.35)*0.35, 1.35);
    pushDraw(meshes.ship, demo, [1,1,1,1], [0.2,0.7,1.0,0.35]);
    for (let i = 0; i < 5; i++) {
      const a = t*0.18 + i * TAU / 5;
      pushDraw(meshes['rock' + (i % 7)], modelMatrix(Math.cos(a)*7.5, Math.sin(a)*4.2, -5 - (i%3), t*0.3+i, t*0.22, 0, 1.25 + (i%3)*0.35), [0.95,0.88,0.82,1], [0.05,0.03,0.02,0.1]);
    }
  }
  for (const r of game.rocks) {
    pushDraw(meshes['rock' + r.variant], modelMatrix(r.x, r.y, r.z, r.rx, r.ry, 0, r.scale), [r.tint,r.tint*0.96,r.tint*0.92,1], [0.08,0.045,0.025,0.16]);
  }
  for (const b of game.bullets) {
    pushDraw(meshes.bolt, modelMatrix(b.x, b.y, b.z, 0, 0, b.angle - Math.PI/2, [0.55,1.5,0.55]), [0.55,1.0,1.0,1], [0.25,0.95,1.0,1.5]);
  }
  for (const b of game.enemyBullets) {
    pushDraw(meshes.bolt, modelMatrix(b.x, b.y, 0.4, 0, 0, t*7, [0.7,0.7,0.7]), [1.0,0.28,0.36,1], [1.0,0.12,0.2,1.6]);
  }
  for (const e of game.enemies) {
    pushDraw(meshes.drone, modelMatrix(e.x, e.y, e.z, 0, Math.sin(e.t*3)*0.18, Math.sin(e.t*1.7)*0.25, 1), [1,1,1,1], [1.0,0.18,0.28,0.34]);
  }
  for (const p of game.particles) {
    const k = 1 - p.life / p.max;
    pushDraw(meshes.spark, modelMatrix(p.x, p.y, p.z, p.life*4, p.life*5, 0, p.size*(0.4+0.6*k)), [p.color[0],p.color[1],p.color[2],0.9*k+0.1], [p.color[0],p.color[1],p.color[2],p.glow*k], true, 0.9*k+0.1);
  }
  for (const r of game.rings) {
    const k = 1 - r.life / r.dur;
    pushDraw(meshes.ring, modelMatrix(r.x, r.y, r.z, 0, 0, game.time*0.8, r.r), [r.color[0],r.color[1],r.color[2],0.75*k], [r.color[0],r.color[1],r.color[2],1.1*k], true, 0.75*k);
  }

  const encoder = device.createCommandEncoder();
  const colorView = context.getCurrentTexture().createView();
  const bgPass = encoder.beginRenderPass({
    colorAttachments: [{ view: colorView, loadOp: 'clear', clearValue: { r: 0.004, g: 0.008, b: 0.025, a: 1 }, storeOp: 'store' }]
  });
  bgPass.setPipeline(bgPipeline);
  bgPass.setBindGroup(0, frameBindGroup);
  bgPass.draw(3);
  bgPass.end();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: colorView, loadOp: 'load', storeOp: 'store' }],
    depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
  });
  pass.setBindGroup(0, frameBindGroup);
  let opaque = true;
  for (let phase = 0; phase < 2; phase++) {
    for (let i = 0; i < drawCount; i++) {
      const d = drawQueue[i];
      if ((phase === 0) !== !d.fx) continue;
      if (phase === 0 && opaque) { pass.setPipeline(objPipeline); opaque = false; }
      if (phase === 1 && !opaque) { pass.setPipeline(fxPipeline); opaque = true; }
      const mesh = d.mesh;
      if (!mesh) continue;
      objData.set(d.model, 0);
      objData.set(d.color, 16);
      objData.set(d.glow, 20);
      device.queue.writeBuffer(objectBuffer, i * 256, objData);
      pass.setBindGroup(1, objectBindGroup, [i * 256]);
      pass.setVertexBuffer(0, mesh.vb);
      pass.setIndexBuffer(mesh.ib, 'uint32');
      pass.drawIndexed(mesh.count);
    }
  }
  pass.end();
  device.queue.submit([encoder.finish()]);
}


export { initGPU, resize, render };
