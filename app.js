/* ------- reusable BHLKG MacWindow registry + centralized content ------- */
const windowContent = {
  video: {
    id: 'win-video',
    icon: 'ico-video',
    title: 'bhlkg.mov',
    image: 'images/bhlkg logo.svg',
    fit: 'contain',
    alt: 'BHLKG video placeholder',
    width: '640px',
    resizable: true,
    defaultOpen: true,
    defaultPosition: { x: 0.28, y: 0.08 },
  },
  fashion: {
    id: 'win-fashion-app',
    icon: 'ico-fashion',
    title: 'Fashion',
    image: 'images/ascii_fashion_icon.svg',
    fit: 'contain',
    alt: 'Fashion placeholder',
    width: '520px',
    resizable: true,
    defaultOpen: true,
    defaultPosition: { x: 0.15, y: 0.30 },
  },
  magazine: {
    id: 'win-magazine-app',
    icon: 'ico-magazine',
    title: 'Magazine',
    image: 'images/ascii_magazine_icon.svg',
    fit: 'contain',
    alt: 'Magazine placeholder',
    width: '540px',
    resizable: true,
    defaultOpen: true,
    defaultPosition: { x: 0.50, y: 0.34 },
  },
  notification: {
    id: 'win-notification',
    icon: null,
    title: 'Notification',
    width: '360px',
    resizable: false,
    defaultOpen: true,
    defaultPosition: { x: 0.68, y: 0.07 },
  },
};

function macWindowBody(variant, config) {
  if (variant === 'notification') {
    return `
      <div class="mac-notification">
        <p>Welcome to bhlkg. New work and studio updates are ready to explore.</p>
        <div class="mac-actions">
          <button type="button" class="mac-action" id="btn-explore" data-win="win-welcome">Explore</button>
          <button type="button" class="mac-action" data-close-window>Later</button>
        </div>
      </div>`;
  }

  const image = `
    <img class="mac-placeholder" src="${config.image}" alt="${config.alt}"
         style="object-fit:${config.fit}" draggable="false" />`;

  if (variant === 'video') {
    return `
      <div class="mac-canvas mac-video-canvas">${image}</div>
      <div class="mac-transport" aria-label="Video transport placeholder">
        <div class="mac-transport__buttons" aria-hidden="true">
          <span class="mac-transport__button mac-transport__play"></span>
          <span class="mac-transport__button mac-transport__pause"></span>
          <span class="mac-transport__button mac-transport__stop"></span>
        </div>
        <div class="mac-rail"><span></span></div>
        <div class="mac-volume" aria-hidden="true"><span>◖</span><div class="mac-rail"><span></span></div></div>
      </div>`;
  }

  if (variant === 'magazine') {
    return `
      <div class="mac-archive-strip"><span>BHLKG / ARCHIVE</span><span>INDEX 001</span></div>
      <div class="mac-canvas mac-editorial-canvas">${image}</div>
      <div class="mac-page-rail"><span>01</span><div class="mac-rail"><span></span></div><span>12</span></div>`;
  }

  return `
    <div class="mac-fashion-layout">
      <div class="mac-tool-rail" aria-hidden="true">
        <span>+</span><span>◇</span><span>╱</span><span>□</span>
      </div>
      <div class="mac-canvas mac-editorial-canvas">${image}</div>
    </div>
    <div class="mac-swatch-rail" aria-hidden="true">
      <span></span><span></span><span></span><span></span><b>LOOK 001 / MONO</b>
    </div>`;
}

function MacWindow(variant, config) {
  const resizeClass = config.resizable ? ' mac-window--resizable' : '';
  return `
    <article class="window mac-window mac-window--${variant}${resizeClass}"
             id="${config.id}" data-desk="${variant}"
             style="--window-width:${config.width}"
             aria-labelledby="title-${variant}">
      <header class="mac-titlebar" data-drag>
        <button type="button" class="mac-close closebox" aria-label="Close ${config.title} window"></button>
        <div class="mac-titlebar__stripes" aria-hidden="true"></div>
        <div class="mac-titlebar__title" id="title-${variant}">${config.title}</div>
        <button type="button" class="mac-zoom win-btn win-expand" aria-label="Expand ${config.title} window"></button>
      </header>
      <section class="mac-window__body">${macWindowBody(variant, config)}</section>
      <div class="mac-resize-grip" aria-hidden="true"></div>
    </article>`;
}

const macWindowRoot = document.getElementById('mac-window-root');
if (macWindowRoot) {
  macWindowRoot.innerHTML = Object.entries(windowContent)
    .map(([variant, config]) => MacWindow(variant, config))
    .join('');
}

const desktopWindows = windowContent;

/* ------- tiny window manager: focus, close, drag (pointer events) ------- */
const wins = [...document.querySelectorAll('.window')];
let topZ = 100;

