// モバイル用: オリジナルcanvasをフルスクリーンに拡大表示するためのブリッター
let displayCanvas = null;
let displayCtx = null;
let sourceCanvas = null;
let rafId = null;
let lastW = 0;
let lastH = 0;
let layout = { scale: 1, dx: 0, dy: 0, dw: 0, dh: 0 };

function computeLayout() {
  if (!sourceCanvas || !displayCanvas) return;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  displayCanvas.width = vw;
  displayCanvas.height = vh;
  const scale = Math.min(vw / sw, vh / sh);
  const dw = Math.floor(sw * scale);
  const dh = Math.floor(sh * scale);
  const dx = Math.floor((vw - dw) / 2);
  const dy = Math.floor((vh - dh) / 2);
  layout = { scale, dx, dy, dw, dh };
}

function blit() {
  if (!displayCtx || !sourceCanvas) return;
  if (lastW !== displayCanvas.width || lastH !== displayCanvas.height) {
    lastW = displayCanvas.width;
    lastH = displayCanvas.height;
    displayCtx.imageSmoothingEnabled = false;
  }
  displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  displayCtx.drawImage(sourceCanvas, layout.dx, layout.dy, layout.dw, layout.dh);
  rafId = window.requestAnimationFrame(blit);
}

export function createDisplayCanvas() {
  if (displayCanvas) return displayCanvas;
  displayCanvas = document.createElement('canvas');
  displayCanvas.id = 'game-display';
  displayCanvas.style.position = 'fixed';
  displayCanvas.style.inset = '0';
  displayCanvas.style.zIndex = '9000';
  displayCanvas.style.background = 'transparent';
  document.body.appendChild(displayCanvas);
  displayCtx = displayCanvas.getContext('2d', { alpha: true });
  displayCtx.imageSmoothingEnabled = false;
  return displayCanvas;
}

export function startDisplayBlit(srcCanvas) {
  sourceCanvas = srcCanvas;
  if (!displayCanvas) createDisplayCanvas();
  computeLayout();
  stopDisplayBlit();
  rafId = window.requestAnimationFrame(blit);
  window.addEventListener('resize', () => { computeLayout(); });
  window.addEventListener('orientationchange', () => { computeLayout(); });
}

export function stopDisplayBlit() {
  if (rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
}

export function removeDisplayCanvas() {
  stopDisplayBlit();
  if (displayCanvas) { displayCanvas.remove(); displayCanvas = null; displayCtx = null; }
}

export function isDisplayActive() { return !!displayCanvas; }
