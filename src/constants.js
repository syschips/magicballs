/**
 * ゲーム定数定義
 */

// フィールドサイズ
export const COLS = 18;
export const ROWS = 12;
export const TILE = 48;
export const CANVAS_W = COLS * TILE;
export const GAME_FIELD_H = ROWS * TILE; // ゲームフィールドの高さ
export const UI_TOP_HEIGHT = 80; // 上部UI領域
export const UI_BOTTOM_HEIGHT = 120; // 下部UI領域
export const CANVAS_H = GAME_FIELD_H + UI_TOP_HEIGHT + UI_BOTTOM_HEIGHT; // 総キャンバス高さ

// 固定Tick設定（ネットワーク同期用）
export const TICK_RATE = 60; // 1秒あたりのTick数
export const TICK_DELTA = 1 / TICK_RATE; // 1Tickの時間（秒）= 0.01667秒

// ゲームバランス設定
export const EXPLOSION_PREVIEW_DURATION = 0.3; // 秒
export const EXPLOSION_WAVE_DELAY = 0.15; // 秒
export const EXPLOSION_EFFECT_DURATION = 0.45; // 秒
export const ITEM_DROP_CHANCE = 0.3; // 30%
export const DEFAULT_MAX_BALLS = 3;
export const DEFAULT_EXPLOSION_RANGE = 6;
export const BALL_COLLISION_EXPLODE_TIME = 3.0; // ボールが爆発する残り時間の閾値（踏んだ時・壁激突時）

// AI設定
export const AI_NORMAL_INTERVAL_MIN = 0.4; // 秒
export const AI_NORMAL_INTERVAL_MAX = 1.6; // 秒
export const AI_DANGER_INTERVAL = 0.05; // 秒
export const AI_FIRE_CHANCE = 0.25; // 25%
export const AI_SNIPE_CHANCE = 0.4; // 40%
export const AI_ATTACK_MODE_SNIPE_CHANCE = 0.7; // 70% (攻撃モード時)
export const AI_ITEMS_THRESHOLD = 2; // アイテム確保判定の閾値
export const AI_BREAK_BLOCK_CHANCE = 0.6; // 60% (探索モード時のブロック破壊確率)
export const AI_IDLE_FIRE_TIMEOUT = 3.0; // 3秒 (AIがボールを発射していない場合のタイムアウト)

// ライフシステム設定
export const DEFAULT_LIVES = 3; // デフォルトのライフ数
export const RESPAWN_INVINCIBILITY_TIME = 2.0; // リスポーン後の無敵時間(秒)
export const INVINCIBILITY_BLINK_INTERVAL = 0.15; // 無敵時の点滅間隔(秒)

// プレイヤー設定
export const PLAYER_SPEED = 4.5; // プレイヤー移動速度（タイル/秒）

// ボールタイプ設定
export const BALL_TYPES = {
  kuro: {
    name: 'クロ',
    color: '#222222',
    playerSpeed: 4.5,  // プレイヤー移動速度
    speed: 1.0,        // 標準速度
    interval: 0.6,     // 発射間隔（秒）
    fuse: 2.0,         // 導火線時間（秒）
    description: 'バランス型'
  },
  shiro: {
    name: 'シロ',
    color: '#ffffff',
    playerSpeed: 5.5,  // プレイヤー移動速度（速い）
    speed: 1.5,        // 速い
    interval: 0.8,     // 長い間隔
    fuse: 1.5,         // 短い導火線
    description: '速攻型'
  },
  kiiro: {
    name: 'キイロ',
    color: '#ffdd00',
    playerSpeed: 3.5,  // プレイヤー移動速度（遅い）
    speed: 0.5,        // 遅い
    interval: 0.4,     // 短い間隔
    fuse: 2.5,         // 長い導火線
    description: '連射型'
  }
};

// パワーアップ設定
export const POWERUP_DURATION = 8.0; // パワーアップ効果時間(秒)
export const POWERUP_DROP_CHANCE = 0.25; // パワーアップドロップ確率
export const POWERUP_TYPES = {
  SPEED: 'speed',           // 速度アップ
  MULTI_BALL: 'multiball',  // マルチボール
  STICKY: 'sticky',         // 粘着性(ボールが止まる)
  SLOW_MO: 'slowmo',        // スローモーション
  EXTRA_LIFE: 'extralife'   // ライフ追加(即座に適用)
};

