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
  // プレイヤー移動とアイテム取得（AIも内部で処理される）
  const playerAction = updatePlayers(dt, runAI);
  
  // ボール発射処理
  if (playerAction && playerAction.action === 'fire') {
    placeBall(playerAction.player);
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