function focusWin(w) {
  if (!w) {
    wins.forEach(x => x.classList.remove('focused'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('is-open'));
    return;
  }
  topZ += 1;
  w.style.zIndex = topZ;
  wins.forEach(x => x.classList.toggle('focused', x === w));
  document.querySelectorAll('.menu-item').forEach(m => {
    const t = document.getElementById(m.dataset.win);
    m.classList.toggle('is-open', t && t.classList.contains('open') && t.classList.contains('focused'));
  });
}

const spawnPos = { 'win-welcome': [-36, -64], 'win-about': [42, -18] };

function uiScale() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
}

function winVisualSize(w) {
  const scale = w.classList.contains('ratio-scale') ? uiScale() : 1;
  return {
    w: (w.offsetWidth || 400) * scale,
    h: (w.offsetHeight || 280) * scale,
  };
}

function placeFromConfig(w, cfg) {
  if (!cfg || w.dataset.placed) return;
  const x = Math.round(innerWidth * cfg.defaultPosition.x);
  const y = Math.round(innerHeight * cfg.defaultPosition.y);
  w.style.left = x + 'px';
  w.style.top  = y + 'px';
  w.dataset.placed = '1';
}

function openWin(w) {
  if (!w) return;
  w.classList.add('open');
  w.classList.remove('minimized');
  const key = w.dataset.desk;
  const cfg = key && desktopWindows[key];
  if (cfg) {
    placeFromConfig(w, cfg);
  } else {
    const pos = spawnPos[w.id];
    if (pos && !w.dataset.placed) {
      const { w: ww, h: wh } = winVisualSize(w);
      w.style.left = Math.round((innerWidth - ww) / 2 + pos[0]) + 'px';
      w.style.top  = Math.round((innerHeight - wh) / 2 + pos[1]) + 'px';
      w.dataset.placed = '1';
    }
  }
  clampWin(w);
  focusWin(w);
}

function closeWin(w) {
  w.classList.remove('open', 'focused', 'maximized', 'minimized');
  const next = [...wins].reverse().find(x => x.classList.contains('open'));
  if (next) focusWin(next); else focusWin(null);
}

function clampWin(w) {
  if (innerWidth <= 760 && w.classList.contains('mac-window')) return;
  const r = w.getBoundingClientRect();
  const mb = 26, pad = 6;
  let x = Math.min(Math.max(parseFloat(w.style.left) || 0, pad), Math.max(pad, innerWidth - r.width - pad));
  let y = Math.min(Math.max(parseFloat(w.style.top) || 0, mb + pad), Math.max(mb + pad, innerHeight - 60));
  w.style.left = x + 'px';
  w.style.top = y + 'px';
}

function expandWin(w) {
  if (w.classList.contains('minimized')) w.classList.remove('minimized');
  w.classList.toggle('maximized');
  clampWin(w);
  focusWin(w);
}

function shrinkWin(w) {
  w.classList.remove('maximized');
  w.classList.toggle('minimized');
  clampWin(w);
  focusWin(w);
}

function bindWindow(w) {
  w.addEventListener('pointerdown', e => {
    if (e.target.closest('.closebox, .win-btn, [data-close-window]')) return;
    focusWin(w);
  });
  const close = w.querySelector('.closebox');
  if (close) {
    const doClose = e => {
      e.preventDefault();
      e.stopPropagation();
      closeWin(w);
    };
    close.addEventListener('pointerdown', e => { e.stopPropagation(); });
    close.addEventListener('pointerup', doClose);
    close.addEventListener('click', doClose);
  }
  w.querySelectorAll('[data-close-window]').forEach(button => {
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      closeWin(w);
    });
  });
  const shrink = w.querySelector('.win-shrink');
  if (shrink) {
    const doShrink = e => {
      e.preventDefault();
      e.stopPropagation();
      shrinkWin(w);
    };
    shrink.addEventListener('pointerdown', e => { e.stopPropagation(); });
    shrink.addEventListener('pointerup', doShrink);
    shrink.addEventListener('click', doShrink);
  }
  const expand = w.querySelector('.win-expand');
  if (expand) {
    const doExpand = e => {
      e.preventDefault();
      e.stopPropagation();
      expandWin(w);
    };
    expand.addEventListener('pointerdown', e => { e.stopPropagation(); });
    expand.addEventListener('pointerup', doExpand);
    expand.addEventListener('click', doExpand);
  }
  const bar = w.querySelector('[data-drag]');
  if (!bar) return;
  bar.addEventListener('pointerdown', e => {
    if (innerWidth <= 760 && w.classList.contains('mac-window')) return;
    if (e.target.closest('.closebox, .win-btn')) return;
    e.preventDefault();
    focusWin(w);
    const sx = e.clientX - w.offsetLeft, sy = e.clientY - w.offsetTop;
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      w.style.left = (ev.clientX - sx) + 'px';
      w.style.top  = Math.max(26, ev.clientY - sy) + 'px';
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      clampWin(w);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
}

wins.forEach(bindWindow);

document.querySelectorAll('.menu-item').forEach(m => {
  m.addEventListener('click', () => {
    const w = document.getElementById(m.dataset.win);
    if (w.classList.contains('open') && w.classList.contains('focused')) closeWin(w);
    else openWin(w);
  });
});

/* ------- desktop department shortcuts: select, drag, click → open/focus ------- */
const dicons = [...document.querySelectorAll('.dicon')];

(function layoutIcons() {
  const startY = 40, stepY = 118, colW = 118;
  const perCol = Math.max(3, Math.floor((innerHeight - startY - 16) / stepY));
  dicons.forEach((ic, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    ic.style.left = (12 + col * colW) + 'px';
    ic.style.top  = (startY + row * stepY) + 'px';
  });
})();

function selectIcon(ic) {
  dicons.forEach(x => x.classList.toggle('selected', x === ic));
}

function openFromIcon(ic) {
  const w = document.getElementById(ic.dataset.win);
  if (w) openWin(w); /* reopen if closed; focus + raise z-index if already open */
}

dicons.forEach(ic => {
  let dragged = false;
  ic.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragged = false;
    const sx = e.clientX, sy = e.clientY;
    const ox = ic.offsetLeft, oy = ic.offsetTop;
    ic.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!dragged && Math.abs(dx) + Math.abs(dy) < 5) return;
      dragged = true;
      ic.classList.add('dragging');
      selectIcon(ic);
      ic.style.left = Math.min(Math.max(ox + dx, 2), innerWidth - ic.offsetWidth - 2) + 'px';
      ic.style.top  = Math.min(Math.max(oy + dy, 28), innerHeight - 40) + 'px';
    };
    const up = () => {
      ic.removeEventListener('pointermove', move);
      ic.removeEventListener('pointerup', up);
      ic.classList.remove('dragging');
    };
    ic.addEventListener('pointermove', move);
    ic.addEventListener('pointerup', up);
  });
  ic.addEventListener('click', () => {
    if (dragged) return;
    selectIcon(ic);
    openFromIcon(ic);
  });
  ic.addEventListener('dblclick', e => {
    /* single-click already opens; prevent accidental double-toggle feel */
    e.preventDefault();
    if (!dragged) openFromIcon(ic);
  });
  ic.addEventListener('keydown', e => {
    if (e.key === 'Enter') openFromIcon(ic);
  });
});

