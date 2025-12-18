/**
 * アプリケーション設定定数
 * @module config
 */

/**
 * タイミング関連の定数（すべてミリ秒単位）
 * @typedef {Object} TimingConfig
 * @property {number} AUTO_RETURN_TO_ROOM_DELAY - ゲーム終了後の自動ルーム復帰までの遅延時間（3秒）
 * @property {number} NOTIFICATION_FADE_OUT - 通知のフェードアウトアニメーション時間（300ms）
 * @property {number} RETRY_DELAY - 接続失敗時のリトライ待機時間（100ms）
 * @property {number} CONNECTION_CHECK_INTERVAL - WebRTC接続状態チェックの間隔（100ms）
 * @property {number} MAX_CONNECTION_WAIT - WebRTC接続確立の最大待機時間（3秒）
 * @property {number} ROOM_LIST_POLLING_INTERVAL - ルームリストの自動更新間隔（5秒）
 * @property {number} WAITING_ROOM_POLLING_INTERVAL - 待機ルームの参加者情報更新間隔（2秒）
 * @property {number} HEARTBEAT_INTERVAL - サーバーへのハートビート送信間隔（5秒）
 * @property {number} COUNTDOWN_INTERVAL - ゲーム開始カウントダウンの間隔（1秒）
 * @property {number} SNAPSHOT_INTERVAL - ゲーム状態スナップショットの送信間隔（50ms = 20Hz）
 */
export const TIMING = {
  // UI関連
  AUTO_RETURN_TO_ROOM_DELAY: 3000,
  NOTIFICATION_FADE_OUT: 300,
  RETRY_DELAY: 100,
  
  // WebRTC関連
  CONNECTION_CHECK_INTERVAL: 100,
  MAX_CONNECTION_WAIT: 3000,
  
  // ポーリング関連
  ROOM_LIST_POLLING_INTERVAL: 5000,
  WAITING_ROOM_POLLING_INTERVAL: 2000,
  HEARTBEAT_INTERVAL: 5000,
  
  // ゲーム関連
  COUNTDOWN_INTERVAL: 1000,
  SNAPSHOT_INTERVAL: 50,
};

/**
 * WebRTC接続関連の設定
 * @typedef {Object} WebRTCConfig
 * @property {number} MAX_CONNECTION_ATTEMPTS - 接続確立を待機する最大試行回数（30回 × 100ms = 3秒）
 * @property {number} HOST_RESPONSE_TIMEOUT - ホストからの応答を待つタイムアウト時間（30秒）
 */
export const WEBRTC_CONFIG = {
  MAX_CONNECTION_ATTEMPTS: 30,
  HOST_RESPONSE_TIMEOUT: 30000,
};

/**
 * UI表示関連の設定
 * @typedef {Object} UIConfig
 * @property {number} MAX_CHAT_DISPLAY_COUNT - 画面上に同時表示するチャットメッセージの最大数
 * @property {number} MAX_CHAT_INPUT_LENGTH - チャット入力フィールドの最大文字数
 */
export const UI_CONFIG = {
  MAX_CHAT_DISPLAY_COUNT: 3,
  MAX_CHAT_INPUT_LENGTH: 100,
};
