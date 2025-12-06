/**
 * 入力処理
 */

import { TILE } from './constants.js';
import { state } from './state.js';

/**
 * キーボード入力のセットアップ
 * - 全てのキーを小文字化してkeysオブジェクトに記録
 * - 矢印キーとスペースキーのデフォルト動作(スクロール)を無効化
 */
export function setupKeyboardInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    state.keys[k] = true;
    // 矢印キーとスペースのデフォルト動作(スクロール)を防止
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }
  });
  
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    state.keys[k] = false;
  });
}

/**
 * キャンバスクリック: P1の向きを設定
 * クリック位置がプレイヤーから見てどの方向かを計算し、向きを更新
 * (ボール発射方向に影響)
 */
export function setupCanvasClick(canvas) {
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const p = state.players[0];
    if (!p) return;
    const px = (p.x + 0.5) * TILE, py = (p.y + 0.5) * TILE;
    const dx = mx - px, dy = my - py;
    // 水平距離と垂直距離を比較して、大きい方を優先
    if (Math.abs(dx) > Math.abs(dy)) p.dir = { x: dx > 0 ? 1 : -1, y: 0 };
    else p.dir = { x: 0, y: dy > 0 ? 1 : -1 };
  });
}

/**
 * UIイベントのバインディング
 * - リセットボタン: ゲームを再開始
 * - CPUトグル: P2をCPU制御に切り替え
 * - キー設定適用ボタン: カスタムキーバインドを適用
 */
export function setupUIBindings(resetCallback) {
  document.getElementById('resetBtn').addEventListener('click', resetCallback);
  
  document.getElementById('cpuToggle').addEventListener('change', (e) => {
    state.players[1].isCPU = e.target.checked;
  });
  
  document.getElementById('applyKeys').addEventListener('click', () => {
    const p1 = document.getElementById('p1fire').value.trim().toLowerCase();
    const p2 = document.getElementById('p2fire').value.trim().toLowerCase();
    const norm = (v) => v === 'space' ? ' ' : v; // "space"文字列をスペース文字に変換
    if (p1) state.keybinds.p1fire = norm(p1);
    if (p2) state.keybinds.p2fire = norm(p2);
  });
}
