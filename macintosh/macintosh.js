/* bhlkg — Macintosh blockout, Phase 1.
   Vanilla Three.js, single static render. No controls, no animation,
   no post-processing. Everything tunable lives in the config blocks below. */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const DEBUG_MODEL_VIEWS = true;

/* ====================== configuration — all tuning here ====================== */

const COLORS = {
  body:       0xd8d3c7, // outer molded housing
  panel:      0xd1cbbf, // inset front panel
  foot:       0xccc6b9,
  bezel:      0x191918,
  screen:     0x17191a, // inactive CRT glass
  slot:       0x24231f, // floppy slot
  button:     0xc7c1b3,
  vent:       0xc1bbad,
  seam:       0xb5afa2,
  table:      0xa09a8d, // muted warm gray tabletop
  background: 0xc7c2b8, // slightly lighter gray-beige
};

/* Body dimensions (world units). Total height = FOOT.height + BODY.height. */
const BODY = {
  width: 3.4,
  height: 4.5,
  depth: 2.3,
  cornerRadius: 0.13,
  frontShellDepth: 1.2,
  /* Stepped rear housing so the side profile reads as a CRT bucket,
     not a flat box. Each step is narrower/shorter and pushed backward. */
  midStep:  { widthScale: 0.92, height: 4.15, depth: 0.85, topInset: 0.08, overlap: 0.15 },
  rearStep: { widthScale: 0.81, height: 3.35, depth: 0.78, topInset: 0.15 },
};

const FOOT = { width: 2.95, height: 0.30, depth: 1.70, setBack: 0.12, cornerRadius: 0.08 };

const PANEL = { width: 3.10, height: 4.24, thickness: 0.07, proud: 0.045, cornerRadius: 0.10 };

/* CRT size and position. `frame` is the dark bezel (extruded rounded frame
   with a real opening); `glass` is the convex inactive screen behind it. */
const CRT = {
  centerY: 3.38,
  frame: {
    width: 2.75,
    height: 2.28,
    border: 0.30,        // beige-to-glass bezel border width
    cornerRadius: 0.24,
    depth: 0.19,
    bevel: 0.015,
  },
  /* Note: recess + bulge + thickness must stay <= frame.depth + 0.005 so the
     glass never sinks behind the solid front panel face. */
  glass: {
    width: 2.35,         // oversized so its edges hide behind the frame
    height: 1.86,
    thickness: 0.08,
    cornerRadius: 0.10,
    bulge: 0.07,         // subtle convex CRT curvature
    recess: 0.03,        // how far the glass sits behind the frame front
    roughness: 0.35,     // low enough for a faint soft reflection only
  },
};

/* Lower front section details (positions relative to body center x / world y). */
const LOWER = {
  seam:   { y: 1.72, height: 0.025, depth: 0.02 },
  floppy: { x: 0.62, y: 1.18, width: 1.15, height: 0.07, depth: 0.03 },
  button: { x: 1.30, y: 0.92, size: 0.12, depth: 0.025 },
  vent:   { x: -0.82, y: 0.80, width: 0.95, height: 0.16, depth: 0.015 },
};

/* Camera. Presets are view directions from the target; the distance is
   derived from `heightFraction` so the computer occupies ~40–55% of the
   viewport height (spec) at any window size. */
const CAMERA = {
  fov: 32,
  near: 0.1,
  far: 300,
  target: [0, 1.8, 0],
  heightFraction: 0.48,
  maxWidthFraction: 0.62, // keeps the body from clipping on narrow screens
  presets: {
    '1': [0, 0.10, 1],      // front
    '2': [1, 0.10, 0.02],   // right side
    '3': [0.03, 1, 0.22],   // top
    '4': [6.5, 3.0, 8],     // three-quarter (suggested [6.5, 4.8, 8] vs target)
  },
  defaultPreset: '4',
};

/* HTML screen overlay (the DOM layer inside the CRT). Its on-screen
   position/size derive from the CRT config above — the four corners of the
   CRT opening are projected through the camera once per preset/resize, so
   no pixel offsets are duplicated here or in the CSS. */
