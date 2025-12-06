/**
 * メインゲームループと統合
 */

import { COLS, ROWS, CANVAS_W, CANVAS_H } from './constants.js';
import { state, resetState } from './state.js';
import { initMap } from './map.js';
import { createPlayer, updatePlayers, stopMoveAtCurrentPosition } from './player.js';
import { placeBall, updateBalls, updatePreviews, updateExplosions } from './ball.js';
import { runAI, dangerCellsFromBalls } from './ai.js';
import { render } from './renderer.js';
import { setupKeyboardInput, setupCanvasClick, setupUIBindings } from './input.js';

// Canvas初期化
const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

/**
 * ゲームのリセット
 * - マップを再生成
 * - 全エンティティをクリア
 * - プレイヤーを初期位置に配置
 * - CPU設定をUIから取得
 */
function resetGame() {
  initMap();
  resetState();
  state.players = [
    createPlayer(1, 1, 1, '#ff6b6b'),              // P1: 左上
    createPlayer(2, COLS - 2, ROWS - 2, '#4da6ff')     // P2: 右下
  ];
  state.players[1].isCPU = document.getElementById('cpuToggle').checked;
  updateMessage('');
}

/**
 * 勝敗判定
 * 生存者が1人以下になったらゲーム終了
 * - 1人生き残っていればそのプレイヤーの勝利
 * - 0人なら引き分け
 * 1.2秒後にゲームをリセット
 */
function checkWin() {
  const alive = state.players.filter(p => p.alive);
  if (alive.length <= 1) {
    const msg = alive.length === 1 ? `Player ${alive[0].id} の勝ち!` : '引き分け';
    updateMessage(msg + ' リセットします...');
    setTimeout(() => resetGame(), 1200);
  }
}

/**
 * メッセージ表示を更新
 */
function updateMessage(msg) {
  const el = document.getElementById('message');
  if (el) el.textContent = msg;
}

/**
 * プレイヤー更新処理の拡張版
 * AI危険回避と発射処理を統合
 */
function updatePlayersWithAI(dt) {
  // P1の発射処理
  if (state.players[0].alive && state.keys[state.keybinds.p1fire]) {
    placeBall(state.players[0]);
    state.keys[state.keybinds.p1fire] = false;
  }

  // P2の処理(CPUまたは人間)
  let p2Action = null;
  if (state.players[1].isCPU) {
    p2Action = runAI(state.players[1], dt);
  } else if (state.players[1].alive && state.keys[state.keybinds.p2fire]) {
    placeBall(state.players[1]);
    state.keys[state.keybinds.p2fire] = false;
  }

  // AI発射処理
  if (p2Action && p2Action.action === 'fire') {
    placeBall(p2Action.player);
  }

  // プレイヤー移動とアイテム取得
  updatePlayers(dt, runAI);

  // CPU移動中の危険回避
  for (const p of state.players) {
    if (!p.alive || !p.isCPU || !p.moving || !p.pendingTarget) continue;
    const danger = dangerCellsFromBalls();
    const tx = Math.floor(p.pendingTarget.x + 0.0001);
    const ty = Math.floor(p.pendingTarget.y + 0.0001);
    if (danger.has(`${tx},${ty}`)) {
      stopMoveAtCurrentPosition(p);
    }
  }
}

/**
 * メイン更新処理: 全ゲーム要素を毎フレーム更新
 * @param {number} dt - デルタタイム(秒)
 */
function update(dt) {
  updatePlayersWithAI(dt);   // プレイヤーの移動と入力処理
  updateBalls(dt);           // ボールの移動と導火線処理
  updatePreviews();          // 爆発プレビューの更新
  updateExplosions(dt);      // 爆発エフェクトの更新
  checkWin();                // 勝敗判定
}

/**
 * メインループ: requestAnimationFrameで呼ばれる
 * @param {number} ts - タイムスタンプ(ミリ秒)
 * デルタタイムを計算し、60ms以上はクランプ(フレームレート急下時の異常動作防止)
 */
function loop(ts) {
  const dt = Math.min(0.06, (ts - state.lastTime) / 1000); // 最大60msに制限
  state.lastTime = ts;
  update(dt);
  render(ctx);
  requestAnimationFrame(loop);
}

// 入力処理のセットアップ
setupKeyboardInput();
setupCanvasClick(canvas);
setupUIBindings(resetGame);

// ゲーム開始
resetGame();
requestAnimationFrame(loop);

// デバッグ用: コンソールからゲーム状態にアクセス可能
window._magicball = { state };
