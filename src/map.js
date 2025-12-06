/**
 * マップ初期化と管理
 */

import { COLS, ROWS } from './constants.js';
import { state } from './state.js';

/**
 * マップの初期化: 壁と破壊可能な箱を配置
 * - 外周を壁(値1)で囲む
 * - 2マスおきに規則的に箱(値2)を配置(ボンバーマン風)
 * - さらにランダムに箱を追加してマップに変化をつける
 * - プレイヤー初期位置付近は十分な安全スペースを確保(十字型+周囲)
 */
export function initMap() {
  // プレイヤー初期位置の定義
  const p1Start = { x: 1, y: 1 };           // 左上
  const p2Start = { x: COLS - 2, y: ROWS - 2 }; // 右下

  // 全マスを通行可能(0)で初期化
  state.map = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(0));

  // 外周を壁で囲む
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1) state.map[y][x] = 1;
      else state.map[y][x] = 0;
    }
  }

  // 格子状に破壊可能な箱を配置(2マスおき)
  for (let y = 2; y < ROWS - 1; y += 2) {
    for (let x = 2; x < COLS - 1; x += 2) {
      state.map[y][x] = 2;
    }
  }

  // プレイヤー初期位置周辺の安全確保関数
  // プレイヤー位置+上下左右2マス+斜め1マスを確保
  const clearSafeZone = (px, py) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1) {
          // 中心から十字方向2マス、または斜め1マスをクリア
          if ((dx === 0 || dy === 0) || (Math.abs(dx) === 1 && Math.abs(dy) === 1)) {
            state.map[ny][nx] = 0;
          }
        }
      }
    }
  };

  // ランダムに追加の箱を配置(55%の確率で配置)
  // プレイヤー初期位置周辺は除外して移動スペースを確保
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (state.map[y][x] !== 0) continue; // 既に何か配置済みならスキップ
      
      // P1周辺(左上)とP2周辺(右下)をより広く除外
      const nearP1 = Math.abs(x - p1Start.x) <= 2 && Math.abs(y - p1Start.y) <= 2;
      const nearP2 = Math.abs(x - p2Start.x) <= 2 && Math.abs(y - p2Start.y) <= 2;
      
      if (nearP1 || nearP2) continue; // プレイヤー初期位置周辺を除外
      if (Math.random() < 0.55) state.map[y][x] = 2;
    }
  }

  // 最終的にプレイヤー位置とその周辺を確実にクリア
  clearSafeZone(p1Start.x, p1Start.y);
  clearSafeZone(p2Start.x, p2Start.y);
}