const SCREEN_OVERLAY = {
  /* CSS design resolution of the preview; height derives from the CRT
     opening's aspect ratio. Smaller value = larger-looking content. */
  designWidth: 260,
  mobile: { maxViewportWidth: 760, designWidth: 210 },
  inset: 0.045,          // world-unit shrink inside the opening (bezel safety)
  borderRadiusPx: 11,    // rounded corners matching the CRT opening
  /* alignment is tuned for the static three-quarter view; hidden elsewhere */
  visibleOnPresets: ['4'],
};

const LIGHTS = {
  hemi: { sky: 0xe6e2d8, ground: 0x8b867c, intensity: 0.78 },
  key:  { color: 0xfff3e4, intensity: 2.2, position: [-7, 10, 7.5] },
  fill: { color: 0xefede8, intensity: 0.85, position: [8, 5, 3] },
};

/* ============================ derived measures ============================ */

const baseY = FOOT.height;                       // housing sits on the foot
const totalHeight = FOOT.height + BODY.height;   // 4.8
const bodyCenterY = baseY + BODY.height / 2;
const bodyTopY = baseY + BODY.height;
const bodyFrontZ = BODY.depth / 2;
const panelFrontZ = bodyFrontZ + PANEL.proud;

/* ============================ renderer / scene ============================ */

const canvas = document.getElementById('mac3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
scene.fog = new THREE.Fog(COLORS.background, 30, 90);

const camera = new THREE.PerspectiveCamera(
  CAMERA.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far
);

/* ================================ lighting ================================ */

scene.add(new THREE.HemisphereLight(
  LIGHTS.hemi.sky, LIGHTS.hemi.ground, LIGHTS.hemi.intensity
));

const keyLight = new THREE.DirectionalLight(LIGHTS.key.color, LIGHTS.key.intensity);
keyLight.position.set(...LIGHTS.key.position);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 9;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 40;
keyLight.shadow.radius = 6;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(LIGHTS.fill.color, LIGHTS.fill.intensity);
fillLight.position.set(...LIGHTS.fill.position);
scene.add(fillLight);

/* =============================== environment ============================== */

const table = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 1, metalness: 0 })
);
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

/* ============================ geometry helpers ============================ */

