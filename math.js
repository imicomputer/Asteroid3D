function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
/* ---------- mat4 ---------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randRange(rng, a, b) { return a + (b - a) * rng(); }

function mIdentity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function mTranslate(x, y, z) { const m = mIdentity(); m[12] = x; m[13] = y; m[14] = z; return m; }
function mScale(x, y, z) { const m = mIdentity(); m[0] = x; m[5] = y; m[10] = z; return m; }
function mRotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function mRotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function mRotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function mPerspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,(2 * far * near) * nf,0]);
}
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }
function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function mLookAt(eye, center, up) {
  const z = norm3(sub3(eye, center));
  const x = norm3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ]);
}
function modelMatrix(x, y, z, rx, ry, rz, s) {
  let m = mTranslate(x, y, z);
  m = mMul(m, mRotZ(rz));
  m = mMul(m, mRotY(ry));
  m = mMul(m, mRotX(rx));
  if (Array.isArray(s)) m = mMul(m, mScale(s[0], s[1], s[2]));
  else m = mMul(m, mScale(s, s, s));
  return m;
}

export { mulberry, clamp, randRange, mIdentity, mMul, mTranslate, mScale, mRotX, mRotY, mRotZ, mPerspective, sub3, norm3, cross3, dot3, mLookAt, modelMatrix };
