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
  lastTime: performance.now(), // フレームタイミング管理用
  
  // 固定Tick管理
  currentTick: 0,        // 現在のTick番号（ネットワーク同期用）
  accumulator: 0,        // フレーム時間の累積（固定Tick用）
  
  // ゲーム進行管理
  gameMode: 'start',     // 'start', 'charSelect', 'roomSelect', 'waiting', 'countdown', 'playing', 'paused', 'gameover', 'clear'
  gameTime: 0,           // ゲーム経過時間(秒)
  countdown: 3,          // カウントダウン用（3, 2, 1）
  
  // パワーアップ管理
  powerups: [],          // フィールド上のパワーアップアイテム
  activePowerups: [],    // 有効なパワーアップ効果
  
  // パーティクルシステム
  particles: [],         // パーティクル一覧
  
  // スコア・コンボ管理
  comboCount: 0,         // 現在のコンボ数
  lastComboTime: 0,      // 最後にコンボが発生した時刻
  
  // UI状態
  uiAnimations: [],      // UI要素のアニメーション
  
  // スローモーション効果
  timeScale: 1.0,        // 時間スケール(1.0=通常, 0.5=半分の速度)
  
  // オンライン対戦用
  selectedBallType: 'kuro', // 選択中のボールタイプ
  currentRoomId: null,      // 現在参加中のルームID
  myPlayerId: null,         // 自分のplayer_id（オンライン対戦時）
  myPlayerIndex: null,      // state.players配列内の自分のインデックス
  isOnlineMode: false,      // オンラインモードかどうか
  isSpectator: false,       // 観戦モードかどうか
  isHost: false,            // ホストかどうか（AIを実行する権限）
  
  // WebRTC同期用
  inputBuffer: new Map(),   // playerId -> 入力履歴のバッファ
  lastProcessedTick: new Map(), // playerId -> 最後に処理したTick番号
  snapshotHistory: []       // 過去のスナップショット（予測補正用）
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
  state.gameTime = 0;
  state.powerups = [];
  state.activePowerups = [];
  state.particles = [];
  state.comboCount = 0;
  state.lastComboTime = 0;
  state.uiAnimations = [];
  state.timeScale = 1.0;
  state.myPlayerIndex = null;
  state.isOnlineMode = false;
  state.isSpectator = false;
  state.isHost = false;
  state.currentTick = 0;
  state.accumulator = 0;
  state.inputBuffer = new Map();
  state.lastProcessedTick = new Map();
  state.snapshotHistory = [];
}
