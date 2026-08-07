import { Application } from 'https://unpkg.com/@splinetool/runtime@1.12.98/build/runtime.js';

const landing = document.getElementById('spline-landing');
const desktop = document.getElementById('desktop-interface');
const canvas = document.getElementById('canvas3d');
const launchBtn = document.getElementById('launch-bhlkg-btn');
const exitBtn = document.getElementById('exit-btn');
const monitorPreview = document.getElementById('monitor-preview');

const SCENE_URL = 'https://prod.spline.design/izlvrcpPGTlAV-dY/scene.splinecode';
const ENTER_REVEAL_DELAY = 920;
const EXIT_REVEAL_DELAY = 700;
/* Inset so the image stays inside the CRT glass, not on the bezel */
const PREVIEW_INSET = 0.06;

let app = null;
let transitioning = false;
let onDesktop = false;
let desktopBooted = false;
let previewRaf = 0;

/* Subtle orbit: keep initial framing, no full spin / no through-geometry */
const CAM = {
  yawDeg: 32,       /* ± horizontal from initial view */
  pitchUpDeg: 18,   /* don't climb above the wall */
  pitchDownDeg: 42, /* allow looking down at desk / monitor */
  zoomIn: 1.0,      /* lock zoom-in at home distance — prevents 穿模 */
  zoomOut: 0.82,    /* mild zoom-out only */
  rotateSpeed: 0.65,
  zoomSpeed: 0.55,
};

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function getOrbit(application) {
  return application?.controls?.orbitControls
    || application?._controls?.orbitControls
    || null;
}

function constrainLandingCamera(application) {
  const orbit = getOrbit(application);
  if (!orbit?.spherical) {
    console.warn('[spline] orbitControls not ready — camera limits skipped');
    return;
  }

  const theta0 = orbit.spherical.theta;
  const phi0 = orbit.spherical.phi;
  const radius0 = orbit.spherical.radius;

  const yaw = degToRad(CAM.yawDeg);
  const pitchUp = degToRad(CAM.pitchUpDeg);
  const pitchDown = degToRad(CAM.pitchDownDeg);

  orbit.minTheta = theta0 - yaw;
  orbit.maxTheta = theta0 + yaw;
  orbit.minPhi = Math.max(0.08, phi0 - pitchUp);
  orbit.maxPhi = Math.min(Math.PI - 0.08, phi0 + pitchDown);
  orbit.isThetaFlipped = orbit.minTheta > orbit.maxTheta;

  /* mode 3 = limit both horizontal + vertical */
  orbit.rotationLimitsMode = 3;
  orbit.rotationSoftLimit = 1;
  orbit.thetaIsFree = false;
  orbit.phiIsFree = false;
  if (orbit.rotationRangeFactor?.set) {
    orbit.rotationRangeFactor.set(yaw, (pitchUp + pitchDown) / 2);
  }

  /* Zoom relative to home distance — lock zoom-in so camera can't 穿模 */
  const currentZoom = 1000 / Math.max(radius0, 1e-3);
  orbit.zoomLimitsEnabled = true;
  orbit.minZoom = currentZoom * CAM.zoomOut;
  orbit.maxZoom = currentZoom * CAM.zoomIn; /* === home zoom when zoomIn is 1 */
  orbit.minDistance = radius0; /* never closer than the initial camera */
  orbit.maxDistance = Math.max(orbit.minDistance, 1000 / orbit.minZoom);

  /* Hard-clamp current radius in case load left us too close */
  if (orbit.spherical.radius < orbit.minDistance) {
    orbit.spherical.radius = orbit.minDistance;
  }

  orbit.enablePan = false;
  orbit.panLimitsMode = 0;
  orbit.enableRotate = true;
  orbit.enableZoom = CAM.zoomOut < CAM.zoomIn; /* zoom-out only when locked in */
  orbit.enableDamping = true;
  orbit.rotateSpeed = CAM.rotateSpeed;
  orbit.zoomSpeed = CAM.zoomSpeed;

  orbit.__bhlkgHome = { theta: theta0, phi: phi0, radius: radius0 };

  console.info('[spline] camera constrained around initial view', {
    yaw: `±${CAM.yawDeg}°`,
    pitch: `-${CAM.pitchDownDeg}° / +${CAM.pitchUpDeg}°`,
    distance: [orbit.minDistance.toFixed(1), orbit.maxDistance.toFixed(1)],
  });
}

function resetCameraToHome(application) {
  const orbit = getOrbit(application);
  const home = orbit?.__bhlkgHome;
  if (!orbit || !home) {
    application?.setZoom?.(1);
    return;
  }

  orbit.spherical.theta = home.theta;
  orbit.spherical.phi = home.phi;
  orbit.spherical.radius = home.radius;

  if (orbit.sphericalDelta) {
    orbit.sphericalDelta.theta = 0;
    orbit.sphericalDelta.phi = 0;
    if ('radius' in orbit.sphericalDelta) orbit.sphericalDelta.radius = 0;
  }
  if (orbit.panOffset?.set) orbit.panOffset.set(0, 0, 0);
  if (orbit.scale !== undefined) orbit.scale = 1;

  try {
    orbit.update?.();
    application.requestRender?.();
  } catch (err) {
    console.warn('[spline] camera reset warning', err);
  }
}

