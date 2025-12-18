/**
 * マップ初期化と管理
 */

import { COLS, ROWS } from './constants.js';
import { state } from './state.js';

// マップパターン定義(0=通路、1=ブロック)
const MAP_PATTERNS = [
  // パターン1: 対称的な模様
  [
    '001111110011111100',
    '011111111011111110',
    '111001111111001111',
    '110110111110110111',
    '101111011101111101',
    '111111111111111111',
    '111111110111111111',
    '111101110011101111',
    '111100111111001111',
    '111111000000111111',
    '011111111111111110',
    '001111111111111100'
  ]
];

/**
 * マップの初期化: 18×12の全領域を破壊可能ブロックとし、パターンで配置
 * - 外周の外側は移動不可
 * - 18×12の領域内はすべて破壊可能ブロック(値2)をパターン配置
 * - プレイヤー初期位置はL字型3マス分を確保
 */
export function initMap() {
  try {
    // プレイヤー初期位置の定義
    const p1Start = { x: 0, y: 0 };             // P1: 左上
    const p2Start = { x: COLS - 1, y: ROWS - 1 }; // P2: 右下
    const p3Start = { x: 0, y: ROWS - 1 };      // P3: 左下
    const p4Start = { x: COLS - 1, y: 0 };      // P4: 右上
    const p5Start = { x: 0, y: Math.floor(ROWS / 2) }; // P5: 左中央
    const p6Start = { x: COLS - 1, y: Math.floor(ROWS / 2) }; // P6: 右中央

    // 全マスを通行可能(0)で初期化
    state.map = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(0));
    
    // マップが正しく初期化されたか確認
    if (!state.map || state.map.length !== ROWS || state.map[0].length !== COLS) {
      throw new Error('Map initialization failed');
    }

  // パターンを選択(現在は1つのみ)
  const pattern = MAP_PATTERNS[0];
  
  // パターンに従ってブロックを配置
  for (let y = 0; y < ROWS && y < pattern.length; y++) {
    const row = pattern[y];
    for (let x = 0; x < COLS && x < row.length; x++) {
      if (row[x] === '1') {
        state.map[y][x] = 2; // 破壊可能ブロック
      }
    }
  }

  // プレイヤー初期位置のL字型3マスを確保
  const clearLShape = (px, py, corner) => {
    state.map[py][px] = 0; // プレイヤー位置
    
    // コーナーに応じてL字の方向を決定
    if (corner === 'top-left') {
      // 右と下を確保
      if (px + 1 < COLS) state.map[py][px + 1] = 0;
      if (py + 1 < ROWS) state.map[py + 1][px] = 0;
    } else if (corner === 'top-right') {
      // 左と下を確保
      if (px - 1 >= 0) state.map[py][px - 1] = 0;
      if (py + 1 < ROWS) state.map[py + 1][px] = 0;
    } else if (corner === 'bottom-left') {
      // 右と上を確保
      if (px + 1 < COLS) state.map[py][px + 1] = 0;
      if (py - 1 >= 0) state.map[py - 1][px] = 0;
    } else if (corner === 'bottom-right') {
      // 左と上を確保
      if (px - 1 >= 0) state.map[py][px - 1] = 0;
      if (py - 1 >= 0) state.map[py - 1][px] = 0;
    }
  };

  // 各プレイヤー位置のL字エリアをクリア
  clearLShape(p1Start.x, p1Start.y, 'top-left');
  clearLShape(p2Start.x, p2Start.y, 'bottom-right');
  clearLShape(p3Start.x, p3Start.y, 'bottom-left');
  clearLShape(p4Start.x, p4Start.y, 'top-right');
  clearLShape(p5Start.x, p5Start.y, 'top-left'); // P5: 左中央（右と下）
  clearLShape(p6Start.x, p6Start.y, 'top-right'); // P6: 右中央（左と下）
  
  } catch (error) {
    console.error('Map initialization error:', error);
    // フォールバック: 空のマップを作成
    state.map = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(0));
  }
}