/* click on empty desktop clears icon selection */
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.dicon') && !e.target.closest('.window')) {
    dicons.forEach(x => x.classList.remove('selected'));
  }
});

/* auto-open registered desktop windows in a scattered composition */
function bootDesktopWindows() {
  const order = ['video', 'fashion', 'magazine', 'notification'];
  order.forEach((key, i) => {
    const cfg = desktopWindows[key];
    if (!cfg || !cfg.defaultOpen) return;
    const w = document.getElementById(cfg.id);
    if (!w) return;
    w.classList.add('open');
    placeFromConfig(w, cfg);
    clampWin(w);
    w.style.zIndex = 40 + i;
  });
  /* fashion sits in front of the initial stack, matching a lived-in desktop */
  const fashion = document.getElementById(desktopWindows.fashion.id);
  if (fashion) focusWin(fashion);
}

/* Boot open windows only after leaving the Spline landing */
function onEnterDesktop() {
  bootDesktopWindows();
}
/* Listen on document — spline-scene dispatches here (does not bubble to window) */
document.addEventListener('bhlkg:enter-desktop', onEnterDesktop);
/* If page is opened already in desktop mode (no landing), boot on load */
addEventListener('load', () => {
  if (document.body.classList.contains('desktop-active')) bootDesktopWindows();
});

/* ------- dir listings: inject 1-bit folder/file glyphs ------- */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const shapes = {
    d: [[0,0,7,1],[0,1,1,10],[7,1,1,1],[8,2,6,1],[13,3,1,8],[1,10,13,1]],
    f: [[3,0,7,1],[3,1,1,10],[9,1,1,1],[10,2,2,1],[11,3,1,8],[3,11,9,1],[5,5,4,1],[5,7,4,1]]
  };
  document.querySelectorAll('.dir li').forEach(li => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fico');
    svg.setAttribute('viewBox', '0 0 14 12');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    (shapes[li.dataset.t] || shapes.f).forEach(([x, y, w, h]) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', w); r.setAttribute('height', h);
      svg.appendChild(r);
    });
    li.prepend(svg);
  });
})();

/* ------- Exit (plain button, no action wired yet) ------- */

/* keep open windows inside the viewport as the browser / --ui-scale changes */
const UI_DESIGN_W = 1280;
const UI_SCALE_MIN = 0.55;
const UI_SCALE_MAX = 1.15;

function updateUiScale() {
  const raw = innerWidth / UI_DESIGN_W;
  const scale = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, raw));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

updateUiScale();

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateUiScale();
    wins.forEach(w => {
      if (!w.classList.contains('open')) return;
      clampWin(w);
    });
  }, 50);
});

/* Notification → Explore opens Welcome */
const exploreBtn = document.getElementById('btn-explore');
if (exploreBtn) {
  exploreBtn.addEventListener('click', () => {
    const target = document.getElementById(exploreBtn.dataset.win || 'win-welcome');
    openWin(target);
  });
}