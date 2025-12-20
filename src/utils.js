/**
 * ユーティリティ関数群
 */

import { COLS, ROWS, POWERUP_TYPES, POWERUP_DURATION, POWERUP_DROP_CHANCE, 
         SCORE_BLOCK_DESTROY, SCORE_PLAYER_HIT, COMBO_TIMEOUT, COMBO_MULTIPLIER_BASE, GAME_MODES } from './constants.js';
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
  // NaNや無限大の座標は壁として扱う
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 1;
  if (!inBounds(x, y)) return 1;
  if (!state || !state.map || !Array.isArray(state.map)) return 1;
  if (!state.map[y] || !Array.isArray(state.map[y])) return 1;
  if (state.map[y][x] === undefined) return 1;
  return state.map[y][x];
}

/**
 * 指定座標にボールが存在するか（切り捨てで所属マス判定）
 */
export function ballExists(x, y) {
  if (!state || !state.balls || !Array.isArray(state.balls)) return false;
  return state.balls.some(k => k && Number.isFinite(k.fx) && Number.isFinite(k.fy) && Math.floor(k.fx) === x && Math.floor(k.fy) === y);
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
    if (!audioCtx) return; // AudioContextの生成に失敗した場合
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + time);
  } catch (e) {
    // オーディオ再生失敗時は無視（ログ出力なし）
  }
}

/**
 * パワーアップ生成
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @returns パワーアップオブジェクト
 */
export function spawnPowerup(x, y) {
  if (Math.random() > POWERUP_DROP_CHANCE) return null;
  
  // ゲームモードに応じてドロップするアイテムを制限
  const modeId = state.currentGameMode || 'classic';
  const modeConfig = GAME_MODES[modeId.toUpperCase()] || GAME_MODES.CLASSIC;
  
  let types = Object.values(POWERUP_TYPES);
  
  // クラシックモードの場合、特定のアイテムのみ
  if (modeConfig.allowedItems && Array.isArray(modeConfig.allowedItems)) {
    // allowedItemsは['extraBalls', 'range', 'speed']のような配列
    // これらはPOWERUP_TYPESではなく、従来のアイテムを示す
    // ただし、現在の実装ではspawnPowerupはパワーアップを生成するので
    // クラシックモードではパワーアップをドロップしない
    return null; // クラシックモードではパワーアップなし
  }
  
  const type = types[Math.floor(Math.random() * types.length)];
  
  return {
    x, y,
    type,
    lifetime: 0,
    maxLifetime: 10.0 // 10秒で消える
  };
}

/**
 * パワーアップ効果を適用
 * @param {Object} player - プレイヤーオブジェクト
 * @param {string} type - パワーアップタイプ
 */
export function applyPowerup(player, type) {
  if (type === POWERUP_TYPES.EXTRA_LIFE) {
    // ライフ追加は即座に適用
    player.lives++;
    return;
  }
  
  // 既存の同じタイプのパワーアップを除去（リフレッシュ）
  state.activePowerups = state.activePowerups.filter(p => 
    !(p.playerId === player.id && p.type === type)
  );
  
  // 新しいパワーアップを追加
  state.activePowerups.push({
    playerId: player.id,
    type,
    duration: POWERUP_DURATION,
    timeLeft: POWERUP_DURATION
  });
}

/**
 * パワーアップ効果を更新
 * @param {number} dt - デルタタイム
 */
export function updatePowerups(dt) {
  // フィールド上のパワーアップの寿命管理
  state.powerups = state.powerups.filter(p => {
    p.lifetime += dt;
    return p.lifetime < p.maxLifetime;
  });
  
  // アクティブなパワーアップの時間管理
  state.activePowerups = state.activePowerups.filter(p => {
    p.timeLeft -= dt;
    return p.timeLeft > 0;
  });
}

/**
 * プレイヤーが特定のパワーアップを持っているかチェック
 * @param {number} playerId - プレイヤーID
 * @param {string} type - パワーアップタイプ
 * @returns {boolean}
 */
export function hasPowerup(playerId, type) {
  return state.activePowerups.some(p => p.playerId === playerId && p.type === type);
}

/**
 * スコア加算
 * @param {Object} player - プレイヤーオブジェクト
 * @param {number} baseScore - 基本スコア
 * @param {boolean} isComboable - コンボ可能か
 */
export function addScore(player, baseScore, isComboable = true) {
  if (!player) return;
  
  let finalScore = baseScore;
  
  // コンボボーナス計算
  if (isComboable && state.comboCount > 0) {
    const comboMultiplier = 1.0 + (state.comboCount * COMBO_MULTIPLIER_BASE);
    finalScore = Math.floor(baseScore * comboMultiplier);
  }
  
  player.score += finalScore;
  
  // コンボ更新
  if (isComboable) {
    state.comboCount++;
    state.lastComboTime = state.gameTime;
  }
  
  return finalScore;
}

/**
 * コンボ管理
 */
export function updateCombo() {
  if (state.comboCount > 0 && state.gameTime - state.lastComboTime > COMBO_TIMEOUT) {
    state.comboCount = 0;
  }
}

/**
 * 時間ボーナス計算
 * @param {number} timeSeconds - 経過時間(秒)
 * @returns {number} ボーナススコア
 */
export function calculateTimeBonus(timeSeconds) {
  // 速いほど高得点（基準を60秒とし、それより速ければボーナス）
  const baseTime = 60;
  if (timeSeconds >= baseTime) return 0;
  
  return Math.floor((baseTime - timeSeconds) * 100);
}
