/**
 * ユーティリティ関数群
 */

import { COLS, ROWS } from './constants.js';
import { state } from './state.js';

/**
 * 座標がフィールド内か判定
 */
export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS;
}

/**
 * 指定座標のマップ値取得(範囲外は壁扱い)
 */
export function cellAt(x, y) {
  if (!inBounds(x, y)) return 1;
  return state.map[y][x];
}

/**
 * 指定座標にボールが存在するか（切り捨てで所属マス判定）
 */
export function ballExists(x, y) {
  return state.balls.some(k => Math.floor(k.fx) === x && Math.floor(k.fy) === y);
}

/**
 * オーディオコンテキスト(遅延初期化)
 */
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

/**
 * 効果音再生: オシレーターでシンプルなビープ音を生成
 */
export function beep(freq, time = 0.06) {
  try {
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + time);
  } catch (e) { }
}
