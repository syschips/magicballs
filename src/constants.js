/**
 * ゲーム定数定義
 */

// フィールドサイズ
export const COLS = 18;
export const ROWS = 12;
export const TILE = 48;
export const CANVAS_W = COLS * TILE;
export const CANVAS_H = ROWS * TILE;

// ゲームバランス設定
export const EXPLOSION_PREVIEW_DURATION = 0.6; // 秒
export const EXPLOSION_WAVE_DELAY = 0.12; // 秒
export const EXPLOSION_EFFECT_DURATION = 0.45; // 秒
export const ITEM_DROP_CHANCE = 0.3; // 30%
export const DEFAULT_MAX_BALLS = 3;
export const DEFAULT_EXPLOSION_RANGE = 6;
export const BALL_COLLISION_EXPLODE_TIME = 2.0; // 秒

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