function setMonitorCursor(active) {
  if (!canvas) return;
  canvas.classList.toggle('is-monitor-hover', active);
  canvas.style.cursor = active ? 'pointer' : 'default';
}

function isLaunchObject(name) {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n === 'launch bhlkg' || n === 'launchbhlkg' || n === 'launch';
}

function normalizeObjectName(name) {
  return (name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isMonitorObject(name) {
  const n = normalizeObjectName(name);
  if (!n) return false;
  /* Exact new names + any object whose name contains monitor/screen */
  return (
    n === 'monitorscreen_new'
    || n === 'monitor_new'
    || n === 'monitorscreen'
    || n === 'monitor'
    || (n.includes('monitor') && n.includes('screen'))
    || n.includes('monitor_new')
    || n.includes('monitorscreen_new')
  );
}

function findNamedObject(application, names) {
  for (const name of names) {
    const obj =
      application?.findObjectByName?.(name)
      || application?._scene?.getObjectByName?.(name);
    if (obj) return obj;
  }
  return null;
}

function resetLandingVisualState() {
  if (!landing) return;
  landing.classList.remove('is-exiting', 'is-parked', 'is-disposed');
  landing.removeAttribute('aria-hidden');
  /* force style recalc so scale/opacity animate from identity */
  void landing.offsetWidth;
}

/* ---------- Monitor static image preview (clipped to CRT screen mesh) ---------- */

function getMonitorScreenMesh(application) {
  return findNamedObject(application, [
    'monitorscreen_new',
    'MonitorScreen_new',
    'monitor_new',
    'Monitor_new',
    'MonitorScreen',
  ]);
}

function getSplineCamera(application) {
  return (
    application?._scene?.activePage?.activeCamera
    || getOrbit(application)?.object
    || null
  );
}

/** Project MonitorScreen world bounds → CSS rect inside #spline-landing */
function projectMonitorScreenRect(application) {
  const mesh = getMonitorScreenMesh(application);
  const camera = getSplineCamera(application);
  if (!mesh || !camera || !canvas || !landing) return null;

  try {
    mesh.updateWorldMatrix?.(true, true);
    const geo = mesh.geometry;
    if (!geo) return null;
    if (!geo.boundingBox && geo.computeBoundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return null;

    const tmp = mesh.position.clone();
    const { min, max } = bb;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let behind = 0;
    let total = 0;

    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          total += 1;
          tmp.set(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera);
          if (tmp.z < -1 || tmp.z > 1) {
            behind += 1;
            continue;
          }
          const px = (tmp.x * 0.5 + 0.5) * canvas.clientWidth;
          const py = (-tmp.y * 0.5 + 0.5) * canvas.clientHeight;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      }
    }

    if (!Number.isFinite(minX) || behind === total) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const landingRect = landing.getBoundingClientRect();
    const ox = canvasRect.left - landingRect.left;
    const oy = canvasRect.top - landingRect.top;

    let left = ox + minX;
    let top = oy + minY;
    let width = maxX - minX;
    let height = maxY - minY;

    /* Pull in slightly so content stays on the glass */
    const insetX = width * PREVIEW_INSET;
    const insetY = height * PREVIEW_INSET;
    left += insetX;
    top += insetY;
    width -= insetX * 2;
    height -= insetY * 2;

    if (width < 8 || height < 8) return null;
    return { left, top, width, height };
  } catch (err) {
    console.warn('[spline] monitor projection failed', err);
    return null;
  }
}

function layoutMonitorPreview(rect) {
  if (!monitorPreview || !rect) return;

  monitorPreview.style.left = `${rect.left}px`;
  monitorPreview.style.top = `${rect.top}px`;
  monitorPreview.style.width = `${rect.width}px`;
  monitorPreview.style.height = `${rect.height}px`;
  monitorPreview.classList.add('is-ready');
}

function syncMonitorPreview() {
  if (!app || onDesktop || transitioning) return;
  const rect = projectMonitorScreenRect(app);
  if (rect) layoutMonitorPreview(rect);
}

function startMonitorPreviewSync() {
  stopMonitorPreviewSync();
  const tick = () => {
    syncMonitorPreview();
    previewRaf = requestAnimationFrame(tick);
  };
  previewRaf = requestAnimationFrame(tick);
}

function stopMonitorPreviewSync() {
  if (previewRaf) {
    cancelAnimationFrame(previewRaf);
    previewRaf = 0;
  }
}

/* Shared enter transition for MonitorScreen + Launch bhlkg */
function enterDesktop(source = 'unknown') {
  if (transitioning || onDesktop) return;
  transitioning = true;
  setMonitorCursor(false);
  if (launchBtn) launchBtn.disabled = true;

  console.info('[spline] starting landing → desktop transition via', source);
  stopMonitorPreviewSync();

  /* Same as previous MonitorScreen transition: scale up + fade to black */
  if (landing) {
    landing.classList.remove('is-parked', 'is-disposed');
    landing.classList.add('is-exiting');
  }

  window.setTimeout(() => {
    document.body.classList.remove('landing-active', 'desktop-exiting');
    document.body.classList.add('desktop-active');

    if (desktop) {
      desktop.hidden = false;
      desktop.setAttribute('aria-hidden', 'false');
    }

    if (landing) {
      landing.classList.add('is-parked');
      landing.setAttribute('aria-hidden', 'true');
      landing.classList.remove('is-exiting');
    }

    /* Pause rendering while parked — do not dispose / reload scene */
    try {
      app?.stop?.();
    } catch (err) {
      console.warn('[spline] stop warning', err);
    }

    if (!desktopBooted) {
      document.dispatchEvent(
        new CustomEvent('bhlkg:enter-desktop', { bubbles: true })
      );
      desktopBooted = true;
    }

    onDesktop = true;
    transitioning = false;
    console.info('[spline] desktop revealed; landing parked (scene kept alive)');
  }, ENTER_REVEAL_DELAY);
}

function exitToLanding() {
  if (transitioning || !onDesktop) return;
  transitioning = true;

  console.info('[spline] starting desktop → landing transition');
  document.body.classList.add('desktop-exiting');

  window.setTimeout(() => {
    document.body.classList.remove('desktop-active', 'desktop-exiting');
    document.body.classList.add('landing-active');

    if (desktop) {
      desktop.hidden = true;
      desktop.setAttribute('aria-hidden', 'true');
    }

    resetLandingVisualState();

    try {
      app?.play?.();
      resetCameraToHome(app);
      /* re-assert limits in case play() refreshed controls */
      constrainLandingCamera(app);
    } catch (err) {
      console.warn('[spline] play/reset warning', err);
    }

    if (launchBtn) launchBtn.disabled = false;
    setMonitorCursor(false);

    onDesktop = false;
    transitioning = false;
    startMonitorPreviewSync();
    console.info('[spline] landing restored to initial view');
  }, EXIT_REVEAL_DELAY);
}

async function initSpline() {
  if (!canvas) {
    console.error('[spline] #canvas3d not found');
    return;
  }

  app = new Application(canvas, { renderMode: 'continuous' });

  try {
    await app.load(SCENE_URL);
    console.info('[spline] scene loaded', SCENE_URL);

    /* Constrain orbit after load so the initial camera pose stays the home view */
    constrainLandingCamera(app);

    const screen = findNamedObject(app, [
      'monitorscreen_new',
      'MonitorScreen_new',
      'monitor_new',
      'Monitor_new',
      'MonitorScreen',
    ]);
    if (!screen) {
      console.warn('[spline] monitor_new / monitorscreen_new not found in scene');
    } else {
      console.info('[spline] monitor target found', { uuid: screen.uuid, name: screen.name });
    }

    startMonitorPreviewSync();
    console.info('[spline] static monitor preview sync started (desktop-preview.png)');

    const events = app.getSplineEvents?.() || {};
    const mouseDownMap = events.mouseDown || {};
    const mouseDownNames = Object.values(mouseDownMap).map((ev) => ev?.target?.name);
    console.info('[spline] objects with Mouse Down events:', mouseDownNames);

    const mouseHoverMap = events.mouseHover || {};
    const mouseHoverNames = Object.values(mouseHoverMap).map((ev) => ev?.target?.name);
    console.info('[spline] objects with Mouse Hover events:', mouseHoverNames);

    const monitorRelated = (app.getAllObjects?.() || [])
      .map((o) => o.name)
      .filter((n) => /monitor|screen|launch/i.test(n || ''));
    console.info('[spline] monitor/launch-related object names:', monitorRelated);

    app.addEventListener('mouseHover', (event) => {
      if (transitioning || onDesktop) return;
      const hovering = isMonitorObject(event.target?.name);
      setMonitorCursor(hovering);
      if (hovering) console.log('[spline] hovering monitor:', event.target?.name);
    });

    app.addEventListener('mouseDown', (event) => {
      const name = event.target?.name;
      console.log('[spline] clicked object:', name);

      if (isMonitorObject(name)) {
        console.log('[spline] monitor clicked:', name);
        enterDesktop(name);
        return;
      }

      if (isLaunchObject(name)) {
        console.log('[spline] Launch control clicked:', name);
        enterDesktop('Launch');
      }
    });

    /* Also bind Spline's native mouseDown targets by name after load */
    for (const ev of Object.values(mouseDownMap)) {
      const targetName = ev?.target?.name;
      if (!isMonitorObject(targetName)) continue;
      console.info('[spline] Mouse Down wired on:', targetName);
    }

    console.info('[spline] mouseDown / mouseHover listeners bound (monitor_new / monitorscreen_new)');
  } catch (err) {
    console.error('[spline] failed to load scene', err);
  }
}

if (launchBtn) {
  launchBtn.addEventListener('click', () => {
    console.log('[spline] Launch bhlkg button clicked');
    enterDesktop('Launch bhlkg button');
  });
}

if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    console.log('[spline] Exit clicked');
    exitToLanding();
  });
}

initSpline();
