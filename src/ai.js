/**
 * AI制御ロジック
 */

import {
  AI_NORMAL_INTERVAL_MIN,
  AI_NORMAL_INTERVAL_MAX,
  AI_DANGER_INTERVAL,
  AI_FIRE_CHANCE,
  AI_SNIPE_CHANCE,
  DEFAULT_EXPLOSION_RANGE
} from './constants.js';
import { state } from './state.js';
import { inBounds, cellAt, ballExists } from './utils.js';
import { tryStartMove } from './player.js';

/**
 * 危険セルの算出: AIが避けるべきタイルを計算
 * - 現在配置されているボールの爆発予測範囲
 * - 既に爆発中のセル
 * を危険エリアとして返す。AIはこれを使って安全な移動先を選択する。
 */
export function dangerCellsFromBalls() {
  const danger = new Set(); // 重複排除のためSet使用

  // 各ボールについて爆発範囲を計算
  for (const b of state.balls) {
    const cx = Math.floor(b.fx + 0.0001); // 小数点誤差対策で微小値加算
    const cy = Math.floor(b.fy + 0.0001);
    danger.add(`${cx},${cy}`); // ボール自身の位置

    // 所有者のアイテム効果を考慮した爆発範囲を算出
    const owner = state.players.find(p => p.id === b.owner);
    const maxRange = DEFAULT_EXPLOSION_RANGE + (owner ? owner.items.range : 0);

    // 上下左右4方向に爆発範囲を伸ばす
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const d of dirs) {
      for (let r = 1; r <= maxRange; r++) {
        const nx = cx + d.x * r, ny = cy + d.y * r;
        if (!inBounds(nx, ny)) break; // フィールド外で停止
        if (cellAt(nx, ny) === 1) break; // 壁で停止
        danger.add(`${nx},${ny}`);
        if (cellAt(nx, ny) === 2) break; // 箱で停止(箱も破壊されるが爆風はここまで)
      }
    }
  }

  // 既に爆発中のセルも危険エリアに追加(AIが爆風に突っ込まないように)
  for (const e of state.explosions) {
    danger.add(`${e.x},${e.y}`);
  }

  return danger;
}

/**
 * AIルーチン(P2用)
 * 行動原理:
 * 1. 危険判定: 現在位置が爆発範囲または爆発中のタイルかどうか
 * 2. 行動タイミング:
 *    - 危険な位置にいる場合: タイマー無視して即座に行動(緊急回避)
 *    - 安全な場合: 0.4-1.6秒のランダム間隔で行動
 * 3. 移動先選択:
 *    - 安全な移動先(危険エリア外)を優先
 *    - 安全な場所がなければ、通行可能な場所を選択(フォールバック)
 * 4. 攻撃判定:
 *    - 安全な位置にいるときのみボールを発射
 *    - 通常行動25%の確率で発射
 *    - P1と同じ縦または横列にいる場合40%の確率で狙い撃ち
 */
export function runAI(p, dt) {
  if (!p.alive) return null; // 死亡中は何もしない

  // 現在の危険エリアを計算
  const danger = dangerCellsFromBalls();
  const cx = Math.floor(p.x + 0.0001);
  const cy = Math.floor(p.y + 0.0001);
  const currentUnsafe = danger.has(`${cx},${cy}`); // 現在位置が危険か

  // 行動タイマーを減らす
  p._ai.timer -= dt;
  // 危険な場合はタイマー無視して即座に行動
  const shouldAct = p._ai.timer <= 0 || currentUnsafe;

  if (shouldAct) {
    // 移動候補(上下左右)
    const choices = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

    // 通行可能性チェック関数(壁・箱・ボールがないか)
    const passable = (nx, ny) => inBounds(nx, ny) && cellAt(nx, ny) === 0 && !ballExists(nx, ny);

    // 安全な移動先:通行可能かつ危険エリア外
    const safeMoves = choices.filter(c => {
      const nx = cx + c.x, ny = cy + c.y;
      return passable(nx, ny) && !danger.has(`${nx},${ny}`);
    });

    // フォールバック用:危険でも通行可能な場所
    const fallbackMoves = choices.filter(c => {
      const nx = cx + c.x, ny = cy + c.y;
      return passable(nx, ny);
    });

    // 取りに行くべき安全なアイテムを選ぶ(最短マンハッタン距離)
    const safeItems = state.items.filter(it => !danger.has(`${it.x},${it.y}`));
    let targetItem = null;
    if (safeItems.length > 0) {
      let bestDist = Infinity;
      for (const it of safeItems) {
        const d = Math.abs(it.x - cx) + Math.abs(it.y - cy);
        if (d < bestDist) { bestDist = d; targetItem = it; }
      }
    }

    // 優先度順に移動先を選択
    let pick = null;
    if (targetItem && safeMoves.length > 0) {
      // 安全な移動の中から、アイテムへのマンハッタン距離が縮まるものを優先
      let bestMoves = [];
      let bestDist = Infinity;
      for (const m of safeMoves) {
        const nx = cx + m.x, ny = cy + m.y;
        const d = Math.abs(targetItem.x - nx) + Math.abs(targetItem.y - ny);
        if (d < bestDist) { bestDist = d; bestMoves = [m]; }
        else if (d === bestDist) { bestMoves.push(m); }
      }
      if (bestMoves.length > 0) pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    if (!pick) {
      if (currentUnsafe && safeMoves.length > 0) {
        // 現在危険な場合は安全地を優先
        pick = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      } else if (safeMoves.length > 0) {
        // 安全な移動先があればそちらを選ぶ
        pick = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      } else if (fallbackMoves.length > 0) {
        // 安全地がなければ、通行可能な場所を選ぶ(追い詰められた場合)
        pick = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
      }
    }

    if (pick) tryStartMove(p, pick.x, pick.y);

    // 次の行動タイミングを設定
    // 危険時は0.05秒後、安全時は0.4-1.6秒後
    p._ai.timer = currentUnsafe ? AI_DANGER_INTERVAL : (AI_NORMAL_INTERVAL_MIN + Math.random() * (AI_NORMAL_INTERVAL_MAX - AI_NORMAL_INTERVAL_MIN));

    // 安全な場所にいるときのみ、25%の確率でボール発射
    if (!currentUnsafe && Math.random() < AI_FIRE_CHANCE) {
      return { player: p, action: 'fire' };
    }
  }

  // 特別攻撃ロジック: P1と同じ縦または横列にいる場合、40%の確率で狙い撃ち
  const target = state.players[0];
  if (target.alive && (target.x === p.x || target.y === p.y) && Math.random() < AI_SNIPE_CHANCE && !currentUnsafe) {
    return { player: p, action: 'fire' };
  }

  return null;
}
