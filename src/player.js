/**
 * プレイヤー関連の処理
 */

import { COLS, ROWS } from './constants.js';
import { state } from './state.js';
import { inBounds, cellAt, ballExists } from './utils.js';

/**
 * プレイヤーオブジェクトの生成
 * @param {number} id - プレイヤーID (1 or 2)
 * @param {number} x - 初期X座標
 * @param {number} y - 初期Y座標
 * @param {string} color - 表示色
 * @returns プレイヤーオブジェクト
 */
export function createPlayer(id, x, y, color) {
  return {
    id, x, y, color,
    moving: false,           // 移動中フラグ
    pendingTarget: null,     // 移動先座標
    moveProgress: 0,         // 移動進捗(0-1)
    dir: { x: 0, y: 1 },    // 向いている方向(ボール発射方向)
    speedTilesPerSec: 5,    // 移動速度: 1タイル/0.2秒 = 5タイル/秒
    alive: true,            // 生存状態
    kuroStats: { speed: 1.0, interval: 0.6, stage: 3.0 }, // ボール性能(将来の拡張用)
    lastFire: -999,         // 最後にボールを発射した時刻
    isCPU: false,           // CPU制御フラグ
    _ai: { timer: 0, dir: { x: 0, y: 0 }, gameStartTime: performance.now() / 1000, justFired: false }, // AI用内部状態
    items: { maxBalls: 0, range: 0, speed: 0 } // 取得したアイテム数
  };
}

/**
 * キー入力から移動方向を計算
 * 仕様:
 * - 斜め移動なし
 * - 複数キー同時押し時の優先順位: 左 > 右 > 下 > 上
 * @param {Object} mapping - 方向ごとのキーマッピング
 * @returns {Object} {dx, dy} - 移動方向ベクトル
 */
export function computeMoveDirectionFromKeys(mapping) {
  if (mapping.left && state.keys[mapping.left]) return { dx: -1, dy: 0 };
  if (mapping.right && state.keys[mapping.right]) return { dx: 1, dy: 0 };
  if (mapping.down && state.keys[mapping.down]) return { dx: 0, dy: 1 };
  if (mapping.up && state.keys[mapping.up]) return { dx: 0, dy: -1 };
  return { dx: 0, dy: 0 }; // 入力なし
}

/**
 * 移動開始の試行: 指定方向への移動を開始
 * 手順:
 * 1. 現在位置をグリッドにスナップ(ズレ補正)
 * 2. 移動先タイルが通行可能かチェック(壁・箱・ボールがあれば移動不可)
 * 3. OKなら移動状態に設定し、1タイル分の移動をスケジュール
 */
export function tryStartMove(player, dx, dy) {
  if (!player.alive) {
    console.log(`[tryStartMove] Failed: player dead`);
    return;
  }
  if (player.moving) {
    console.log(`[tryStartMove] Failed: already moving (progress=${player.moveProgress})`);
    return;
  }
  if (dx === 0 && dy === 0) {
    console.log(`[tryStartMove] Failed: no direction`);
    return;
  }

  // 現在位置をグリッドにスナップ(浮動小数点誤差や中途停止のズレ補正)
  player.x = Math.round(player.x);
  player.y = Math.round(player.y);
  const alignedX = player.x;
  const alignedY = player.y;

  // 移動先のタイル座標を計算
  const nxCell = Math.floor(alignedX + dx + 0.0001);
  const nyCell = Math.floor(alignedY + dy + 0.0001);

  // 移動先の通行可能性チェック
  if (!inBounds(nxCell, nyCell)) {
    console.log(`[tryStartMove] Failed: out of bounds (${nxCell},${nyCell})`);
    return;
  }
  if (cellAt(nxCell, nyCell) !== 0) {
    console.log(`[tryStartMove] Failed: blocked by cell=${cellAt(nxCell, nyCell)} at (${nxCell},${nyCell})`);
    return;
  }
  if (ballExists(nxCell, nyCell)) {
    console.log(`[tryStartMove] Failed: ball exists at (${nxCell},${nyCell})`);
    return;
  }

  // 移動開始: 正確に1タイル分の移動を設定
  player.moving = true;
  player.pendingTarget = { x: alignedX + dx, y: alignedY + dy };
  player.moveProgress = 0;
  player.dir = { x: dx, y: dy }; // 向きを更新(ボール発射方向に影響)
  console.log(`[tryStartMove] Success: moving from (${alignedX},${alignedY}) to (${alignedX + dx},${alignedY + dy})`);
}