// スコアシステム設定
export const SCORE_BLOCK_DESTROY = 100; // ブロック破壊時の基本スコア
export const SCORE_PLAYER_HIT = 500;    // プレイヤーヒット時のスコア
export const COMBO_TIMEOUT = 3.0;        // コンボタイムアウト(秒)
export const COMBO_MULTIPLIER_BASE = 0.1; // コンボ倍率(コンボ数 * この値が倍率に加算)

// パーティクル設定
export const PARTICLE_LIFESPAN = 1.0;    // パーティクルの生存時間(秒)
export const PARTICLE_COUNT_EXPLOSION = 15; // 爆発時のパーティクル数
export const PARTICLE_COUNT_POWERUP = 8;    // パワーアップ取得時のパーティクル数

// プレイヤーインデックス定数
export const PLAYER_INDEX = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3
};

// 数値定数
export const CHAT_MESSAGE_DISPLAY_COUNT = 3; // チャット表示数
export const CHAT_INPUT_MAX_LENGTH = 100; // チャット入力最大文字数

// 描画定数
export const RENDER_CONSTANTS = {
  // プレイヤー
  PLAYER_RADIUS: 0.28,  // プレイヤーの半径（タイル比）
  PLAYER_LABELS: ['A', 'B', 'C', 'D'],  // プレイヤーラベル
  
  // ボール
  BALL_RADIUS: 0.18,  // ボールの半径（タイル比）
  BALL_FUSE_BAR_WIDTH: 0.9,  // 導火線バーの幅（タイル比）
  BALL_FUSE_BAR_HEIGHT: 4,  // 導火線バーの高さ（px）
  BALL_FUSE_BAR_OFFSET_Y: 0.25,  // 導火線バーのY軸オフセット（タイル比）
  
  // 爆発プレビュー
  EXPLOSION_PREVIEW_ALPHA_MAX: 0.28,  // 爆発プレビューの最大透明度
  EXPLOSION_PREVIEW_DURATION_CALC: 0.6,  // 透明度計算用の期間
  EXPLOSION_PREVIEW_MARGIN: 6,  // 爆発プレビューのマージン（px）
  
  // 爆発エフェクト
  EXPLOSION_ALPHA_MAX: 0.7,  // 爆発エフェクトの最大透明度
  
  // UI
  PLAYER_INFO_WIDTH: 270,  // プレイヤー情報パネルの幅
  PLAYER_INFO_HEIGHT: 70,  // プレイヤー情報パネルの高さ
  PLAYER_INFO_BORDER_RADIUS: 8,  // パネルの角丸半径
  PLAYER_INFO_MARGIN: 10,  // パネルのマージン
  PLAYER_INFO_SPACING_Y: 80,  // プレイヤー情報の垂直間隔
  
  // フォントサイズ
  FONT_SIZE_TITLE: 'bold 48px sans-serif',
  FONT_SIZE_SUBTITLE: '24px sans-serif',
  FONT_SIZE_NORMAL: '20px sans-serif',
  FONT_SIZE_SMALL: '16px sans-serif',
  FONT_SIZE_TINY: '14px sans-serif',
  FONT_SIZE_CHAT: '16px sans-serif',
  
  // 色
  COLOR_BACKGROUND: '#ffffff',
  COLOR_TILE_BG: '#cdefff',
  COLOR_WALL: '#3a6b86',
  COLOR_BOX: '#d4a373',
  COLOR_GRID: 'rgba(0,0,0,0.06)',
  COLOR_EXPLOSION_PREVIEW: 'rgba(255,200,0,',  // + alpha + ')' で使用
  COLOR_EXPLOSION: 'rgba(255,120,0,',  // + alpha + ')' で使用
  
  // パワーアップ設定
  POWERUP_CONFIG: {
    SPEED: { color: '#4169e1', symbol: '⚡', label: 'SPEED' },
    MULTI_BALL: { color: '#ff6347', symbol: '⚪', label: 'MULTI' },
    STICKY: { color: '#ffd700', symbol: '🔗', label: 'STICKY' },
    SLOW_MO: { color: '#9370db', symbol: '⏰', label: 'SLOW' },
    EXTRA_LIFE: { color: '#00ff00', symbol: '❤️', label: 'LIFE' }
  }
};