function plastic(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

/* Dark bezel: an extruded rounded frame with a real rounded opening. */
function makeBezelGeometry() {
  const f = CRT.frame;
  const shape = roundedRectShape(f.width, f.height, f.cornerRadius);
  const openW = f.width - f.border * 2;
  const openH = f.height - f.border * 2;
  shape.holes.push(roundedRectShape(openW, openH, Math.max(0.06, f.cornerRadius - f.border)));
  return new THREE.ExtrudeGeometry(shape, {
    depth: f.depth,
    bevelEnabled: true,
    bevelThickness: f.bevel,
    bevelSize: f.bevel,
    bevelSegments: 2,
    curveSegments: 24,
  });
}

/* Slightly convex CRT glass: rounded slab with its front face bulged out. */
function makeGlassGeometry() {
  const g = CRT.glass;
  const geo = new RoundedBoxGeometry(g.width, g.height, g.thickness, 4, g.cornerRadius);
  const pos = geo.attributes.position;
  const hw = g.width / 2, hh = g.height / 2;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z <= 0) continue;
    const nx = pos.getX(i) / hw;
    const ny = pos.getY(i) / hh;
    const falloff = Math.max(0, 1 - nx * nx * 0.85 - ny * ny * 0.85);
    pos.setZ(i, z + g.bulge * falloff);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ============================= the computer ============================= */

function buildMacintosh() {
  const mac = new THREE.Group();
  const bodyMat = plastic(COLORS.body, 0.92);

  function addPart(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mac.add(mesh);
    return mesh;
  }

  /* foot — small, recessed, integrated with the housing */
  addPart(
    new RoundedBoxGeometry(FOOT.width, FOOT.height, FOOT.depth, 3, FOOT.cornerRadius),
    plastic(COLORS.foot, 0.92),
    0, FOOT.height / 2, -FOOT.setBack
  );

  /* front shell — the full-height front volume */
  addPart(
    new RoundedBoxGeometry(BODY.width, BODY.height, BODY.frontShellDepth, 3, BODY.cornerRadius),
    bodyMat,
    0, bodyCenterY, bodyFrontZ - BODY.frontShellDepth / 2
  );

  /* stepped rear housing (CRT bucket) */
  const mid = BODY.midStep;
  const midZ = bodyFrontZ - BODY.frontShellDepth - mid.depth / 2 + mid.overlap;
  addPart(
    new RoundedBoxGeometry(BODY.width * mid.widthScale, mid.height, mid.depth, 3, BODY.cornerRadius),
    bodyMat,
    0, bodyTopY - mid.topInset - mid.height / 2, midZ
  );

  const rear = BODY.rearStep;
  addPart(
    new RoundedBoxGeometry(BODY.width * rear.widthScale, rear.height, rear.depth, 3, BODY.cornerRadius),
    bodyMat,
    0, bodyTopY - rear.topInset - rear.height / 2, -BODY.depth / 2 + rear.depth / 2
  );

  /* inset front panel, slightly proud of the shell with its own tone */
  addPart(
    new RoundedBoxGeometry(PANEL.width, PANEL.height, PANEL.thickness, 3, PANEL.cornerRadius),
    plastic(COLORS.panel, 0.88),
    0, bodyCenterY, bodyFrontZ + PANEL.proud - PANEL.thickness / 2
  );

  /* CRT bezel frame */
  const bezel = addPart(
    makeBezelGeometry(),
    plastic(COLORS.bezel, 0.6),
    0, CRT.centerY, panelFrontZ - 0.01
  );
  bezel.receiveShadow = false;

  /* convex inactive glass, recessed behind the bezel front */
  const frameFrontZ = panelFrontZ - 0.01 + CRT.frame.depth + CRT.frame.bevel;
  const glassZ = frameFrontZ - CRT.glass.recess - CRT.glass.bulge - CRT.glass.thickness / 2;
  const glass = addPart(
    makeGlassGeometry(),
    new THREE.MeshStandardMaterial({
      color: COLORS.screen,
      roughness: CRT.glass.roughness,
      metalness: 0,
    }),
    0, CRT.centerY, glassZ
  );
  glass.castShadow = false;

  /* lower front details — deliberately minimal for the blockout */
  const detailZ = (depth) => panelFrontZ + depth / 2 - 0.004;

  const seam = LOWER.seam;
  addPart(
    new THREE.BoxGeometry(PANEL.width, seam.height, seam.depth),
    plastic(COLORS.seam, 0.9),
    0, seam.y, detailZ(seam.depth)
  );

  const fl = LOWER.floppy;
  addPart(
    new RoundedBoxGeometry(fl.width, fl.height, fl.depth, 2, 0.025),
    plastic(COLORS.slot, 0.8),
    fl.x, fl.y, detailZ(fl.depth)
  );

  const bt = LOWER.button;
  addPart(
    new RoundedBoxGeometry(bt.size, bt.size, bt.depth, 2, 0.03),
    plastic(COLORS.button, 0.85),
    bt.x, bt.y, detailZ(bt.depth)
  );

  const vent = LOWER.vent;
  addPart(
    new RoundedBoxGeometry(vent.width, vent.height, vent.depth, 2, 0.03),
    plastic(COLORS.vent, 0.95),
    vent.x, vent.y, detailZ(vent.depth)
  );

  return mac;
}

scene.add(buildMacintosh());

/* ================================= camera ================================= */

let currentPreset = CAMERA.defaultPreset;

/* Distance so the computer fills CAMERA.heightFraction of the viewport,
   pulled back further on narrow screens so the width still fits. */
function fitDistance() {
  const vFov = THREE.MathUtils.degToRad(CAMERA.fov);
  const viewH = totalHeight / CAMERA.heightFraction;
  let dist = viewH / (2 * Math.tan(vFov / 2));
  const viewW = viewH * camera.aspect;
  const neededW = BODY.width / CAMERA.maxWidthFraction;
  if (viewW < neededW) dist *= neededW / viewW;
  return dist;
}

function applyPreset(key) {
  const dir = CAMERA.presets[key];
  if (!dir) return;
  currentPreset = key;
  const target = new THREE.Vector3(...CAMERA.target);
  camera.position
    .set(...dir)
    .normalize()
    .multiplyScalar(fitDistance())
    .add(target);
  camera.lookAt(target);
  updateScreenOverlay();
  render();
}

if (DEBUG_MODEL_VIEWS) {
  addEventListener('keydown', (e) => {
    if (CAMERA.presets[e.key]) applyPreset(e.key);
  });
}

/* ========================= CRT HTML screen overlay ========================= */
/* Projects the CRT opening's four corners into screen space and maps the
   overlay div onto that quad with a matrix3d. Computed only on preset/resize
   (static camera) — this is not continuous CSS3D tracking. */

const overlayEl = document.getElementById('crt-html-screen');

/* 3x3 homography helpers (projective map of a rectangle onto a quad) */
function adj3(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}

function mul3(a, b) {
  const c = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
    }
  }
  return c;
}