/**
 * 移動の中途停止: 現在の補間位置で移動を中断
 * 人間プレイヤー用の機能(キーを離したらその場で止まる)
 * AIは危険回避時にも使用する。
 */
export function stopMoveAtCurrentPosition(player) {
  if (!player.moving || !player.pendingTarget) return;

  // 現在の進捗率を取得
  const t = Math.min(1, Math.max(0, player.moveProgress));
  // 補間位置を計算
  player.x = player.x + (player.pendingTarget.x - player.x) * t;
  player.y = player.y + (player.pendingTarget.y - player.y) * t;

  // 両軸を最寄りのグリッド線にスナップ(位置ズレ防止)
  player.x = Math.round(player.x);
  player.y = Math.round(player.y);

  // 移動状態をクリア
  player.moving = false;
  player.pendingTarget = null;
  player.moveProgress = 0;
}

/**
 * プレイヤーの更新処理(入力処理、移動、アイテム取得)
 * 手順:
 * 1. P1/P2の入力を処理(AIのP2はrunAIを呼ぶ)
 * 2. 移動中のプレイヤーの補間移動を進める
 * 3. AIは移動中に移動先が危険になったら中途停止
 * 4. 人間プレイヤーはキー入力がなくなったら中途停止
 * 5. アイテム収集判定
 */
export function updatePlayers(dt, runAI) {
  // 各プレイヤーのキーマッピング
  const p1map = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown' };
  const p2map = { left: 'a', right: 'd', up: 'w', down: 's' };

  // P1の入力処理(キーボード)
  if (state.players[0].alive) {
    const d1 = computeMoveDirectionFromKeys(p1map);
    if (d1.dx !== 0 || d1.dy !== 0) {
      tryStartMove(state.players[0], d1.dx, d1.dy);
    }
    if (state.keys[state.keybinds.p1fire]) {
      // ボール発射処理は外部で実装
      state.keys[state.keybinds.p1fire] = false;
      return { player: state.players[0], action: 'fire' };
    }
  }

  // P2の入力処理(CPUまたはキーボード)
  let p2Action = null;
  if (state.players[1].isCPU) {
    p2Action = runAI(state.players[1], dt);
  } else {
    const d2 = computeMoveDirectionFromKeys(p2map);
    if (d2.dx !== 0 || d2.dy !== 0) {
      tryStartMove(state.players[1], d2.dx, d2.dy);
    }
    if (state.keys[state.keybinds.p2fire]) {
      state.keys[state.keybinds.p2fire] = false;
      p2Action = { player: state.players[1], action: 'fire' };
    }
  }

  // 全プレイヤーの移動処理とアイテム取得
  for (const p of state.players) {
    if (!p.alive) continue; // 死亡中はスキップ

    if (p.moving && p.pendingTarget) {
      // CPUの場合、移動中に移動先が危険になったら中途停止
      // (爆発が開始されたらそこに突っ込まないように)
      if (p.isCPU) {
        // dangerCellsFromBallsは外部で実装されている前提
        // ここでは簡易的にスキップ
      }

      // 移動進捗を進める(speedアイテムで20%ずつ加速)
      const baseSpeed = Math.max(0.5, p.speedTilesPerSec);
      const speed = baseSpeed * (1 + p.items.speed * 0.2);
      p.moveProgress += dt * speed;

      // 移動完了
      if (p.moveProgress >= 1) {
        if (p.isCPU) {
          console.log(`[Player Move] AI completed move from (${p.x},${p.y}) to (${p.pendingTarget.x},${p.pendingTarget.y})`);
        }
        p.x = p.pendingTarget.x;
        p.y = p.pendingTarget.y;
        p.moving = false;
        p.pendingTarget = null;
        p.moveProgress = 0;
      }
    }

    // 人間プレイヤーのみ: キー入力がなくなったら中途停止
    if (p.moving && !p.isCPU) {
      const d = p.id === 1
        ? computeMoveDirectionFromKeys(p1map)
        : computeMoveDirectionFromKeys(p2map);
      if (d.dx === 0 && d.dy === 0) stopMoveAtCurrentPosition(p);
    }

    // アイテム収集判定: 同じタイルにいるアイテムを取得
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      if (Math.floor(p.x + 0.0001) === item.x && Math.floor(p.y + 0.0001) === item.y) {
        p.items[item.type]++;
        state.items.splice(i, 1);
      }
    }
  }

  return p2Action;
}
