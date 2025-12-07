/**
 * ゲーム状態管理
 * 全てのゲームエンティティとグローバル状態を管理
 */

// ゲーム状態
export const state = {
  map: [],          // マップ配列: 0=通行可能, 1=壁, 2=破壊可能な箱
  balls: [],        // 配置済みのボール一覧
  items: [],        // フィールド上のアイテム一覧
  previews: [],     // 爆発予告エフェクト一覧
  explosions: [],   // 現在爆発中のセル一覧
  players: [],      // プレイヤー情報(P1, P2)
  keys: {},         // 現在押されているキー状態
  keybinds: { p1fire: ' ', p2fire: 'f', p3fire: '', p4fire: '' }, // ボール発射キーの設定
  lastTime: performance.now() // フレームタイミング管理用
};

/**
 * ゲーム状態を初期化
 */
export function resetState() {
  state.balls = [];
  state.items = [];
  state.previews = [];
  state.explosions = [];
  state.keys = {};
  state.lastTime = performance.now();
}