function basisToPoints(p1, p2, p3, p4) {
  const m = [p1[0], p2[0], p3[0], p1[1], p2[1], p3[1], 1, 1, 1];
  const a = adj3(m);
  const v = [
    a[0] * p4[0] + a[1] * p4[1] + a[2],
    a[3] * p4[0] + a[4] * p4[1] + a[5],
    a[6] * p4[0] + a[7] * p4[1] + a[8],
  ];
  return mul3(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

function quadTransform(w, h, tl, tr, bl, br) {
  const src = basisToPoints([0, 0], [w, 0], [0, h], [w, h]);
  const dst = basisToPoints(tl, tr, bl, br);
  const t = mul3(dst, adj3(src));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,1)`;
}

function overlayDesignSize() {
  const mobile = innerWidth <= SCREEN_OVERLAY.mobile.maxViewportWidth;
  const w = mobile ? SCREEN_OVERLAY.mobile.designWidth : SCREEN_OVERLAY.designWidth;
  const openW = CRT.frame.width - CRT.frame.border * 2 - SCREEN_OVERLAY.inset * 2;
  const openH = CRT.frame.height - CRT.frame.border * 2 - SCREEN_OVERLAY.inset * 2;
  return { w, h: w * (openH / openW), openW, openH };
}

function updateScreenOverlay() {
  if (!overlayEl) return;

  if (!SCREEN_OVERLAY.visibleOnPresets.includes(currentPreset)) {
    overlayEl.classList.remove('is-visible');
    return;
  }

  const { w, h, openW, openH } = overlayDesignSize();
  const halfW = openW / 2;
  const halfH = openH / 2;
  /* the plane of the bezel opening (its front face) */
  const planeZ = panelFrontZ - 0.01 + CRT.frame.depth + CRT.frame.bevel;

  camera.updateMatrixWorld();
  const toScreen = (x, y) => {
    const p = new THREE.Vector3(x, y, planeZ).project(camera);
    return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
  };

  overlayEl.style.width = w + 'px';
  overlayEl.style.height = h + 'px';
  overlayEl.style.borderRadius = SCREEN_OVERLAY.borderRadiusPx + 'px';
  overlayEl.style.transform = quadTransform(
    w, h,
    toScreen(-halfW, CRT.centerY + halfH),  // top-left
    toScreen(halfW, CRT.centerY + halfH),   // top-right
    toScreen(-halfW, CRT.centerY - halfH),  // bottom-left
    toScreen(halfW, CRT.centerY - halfH)    // bottom-right
  );
  overlayEl.classList.add('is-visible');
}

/* ============================== render / resize ============================== */

function render() {
  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyPreset(currentPreset);
}

addEventListener('resize', resize);
resize();
