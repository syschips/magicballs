// モバイル用UIコンポーネント（方向キー＋発射ボタン／横向き案内）
import { state } from './state.js';
import { notifyInputChanged } from './input.js';
import { createDisplayCanvas, startDisplayBlit, stopDisplayBlit, removeDisplayCanvas, isDisplayActive } from './displayCanvas.js';

function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
}

function isMobileViewport() {
  const ua = navigator.userAgent.toLowerCase();
  const isPhoneUA = /(iphone|ipod|android.*mobile|windows phone)/.test(ua);
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 900;
  return isTouchDevice() && (isPhoneUA || narrow);
}

function isLandscape() {
  if (window.matchMedia) {
    return window.matchMedia('(orientation: landscape)').matches;
  }
  // フォールバック（古いiOS): 0/180=portrait, 90/-90=landscape
  return Math.abs(window.orientation) === 90;
}

let overlayEl = null;
let dpadEl = null;
let fireEl = null;
let dragState = { active: false, target: null, offsetX: 0, offsetY: 0 };

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = 'mobile-orientation-overlay';
  overlayEl.innerHTML = `
    <div class="m-overlay-inner">
      <div class="m-overlay-card">
        <h3>スマホを横向きにしてください</h3>
        <p>横向きにするとボール選択やゲーム画面が最適化されます。</p>
        <div class="m-overlay-actions">
          <button id="m-overlay-back-btn">戻る</button>
          <button id="m-overlay-retry-btn" class="primary">再チェック</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  const backBtn = overlayEl.querySelector('#m-overlay-back-btn');
  const retryBtn = overlayEl.querySelector('#m-overlay-retry-btn');
  backBtn?.addEventListener('click', () => {
    // 直近の戻るボタンを呼び出す（キャラ選択／ルーム選択など）
    const backCandidates = [
      document.getElementById('backToAuthBtn'),
      document.getElementById('backToCharBtn')
    ];
    for (const b of backCandidates) {
      if (b && b.offsetParent !== null) { b.click(); return; }
    }
    // フォールバック：認証画面へ
    const authUI = document.getElementById('authUI');
    if (authUI) authUI.style.display = 'block';
  });
  retryBtn?.addEventListener('click', updateOverlayVisibility);
  return overlayEl;
}

function updateOverlayVisibility() {
  if (!isMobileViewport()) { hideOverlay(); return; }
  if (!overlayEl) ensureOverlay();
  if (!isLandscape()) {
    overlayEl.style.display = 'flex';
  } else {
    hideOverlay();
  }
}

function hideOverlay() {
  if (overlayEl) overlayEl.style.display = 'none';
}

function restorePosition(el, key, def) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      el.style.left = `${def.left}px`;
      el.style.top = `${def.top}px`;
      return;
    }
    const pos = JSON.parse(raw);
    if (typeof pos.left === 'number') el.style.left = `${pos.left}px`;
    if (typeof pos.top === 'number') el.style.top = `${pos.top}px`;
  } catch {}
}

function savePosition(el, key) {
  try {
    const rect = el.getBoundingClientRect();
    const left = rect.left;
    const top = rect.top;
    localStorage.setItem(key, JSON.stringify({ left, top }));
  } catch {}
}

function setupDraggable(el, storageKey) {
  const handle = el.querySelector('.drag-handle') || el;
  const onPointerDown = (e) => {
    dragState.active = true;
    dragState.target = el;
    const rect = el.getBoundingClientRect();
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragState.active || dragState.target !== el) return;
    const left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, e.clientX - dragState.offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - dragState.offsetY));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  const onPointerUp = (e) => {
    if (dragState.active && dragState.target === el) {
      dragState.active = false;
      dragState.target = null;
      savePosition(el, storageKey);
      el.releasePointerCapture?.(e.pointerId);
    }
  };
  handle.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function pressDir(key) {
  const keys = ['arrowleft','arrowright','arrowup','arrowdown'];
  keys.forEach(k => { state.keys[k] = (k === key); });
  notifyInputChanged();
}

function releaseDirs() {
  ['arrowleft','arrowright','arrowup','arrowdown'].forEach(k => state.keys[k] = false);
  notifyInputChanged();
}

function tapFire() {
  const fireKey = state.keybinds?.p1fire || ' ';
  state.keys[fireKey] = true;
  notifyInputChanged();
  // 短押しにする
  setTimeout(() => {
    state.keys[fireKey] = false;
    notifyInputChanged();
  }, 80);
}

function ensureDpad() {
  if (dpadEl) return;
  dpadEl = document.createElement('div');
  dpadEl.id = 'mobile-dpad';
  dpadEl.innerHTML = `
    <div class="drag-handle"></div>
    <button class="dir up" aria-label="up">▲</button>
    <div class="row">
      <button class="dir left" aria-label="left">◀</button>
      <button class="dir right" aria-label="right">▶</button>
    </div>
    <button class="dir down" aria-label="down">▼</button>
  `;
  document.body.appendChild(dpadEl);
  restorePosition(dpadEl, 'mobile_dpad_pos', { left: 16, top: window.innerHeight - 180 });
  setupDraggable(dpadEl, 'mobile_dpad_pos');
  const up = dpadEl.querySelector('.up');
  const down = dpadEl.querySelector('.down');
  const left = dpadEl.querySelector('.left');
  const right = dpadEl.querySelector('.right');
  const bind = (btn, key) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); pressDir(key); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); releaseDirs(); });
    btn.addEventListener('pointerleave', (e) => { e.preventDefault(); releaseDirs(); });
  };
  bind(up, 'arrowup');
  bind(down, 'arrowdown');
  bind(left, 'arrowleft');
  bind(right, 'arrowright');
}

function ensureFire() {
  if (fireEl) return;
  fireEl = document.createElement('div');
  fireEl.id = 'mobile-fire';
  fireEl.innerHTML = `
    <div class="drag-handle"></div>
    <button class="fire-btn" aria-label="fire">● 発射</button>
  `;
  document.body.appendChild(fireEl);
  restorePosition(fireEl, 'mobile_fire_pos', { left: window.innerWidth - 120, top: window.innerHeight - 140 });
  setupDraggable(fireEl, 'mobile_fire_pos');
  const fireBtn = fireEl.querySelector('.fire-btn');
  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tapFire(); });
}

function removeControls() {
  if (dpadEl) { dpadEl.remove(); dpadEl = null; }
  if (fireEl) { fireEl.remove(); fireEl = null; }
}

function applyMobileCanvasLayout() {
  document.body.classList.add('mobile-landscape');
  // ゲーム中はヘルプ非表示（画面最大化）
  document.body.classList.add('mobile-game');
}

function clearMobileCanvasLayout() {
  document.body.classList.remove('mobile-game');
}

export function initMobileControls() {
  if (!isMobileViewport()) return;
  window.addEventListener('resize', updateOverlayVisibility);
  window.addEventListener('orientationchange', updateOverlayVisibility);
}

export function onShowCharSelect() {
  if (!isMobileViewport()) return;
  document.body.classList.add('mobile-landscape');
  updateOverlayVisibility();
}

export function onShowGameUI() {
  if (!isMobileViewport()) return;
  applyMobileCanvasLayout();
  const gameCanvas = document.getElementById('game');
  if (isLandscape()) {
    // ゲーム画面はブリッターのdisplay canvasに拡大表示
    try {
      if (!isDisplayActive()) {
        createDisplayCanvas();
        // モバイルではオリジナルは非表示だがレンダリングは継続
        if (gameCanvas) gameCanvas.style.display = 'none';
        startDisplayBlit(gameCanvas);
      }
    } catch (e) {
      console.warn('[Mobile] display blit failed, fallback to showing original canvas', e);
      if (gameCanvas) gameCanvas.style.display = 'block';
    }
    ensureDpad();
    ensureFire();
  } else {
    // 縦向きは操作UIを消して案内表示
    removeControls();
    try { stopDisplayBlit(); removeDisplayCanvas(); } catch {}
    if (gameCanvas) gameCanvas.style.display = 'block';
    updateOverlayVisibility();
  }
}

export function onLeaveGameUI() {
  removeControls();
  clearMobileCanvasLayout();
  hideOverlay();
  try { stopDisplayBlit(); removeDisplayCanvas(); } catch {}
  const gameCanvas = document.getElementById('game');
  if (gameCanvas) gameCanvas.style.display = 'block';
}
