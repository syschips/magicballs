import { state } from './state.js';
import { PlayerSession, RoomAPI, RankingAPI } from './api.js';
import { createWebRTCManager } from './webrtc.js';
import { showError, showSuccess, showLoading, hideLoading } from './notifications.js';
import { ChatManager } from './chat.js';
import { TIMING, WEBRTC_CONFIG } from './config.js';
import { handleError, AppError, ErrorType } from './errorHandler.js';
import { createAuthHandlers } from './uiAuth.js';
import { createGameStartFlow } from './uiGameStart.js';
import { createWaitingRoomFlow } from './uiWaitingRoom.js';

// APIのベースURL（相対パス）
const API_BASE_URL = './server/api';

// プレイヤーセッション
export const playerSession = new PlayerSession();

// WebRTC通信マネージャー
let webrtcManager = null;

// チャットマネージャー
let chatManager = null;

// ルーム一覧の定期更新用
let roomListPollingInterval = null;

// 二重開始防止フラグ
window._gameStartBroadcastSent = false;
window._gameStartTriggered = false;
// 直近の開始失敗タイムスタンプ（リトライ間隔制御）
let _lastStartFailureAt = 0;
// ゲーム開始初期化処理のロック（複数並行実行を防止）
let _gameStartInitializing = false;
// ゲーム開始検知フラグ
let _hasDetectedGameStart = false;

// 既存フラグをオブジェクトでラップ（新モジュールと共有するため）
const broadcastSentFlag = {
  get value() { return window._gameStartBroadcastSent; },
  set value(v) { window._gameStartBroadcastSent = v; }
};
const startTriggeredFlag = {
  get value() { return window._gameStartTriggered; },
  set value(v) { window._gameStartTriggered = v; }
};
const initializingFlag = {
  get value() { return _gameStartInitializing; },
  set value(v) { _gameStartInitializing = v; }
};
const lastStartFailureAtFlag = {
  get value() { return _lastStartFailureAt; },
  set value(v) { _lastStartFailureAt = v; }
};
const hasDetectedGameStartFlag = {
  get value() { return _hasDetectedGameStart; },
  set value(v) { _hasDetectedGameStart = v; }
};

// WebRTCマネージャーの取得/設定ヘルパー（依存注入用）
function getWebRTCManager() {
  return webrtcManager;
}
function setWebRTCManager(mgr) {
  webrtcManager = mgr;
}

// 待機ルームフローの初期化
const waitingRoomFlow = createWaitingRoomFlow({
  playerSession,
  state,
  RoomAPI,
  TIMING,
  API_BASE_URL,
  hasDetectedGameStartFlag,
  showWaitingRoomUI,
  showRoomSelectUI,
  showError,
  showSuccess,
  showLoading,
  hideLoading,
  handleError,
  renderParticipantList,
  updateReadyButton,
  fetchRoomState,
  // gameStartFlow は後で初期化されるため遅延参照
  checkAndStartGame: (...args) => gameStartFlow.checkAndStartGame(...args),
  ChatManager,
  updateChatDisplay
});

// ゲーム開始フローの初期化
const gameStartFlow = createGameStartFlow({
  state,
  playerSession,
  createWebRTCManager,
  showWaitingRoomUI,
  showGameUI,
  showError,
  startWaitingRoomPolling: () => waitingRoomFlow.startWaitingRoomPolling(),
  resetRoomWithRetry,
  enterGameStartPhase,
  handleHostDisconnected,
  stopWaitingRoomPolling: () => waitingRoomFlow.stopWaitingRoomPolling(),
  getWebRTCManager,
  setWebRTCManager,
  flags: {
    broadcastSentFlag,
    startTriggeredFlag,
    initializingFlag,
    lastStartFailureAt: lastStartFailureAtFlag,
    hasDetectedGameStart: hasDetectedGameStartFlag
  }
});

// 認証ハンドラの初期化（UIイベントに委譲）
const {
  handleLogin,
  handleRegister,
  handleOfflinePlay,
  handleCharConfirm
} = createAuthHandlers({
  playerSession,
  state,
  showAuthUI,
  showCharSelectUI,
  showRoomSelectUI,
  loadRoomList: () => waitingRoomFlow.loadRoomList(),
  startRoomListPolling: () => waitingRoomFlow.startRoomListPolling(),
  showError,
  showSuccess,
  showLoading,
  hideLoading,
  handleError,
  startGame: (...args) => {
    if (typeof window !== 'undefined' && typeof window._magicballStartGame === 'function') {
      return window._magicballStartGame(...args);
    }
  }
});
async function handleJoinRoom(roomId) {
  return waitingRoomFlow.handleJoinRoom(roomId);
}

async function handleHostReady(data, currentPlayerId) {
  return waitingRoomFlow.handleHostReady(data, currentPlayerId);
}


/**
 * ゲーム開始フェーズへの遷移を一元管理
 * - UI遷移、カウントダウン、resetGame、state管理を全てここで行う
 * @param {number} totalPlayers
 * @param {Array} playerInfo
 * @param {number} hostPlayerId
 * @param {number} mapSeed
 * @param {number} sessionId
 */
export async function enterGameStartPhase(totalPlayers, playerInfo, hostPlayerId, mapSeed, sessionId = null) {
  stopWaitingRoomPolling();
  if (window._gameStartTriggered) {
    console.log('[enterGameStartPhase] start already triggered, skipping');
    return;
  }
  window._gameStartTriggered = true;
  state.isOnlineMode = true; // クライアント側は必ずオンライン扱いでUI/入力を制御
  console.log('[enterGameStartPhase] called', { totalPlayers, playerInfo, hostPlayerId, mapSeed, sessionId });
  // ホストIDを保持（クライアントからの入力送信先に使用）
  if (hostPlayerId !== null && hostPlayerId !== undefined) {
    state.hostPlayerId = parseInt(hostPlayerId);
    if (typeof window !== 'undefined') {
      window._magicballHostPlayerIdGlobal = state.hostPlayerId;
    }
    console.log('[enterGameStartPhase] Stored hostPlayerId in state:', state.hostPlayerId);
  }
  state.gameSessionId = sessionId || Date.now();
  // セッションIDをグローバル共有にも保存してスナップショット側のフォールバックを確実にする
  if (typeof window !== 'undefined') {
    if (window._magicballState) {
      window._magicballState.gameSessionId = state.gameSessionId;
    }
    window._magicballSessionIdGlobal = state.gameSessionId;
  }
  state.gameMode = 'countdown';
  state.countdown = 3;
  if (typeof showGameUI === 'function') showGameUI();
  // カウントダウン
  const countdownInterval = setInterval(() => {
    state.countdown--;
    if (state.countdown <= 0) {
      clearInterval(countdownInterval);
      state.gameMode = 'playing';
      // ゲーム状態初期化
      if (typeof window._magicballResetGame === 'function') {
        window._magicballResetGame(totalPlayers, playerInfo, mapSeed);
      }
      // ゲームロジック開始
      if (typeof window._magicballContinueGameStart === 'function') {
        window._magicballContinueGameStart(totalPlayers, playerInfo, hostPlayerId);
      }
    }
  }, (typeof TIMING !== 'undefined' && TIMING.COUNTDOWN_INTERVAL) ? TIMING.COUNTDOWN_INTERVAL : 1000);
}
/**
 * UI制御とオンライン機能の統合
 * @module ui
 */

/**
 * CanvasとHelpの表示制御
 * @param {boolean} showCanvas - Canvasを表示するか
 * @param {boolean} showHelp - Helpを表示するか
 * @private
 */
function setCanvasVisibility(showCanvas, showHelp) {
  const canvas = document.getElementById('game');
  const help = document.getElementById('help');
  if (canvas) canvas.style.display = showCanvas ? 'block' : 'none';
  if (help) help.style.display = showHelp ? 'block' : 'none';
}

/**
 * UIを初期化し、イベントリスナーを設定
 * セッションがあればキャラ選択画面、なければログイン画面を表示
 * @returns {void}
 */
export function initUI() {
  // セッション復元を試みる
  if (playerSession.restore()) {
    // セッションがある場合はキャラクター選択画面へ
    state.isOnlineMode = true;
    showCharSelectUI();
  } else {
    // セッションがない場合はログイン画面へ
    showAuthUI();
  }
  
  // グローバルに公開（main.jsから参照するため）
  window._magicballSession = playerSession;
  
  // DOM要素の存在確認（デバッグ用）
  console.log('[initUI] Checking required DOM elements:', {
    roomNameInput: !!document.getElementById('roomNameInput'),
    maxPlayersInput: !!document.getElementById('maxPlayersInput'),
    gameModeInput: !!document.getElementById('gameModeInput'),
    createRoomModal: !!document.getElementById('createRoomModal')
  });
  
  // 認証ボタン
  document.getElementById('loginBtn').onclick = handleLogin;
  document.getElementById('registerBtn').onclick = handleRegister;
  document.getElementById('offlineBtn').onclick = handleOfflinePlay;
  
  // キャラ選択
  document.getElementById('confirmCharBtn').onclick = handleCharConfirm;
  document.getElementById('backToAuthBtn').onclick = () => {
    playerSession.logout();
    showAuthUI();
  };
  
  // ルーム選択
  document.getElementById('createRoomBtn').onclick = () => {
    document.getElementById('createRoomModal').style.display = 'block';
  };
  document.getElementById('confirmCreateRoomBtn').onclick = handleCreateRoom;
  document.getElementById('cancelCreateRoomBtn').onclick = () => {
    document.getElementById('createRoomModal').style.display = 'none';
  };
  document.getElementById('backToCharBtn').onclick = () => {
    showCharSelectUI();
  };
  
  // 待機ルーム
  document.getElementById('readyBtn').onclick = handleReady;
  document.getElementById('leaveRoomBtn').onclick = handleLeaveRoom;
  
  // チャット
  document.getElementById('sendChatBtn').onclick = handleSendChat;
  document.getElementById('chatInput').addEventListener('keydown', handleChatKeydown);
  
  // ランキング
  document.getElementById('showRankingBtn').onclick = () => showRankingUI();
  document.getElementById('refreshRankingBtn').onclick = loadRanking;
  document.getElementById('backFromRankingBtn').onclick = () => {
    document.getElementById('rankingUI').style.display = 'none';
  };
  
  // ゲーム終了後のルーム復帰ボタン
  document.getElementById('returnToRoomBtn')?.addEventListener('click', handleReturnToRoom);
  
  // 操作方法モーダル
  document.getElementById('showControlsBtn')?.addEventListener('click', () => {
    document.getElementById('controlsModal').style.display = 'flex';
  });
  document.getElementById('closeControlsModal')?.addEventListener('click', () => {
    document.getElementById('controlsModal').style.display = 'none';
  });
  document.getElementById('closeControlsBtn')?.addEventListener('click', () => {
    document.getElementById('controlsModal').style.display = 'none';
  });
  // モーダル背景クリックで閉じる
  document.getElementById('controlsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'controlsModal') {
      document.getElementById('controlsModal').style.display = 'none';
    }
  });
  
  // グローバルUIオブジェクトを公開（main.jsから呼び出すため）
  window._magicballUI = {
    onRoomClosed: handleRoomClosed,
    showReturnToRoomButton: showReturnToRoomButton,
    returnToRoom: returnToRoom,
    hideReturnToRoomButton: hideReturnToRoomButton,
    onHostChanged: handleHostChanged
  };
  
  // playerSessionをグローバルに公開（main.jsからアクセスするため）
  window.playerSession = playerSession;
  
  // chatManagerをグローバルに公開（renderer.jsとinput.jsからアクセスするため）
  window._magicballChatManager = null;
  
  // Canvas上のクリックでキャラ選択
  const canvas = document.getElementById('game');
  canvas.addEventListener('click', handleCanvasClick);
  
  // ページアンロード時にルームから退出
  window.addEventListener('beforeunload', (e) => {
    if (playerSession.currentRoomId) {
      // ゲーム中またはルーム待機中の場合は警告
      if (state.gameMode === 'playing' || state.gameMode === 'waitingRoom') {
        e.preventDefault();
        e.returnValue = 'ルームから退出します。よろしいですか？';
      }
      
      // 同期的にリクエストを送信（非同期だと間に合わない可能性がある）
      const data = JSON.stringify({
        room_id: playerSession.currentRoomId,
        player_id: playerSession.playerId
      });
      
      // navigator.sendBeaconを使用（ページアンロード時も確実に送信される）
      // Blobを使用してContent-Typeを指定
      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon('./server/api/rooms/leave.php', blob);
      }
    }
  });
}

/**
 * ルームに戻るボタンを表示
 */
function showReturnToRoomButton() {
  const btn = document.getElementById('returnToRoomBtn');
  if (btn) {
    btn.style.display = 'inline-block';
    console.log('[UI] Return to room button displayed');
  } else {
    console.warn('[UI] Return to room button not found');
  }
}

/**
 * ルームに戻る処理を実行
 */
function returnToRoom() {
  handleReturnToRoom();
}

/**
 * ルームに戻るボタンを非表示
 */
function hideReturnToRoomButton() {
  const btn = document.getElementById('returnToRoomBtn');
  if (btn) {
    btn.style.display = 'none';
  }
}

/**
 * Canvas上のクリック処理（キャラ選択時）
 */
function handleCanvasClick(e) {
  if (state.gameMode !== 'charSelect') return;
  
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // 3つのカードの位置判定（renderer.jsの座標と合わせる）
  const cardWidth = 180;
  const cardHeight = 250;
  const startX = 864 / 2 - (cardWidth * 1.5 + 40);
  const cardY = 150;
  
  const ballTypes = ['kuro', 'shiro', 'kiiro'];
  
  ballTypes.forEach((type, idx) => {
    const cardX = startX + idx * (cardWidth + 40);
    if (x >= cardX && x <= cardX + cardWidth && 
        y >= cardY && y <= cardY + cardHeight) {
      state.selectedBallType = type;
      playerSession.setBallType(type);
    }
  });
}

/**
 * ルーム作成
 */
async function handleCreateRoom() {
  const roomNameInput = document.getElementById('roomNameInput');
  const maxPlayersInput = document.getElementById('maxPlayersInput');
  const gameModeInput = document.getElementById('gameModeInput');
  
  if (!roomNameInput || !maxPlayersInput || !gameModeInput) {
    console.error('[handleCreateRoom] Required input elements not found:', {
      roomNameInput: !!roomNameInput,
      maxPlayersInput: !!maxPlayersInput,
      gameModeInput: !!gameModeInput
    });
    showError('ルーム作成フォームの読み込みに失敗しました');
    return;
  }
  
  const roomName = roomNameInput.value.trim() || `${playerSession.playerName}の部屋`;
  const maxPlayers = parseInt(maxPlayersInput.value);
  const gameMode = gameModeInput.value;
  
  console.log('[handleCreateRoom] Creating room:', { roomName, maxPlayers, gameMode });
  
  showLoading('ルーム作成中...');
  try {
    const result = await playerSession.createRoom(roomName, maxPlayers, gameMode);
    hideLoading();
    
    if (result.success) {
      document.getElementById('createRoomModal').style.display = 'none';
      showSuccess('ルームを作成しました');
      showWaitingRoomUI();
      startWaitingRoomPolling();
    } else {
      showError('ルーム作成失敗: ' + result.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleCreateRoom');
  }
}

/**
 * ルーム一覧読み込み
 */
async function loadRoomList() {
  return waitingRoomFlow.loadRoomList();
}

function startRoomListPolling() {
  return waitingRoomFlow.startRoomListPolling();
}

function stopRoomListPolling() {
  return waitingRoomFlow.stopRoomListPolling();
}

/**
 * 非ホストの準備状態トグル処理
 * @param {Object} data - ルーム状態データ
 * @param {number} currentPlayerId - 現在のプレイヤーID
 * @private
 */
async function handleParticipantReady(data, currentPlayerId) {
  // 準備トグル前に旧WebRTC接続をクローズしてシグナリング中断（再試行時の不整合防止）
  // ただし再ゲーム時は既にresetOnlineSession が handleReady で実行済みの可能性があるため、重複呼び出しを避ける
  if (window._magicballWebRTC) {
    try {
      window._magicballWebRTC.close();
      window._magicballWebRTC = null;
    } catch (e) {
      console.warn('[handleParticipantReady] Error closing WebRTC:', e);
    }
  }
  const myParticipant = data.participants.find(p => parseInt(p.player_id) === currentPlayerId);
  const currentReadyState = myParticipant ? myParticipant.is_ready : false;
  const newReadyState = !currentReadyState;
  
  showLoading(newReadyState ? '準備中...' : '準備解除中...');
  try {
    const readyResponse = await fetch(`${API_BASE_URL}/rooms/ready.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: playerSession.currentRoomId,
        player_id: playerSession.playerId,
        is_ready: newReadyState
      })
    });
    
    const readyResult = await readyResponse.json();
    hideLoading();
    
    if (readyResult.success) {
      if (newReadyState) {
        showSuccess('準備完了しました。ホストのゲーム開始を待っています...');
      } else {
        showSuccess('準備を解除しました');
      }
    } else {
      showError('準備状態の変更に失敗しました: ' + readyResult.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleParticipantReady');
  }
}

/**
 * 準備完了 / ゲーム開始
 * ホスト：全員の準備完了をチェックしてゲーム開始
 * 非ホスト：自分の準備完了を送信
 */
async function handleReady() {
    // 既存WebRTC接続・状態を強制初期化（再戦時の残存接続排除）
    // 待機ルーム入室時や準備完了時に一度だけ実行
    resetOnlineSession('handleReady');
    // ゲーム開始検知フラグもリセット（再戦での新規開始を許可）
    _hasDetectedGameStart = false;
  try {
    const response = await fetch(`${API_BASE_URL}/game/state.php?room_id=${playerSession.currentRoomId}`);
    const data = await response.json();
    
    if (!data.success || !data.room) {
      showError('ルーム情報を取得できませんでした');
      return;
    }
    
    const hostPlayerId = parseInt(data.room.host_player_id);
    const currentPlayerId = parseInt(playerSession.playerId);
    const isHost = hostPlayerId === currentPlayerId;
    
    console.log('[handleReady] Host check:', { hostPlayerId, currentPlayerId, isHost });
    
    if (isHost) {
      await handleHostReady(data, currentPlayerId);
    } else {
      await handleParticipantReady(data, currentPlayerId);
    }
  } catch (error) {
    handleError(error, 'handleReady');
  }
}

/**
 * ルーム退出
 */
async function handleLeaveRoom() {
  // WebRTC接続をクローズ
  if (webrtcManager) {
    webrtcManager.close();
    webrtcManager = null;
    window._magicballWebRTC = null;
  }
  
  stopWaitingRoomPolling();
  
  // チャットマネージャー停止
  if (chatManager) {
    // システムメッセージ送信（退出通知）
    await chatManager.sendSystemMessage(`${playerSession.playerName} さんが退出しました`);
    chatManager.stopPolling();
    chatManager = null;
    window._magicballChatManager = null;
  }
  
  // サーバーに退出を通知
  try {
    await playerSession.leaveRoom();
  } catch (error) {
    console.error('ルーム退出エラー:', error);
  }
  
  showRoomSelectUI();
  loadRoomList();
}

/**
 * 待機ルームのポーリング（参加者情報更新）
 */
let waitingRoomPollingInterval = null;
let waitingRoomHeartbeatInterval = null;
// フラグ: ゲーム開始フロー検知時に設定し、重複開始を防止（ラップ済みの hasDetectedGameStartFlag を使用）

/**
 * オンラインセッションを強制的に初期化し、残存接続やフラグをクリアする共通処理
 * チャットやポーリングの開始/停止は呼び出し元で制御する
 * @param {string} reason - ログ用の理由
 */
function resetOnlineSession(reason = 'resetOnlineSession') {
  try {
    console.log('[resetOnlineSession] start', { reason });
    // WebRTCを完全クローズ
    if (window._magicballWebRTC) {
      try {
        window._magicballWebRTC.close();
      } catch (e) {
        console.warn('[resetOnlineSession] Error closing window._magicballWebRTC:', e);
      }
      window._magicballWebRTC = null;
    }
    if (typeof webrtcManager !== 'undefined' && webrtcManager) {
      try {
        webrtcManager.close();
      } catch (e) {
        console.warn('[resetOnlineSession] Error closing local webrtcManager:', e);
      }
      webrtcManager = null;
    }

    // 開始系フラグをリセット
    initializingFlag.value = false;
    broadcastSentFlag.value = false;
    startTriggeredFlag.value = false;
    hasDetectedGameStartFlag.value = false;
    lastStartFailureAtFlag.value = 0;

    // ゲーム状態を初期化（キャンバスやUIは呼び出し元で切り替える）
    // 注意: state.isHost は保持する（ルームに戻る際はホスト状態を維持）
    if (typeof state !== 'undefined') {
      state.gameMode = 'waiting';
      state.myPlayerIndex = null;
      state.isSpectator = false;
      state.players = [];
      state.comboCount = 0;
      state.lastComboTime = 0;
      state.activePowerups = [];
      state.powerups = [];
      state.balls = [];
      state.map = [];
      state.currentGameMode = null;
      // state.isHost は保持（ルームに戻った後も同じホスト状態を維持）
      state.isOnlineMode = true;
      state.gameSessionId = null;  // 再スタート時に古いセッションIDを確実にクリア
    }
    // グローバルセッションID管理もクリア
    if (typeof window !== 'undefined') {
      window._magicballSessionIdGlobal = null;
    }

    // ゲームエンジン側をリセット
    if (typeof window._magicball !== 'undefined' && window._magicball.resetGame) {
      window._magicball.resetGame();
    }
  } catch (err) {
    console.warn('[resetOnlineSession] cleanup warning:', err);
  }
}

/**
 * ルームステータスを待機に戻すためのリトライ付きリセット
 * ホスト側でサーバーステータスを確実に整合させるために使用
 * @param {string} roomId
 * @param {string} reason
 * @param {number} maxAttempts
 * @param {number} delayMs
 * @returns {Promise<{success: boolean, message?: string, status?: string}>} 成功/失敗と詳細
 */
async function resetRoomWithRetry(roomId, reason = 'resetRoomWithRetry', maxAttempts = 3, delayMs = 500) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log('[resetRoomWithRetry] resetting room', { roomId, reason, attempt });
      const res = await RoomAPI.resetRoom(roomId);
      if (res && res.success) {
        return {
          success: true,
          message: res.message || 'reset success',
          status: res.status || 'waiting'
        };
      }
      lastError = new Error(res?.message || 'reset failed');
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.warn('[resetRoomWithRetry] all attempts failed', { roomId, reason, error: lastError?.message });
  return {
    success: false,
    message: lastError?.message || 'reset failed'
  };
}

function startWaitingRoomPolling() {
  return waitingRoomFlow.startWaitingRoomPolling();
}

function stopWaitingRoomPolling() {
  return waitingRoomFlow.stopWaitingRoomPolling();
}

/**
 * ルーム状態を取得
 * @returns {Promise<Object|null>}
 * @private
 */
async function fetchRoomState() {
  if (!playerSession.currentRoomId) {
    console.log('[fetchRoomState] No currentRoomId');
    return null;
  }
  
  console.log('[fetchRoomState] Fetching room_id:', playerSession.currentRoomId);
  
  const response = await fetch(`${API_BASE_URL}/game/state.php?room_id=${playerSession.currentRoomId}`);
  if (!response.ok) throw new Error('Failed to fetch participants');
  
  const data = await response.json();
  console.log('[fetchRoomState] Received data:', data);
  return data;
}

/**
 * 参加者リストをレンダリング
 * @param {Array} participants - 参加者リスト
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @private
 */
function renderParticipantList(participants, hostPlayerId, gameMode) {
  const participantList = document.getElementById('participantList');
  const modeLabel = gameMode === 'party' ? 'パーティモード' : 'クラシックモード';
  let html = `<p style="margin-bottom: 10px; color: #666;">ゲームモード: <strong>${modeLabel}</strong></p>`;
  html += '<ul>';
  participants.forEach(p => {
    const readyStatus = p.is_ready ? '✓ 準備完了' : '待機中';
    const hostBadge = (parseInt(p.player_id) === hostPlayerId) ? ' [ホスト]' : '';
    html += `<li><strong>${p.display_name}</strong>${hostBadge} (${p.ball_type}) - ${readyStatus}</li>`;
  });
  html += '</ul>';
  participantList.innerHTML = html;
}

/**
 * 準備ボタンを更新
 * @param {boolean} isHost - ホストかどうか
 * @param {Array} participants - 参加者リスト
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @param {number} currentPlayerId - 現在のプレイヤーID
 * @private
 */
function updateReadyButton(isHost, participants, hostPlayerId, currentPlayerId) {
  const readyBtn = document.getElementById('readyBtn');
  
  // 不正な参加者（player_idがnull/undefinedやis_readyが未定義）を除外
  const validParticipants = participants.filter(p => p && p.player_id != null && p.is_ready !== null && p.is_ready !== undefined);

  if (isHost) {
    readyBtn.textContent = 'ゲーム開始';
    readyBtn.className = 'primary-btn';

    const nonHostHumanPlayers = validParticipants.filter(p => 
      !p.is_cpu && parseInt(p.player_id) !== hostPlayerId
    );
    const allOthersReady = nonHostHumanPlayers.length === 0 || 
                           nonHostHumanPlayers.every(p => p.is_ready);
    readyBtn.disabled = !allOthersReady;

    console.log('[Host] Other players ready:', allOthersReady, 'Non-host players:', nonHostHumanPlayers);
    // ホストのみゲーム開始処理
    readyBtn.onclick = async () => {
      const response = await fetch(`${API_BASE_URL}/game/state.php?room_id=${playerSession.currentRoomId}`);
      const data = await response.json();
      await handleHostReady(data, currentPlayerId);
    };
  } else {
    const myParticipant = validParticipants.find(p => parseInt(p.player_id) === currentPlayerId);
    const isReady = myParticipant ? myParticipant.is_ready : false;
    readyBtn.textContent = isReady ? '準備解除' : '準備完了';
    readyBtn.disabled = false;
    readyBtn.className = isReady ? 'danger-btn' : 'primary-btn';
    // 非ホストは準備トグルのみ
    readyBtn.onclick = async () => {
      const response = await fetch(`${API_BASE_URL}/game/state.php?room_id=${playerSession.currentRoomId}`);
      const data = await response.json();
      await handleParticipantReady(data, currentPlayerId);
    };
  }
}

/**
 * ゲーム開始をチェックして実行
 * @param {Object} room - ルーム情報
 * @param {Array} participants - 参加者リスト
 * @private
 */
function checkAndStartGame(room, participants) {
  return gameStartFlow.checkAndStartGame(room, participants);
}

async function updateParticipantList() {
  return waitingRoomFlow.updateParticipantList();
}

/**
 * WebRTC接続状態変化ハンドラーを設定
 * 接続/切断/失敗時の処理を設定
 * @param {WebRTCManager} webrtcManager - WebRTCマネージャーインスタンス
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @private
 */
function setupWebRTCConnectionHandler(webrtcManager, isHost, hostPlayerId) {
  return gameStartFlow.setupWebRTCConnectionHandler(webrtcManager, isHost, hostPlayerId);
}

/**
 * WebRTCメッセージハンドラーを設定
 * スナップショットと入力イベントの受信処理
 * @param {WebRTCManager} webrtcManager - WebRTCマネージャーインスタンス
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @private
 */
function setupWebRTCMessageHandler(webrtcManager, isHost) {
  return gameStartFlow.setupWebRTCMessageHandler(webrtcManager, isHost);
}

/**
 * WebRTC接続の確立を待機
 * 最大接続試行回数までDataChannelの開通を確認
 * @param {WebRTCManager} webrtcManager - WebRTCマネージャーインスタンス
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @param {Array<{playerId:number,ballType:string}>} playerInfo - プレイヤー情報配列
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @returns {Promise<void>}
 * @private
 */
async function waitForWebRTCConnection(webrtcManager, isHost, playerInfo, hostPlayerId) {
  return gameStartFlow.waitForWebRTCConnection(webrtcManager, isHost, playerInfo, hostPlayerId);
}

/**
 * WebRTC接続を確立してゲームを開始
 * ホストは全参加者と接続、参加者はホストと接続
 * @param {number} totalPlayers - 総プレイヤー数（CPU含む）
 * @param {Array<{playerId: number, ballType: string}>} playerInfo - プレイヤー情報配列（nullはCPU）
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @returns {Promise<void>}
 * @private
 */
async function initWebRTCAndStartGame(totalPlayers, playerInfo, hostPlayerId, isHost, mapSeed = undefined, sessionId = null) {
  return gameStartFlow.initWebRTCAndStartGame(totalPlayers, playerInfo, hostPlayerId, isHost, mapSeed, sessionId);
}

/**
 * UI表示切り替え
 */
function showAuthUI() {
  document.getElementById('authUI').style.display = 'block';
  document.getElementById('charSelectUI').style.display = 'none';
  document.getElementById('roomSelectUI').style.display = 'none';
  document.getElementById('waitingRoomUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'none';
  
  setCanvasVisibility(false, false);
  state.gameMode = 'start';
}

function showCharSelectUI() {
  document.getElementById('authUI').style.display = 'none';
  document.getElementById('charSelectUI').style.display = 'block';
  document.getElementById('roomSelectUI').style.display = 'none';
  document.getElementById('waitingRoomUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'none';
  
  setCanvasVisibility(true, false);
  state.gameMode = 'charSelect';
}

function showRoomSelectUI() {
  document.getElementById('authUI').style.display = 'none';
  document.getElementById('charSelectUI').style.display = 'none';
  document.getElementById('roomSelectUI').style.display = 'block';
  document.getElementById('waitingRoomUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'none';
  
  setCanvasVisibility(false, false);
  state.gameMode = 'roomSelect';
}

function showWaitingRoomUI() {
  stopRoomListPolling(); // ルーム一覧の更新を停止
  document.getElementById('authUI').style.display = 'none';
  document.getElementById('charSelectUI').style.display = 'none';
  document.getElementById('roomSelectUI').style.display = 'none';
  document.getElementById('waitingRoomUI').style.display = 'block';
  document.getElementById('gameUI').style.display = 'none';
  
  setCanvasVisibility(false, false);
  state.gameMode = 'waiting';

  // ゲーム開始ブロードキャスト済みフラグをリセット（再戦時のスキップ防止）
  broadcastSentFlag.value = false;
  startTriggeredFlag.value = false;
  initializingFlag.value = false;
  // ゲーム開始検知フラグもリセット（新しい開始検知を許可）
  hasDetectedGameStartFlag.value = false;
  
  // チャットマネージャー初期化（既存のものがあれば停止してから再初期化）
  if (chatManager) {
    chatManager.stopPolling();
  }
  if (playerSession.currentRoomId && playerSession.playerId) {
    chatManager = new ChatManager(playerSession.currentRoomId, playerSession.playerId);
    chatManager.startPolling(updateChatDisplay);
    window._magicballChatManager = chatManager; // グローバルに公開
    console.log('チャットマネージャー初期化:', { 
      roomId: playerSession.currentRoomId, 
      playerId: playerSession.playerId,
      playerName: playerSession.playerName 
    });
  } else {
    console.error('チャットマネージャー初期化失敗: roomIdまたはplayerIdが不足', {
      roomId: playerSession.currentRoomId,
      playerId: playerSession.playerId
    });
  }
  // 参加者リストを即時更新し、UI/ボタン状態をリセット
  if (typeof updateParticipantList === 'function') {
    updateParticipantList();
  }
}

export function showGameUI() {
  document.getElementById('authUI').style.display = 'none';
  document.getElementById('charSelectUI').style.display = 'none';
  document.getElementById('roomSelectUI').style.display = 'none';
  document.getElementById('waitingRoomUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'block';
  
  setCanvasVisibility(true, true);

  // オンライン時はオフライン専用の開始/CPU/リスタート操作を隠す
  const showOfflineControls = state.isOnlineMode === false;
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const cpuToggle = document.getElementById('cpuToggle');
  const cpu3Toggle = document.getElementById('cpu3Toggle');
  const cpu4Toggle = document.getElementById('cpu4Toggle');
  const rankingBtn = document.getElementById('showRankingBtn');
  const returnBtn = document.getElementById('returnToRoomBtn');

  if (startBtn) startBtn.style.display = showOfflineControls ? 'inline-block' : 'none';
  if (resetBtn) resetBtn.style.display = showOfflineControls ? 'inline-block' : 'none';
  if (cpuToggle?.parentElement) cpuToggle.parentElement.style.display = showOfflineControls ? 'inline-block' : 'none';
  if (cpu3Toggle?.parentElement) cpu3Toggle.parentElement.style.display = showOfflineControls ? 'inline-block' : 'none';
  if (cpu4Toggle?.parentElement) cpu4Toggle.parentElement.style.display = showOfflineControls ? 'inline-block' : 'none';

  // オンライン中はランキングボタンを隠す（特に非ホスト側で不要）
  if (rankingBtn) rankingBtn.style.display = state.isOnlineMode ? 'none' : 'inline-block';
  if (returnBtn) returnBtn.style.display = 'none';
}

/**
 * ランキングUI表示
 */
function showRankingUI() {
  document.getElementById('rankingUI').style.display = 'block';
  loadRanking();
}

/**
 * ランキング読み込み
 */
async function loadRanking() {
  try {
    const result = await RankingAPI.getTopRanking(20);
    const rankingList = document.getElementById('rankingList');
    
    if (result.success && result.ranking) {
      let html = '<table class="ranking-table"><thead><tr><th>順位</th><th>プレイヤー名</th><th>レート</th><th>勝利数</th><th>総試合数</th></tr></thead><tbody>';
      
      result.ranking.forEach((player, index) => {
        html += `<tr>
          <td>${index + 1}</td>
          <td>${player.display_name}</td>
          <td>${player.current_rate}</td>
          <td>${player.total_wins}</td>
          <td>${player.total_games}</td>
        </tr>`;
      });
      
      html += '</tbody></table>';
      rankingList.innerHTML = html;
    } else {
      rankingList.innerHTML = '<p>ランキング情報を取得できませんでした</p>';
    }
  } catch (error) {
    document.getElementById('rankingList').innerHTML = '<p>エラー: ' + error.message + '</p>';
  }
}

/**
 * ゲーム終了後にルームに戻る
 */
async function handleReturnToRoom() {
  console.log('[handleReturnToRoom] Called');
  
  if (!playerSession.currentRoomId) {
    console.error('[handleReturnToRoom] No currentRoomId');
    showError('ルーム情報が見つかりません');
    return;
  }
  
  showLoading('ルームに戻っています...');
  
  try {
    // state.isHostを使用（より確実）
    const isHost = typeof state !== 'undefined' && state.isHost === true;
    console.log('[handleReturnToRoom] isHost:', isHost);
    
    if (isHost) {
      console.log('[handleReturnToRoom] Host is resetting room');
      const result = await resetRoomWithRetry(playerSession.currentRoomId, 'handleReturnToRoom:host');
      hideLoading();
      if (!result.success) {
        showError('ルームに戻れませんでした: ' + result.message);
        return;
      }
    } else {
      // 非ホストも自分の準備完了状態を明示的に解除
      console.log('[handleReturnToRoom] Client resetting ready state');
      try {
        await fetch(`${API_BASE_URL}/rooms/ready.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: playerSession.currentRoomId,
            player_id: playerSession.playerId,
            is_ready: false
          })
        });
      } catch (error) {
        console.warn('[handleReturnToRoom] Failed to reset ready state:', error);
      }
      // クライアント側からもルームリセットを試行（idempotent）
      console.log('[handleReturnToRoom] Client triggering room reset (idempotent)');
      try {
        await resetRoomWithRetry(playerSession.currentRoomId, 'handleReturnToRoom:client');
      } catch (error) {
        console.warn('[handleReturnToRoom] Client reset attempt failed:', error);
      }
      hideLoading();
    }
    // 接続・状態をまとめてリセット（isHost状態は保持される）
    resetOnlineSession('handleReturnToRoom');
    
    // 待機ルームに戻る（フラグをリセット）
    showWaitingRoomUI();
    // 準備ボタンを一時的に無効化
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.disabled = true;
    
    // 「入室しなおす」動作を行う（既に参加済みなら既存のプレイヤー番号を返す）
    try {
      const rejoin = await RoomAPI.joinRoom(playerSession.currentRoomId, playerSession.playerId, playerSession.ballType);
      console.log('[handleReturnToRoom] Rejoin result:', rejoin);
    } catch (error) {
      console.warn('[handleReturnToRoom] Rejoin failed (will continue with existing membership):', error);
    }

    // サーバーから最新のルーム状態を取得してホスト状態を再確認
    const roomData = await fetchRoomState();
    if (roomData && roomData.room) {
      const hostPlayerId = parseInt(roomData.room.host_player_id);
      const currentPlayerId = parseInt(playerSession.playerId);
      const actualIsHost = hostPlayerId === currentPlayerId;
      state.isHost = actualIsHost;
      console.log('[handleReturnToRoom] Host status restored from server:', { hostPlayerId, currentPlayerId, isHost: actualIsHost });
    }
    
    // UIをリセット
    await updateParticipantList();
    // 準備ボタンを有効化
    if (readyBtn) readyBtn.disabled = false;
    // ポーリング開始
    startWaitingRoomPolling();
    showSuccess('ルームに戻りました');
    
  } catch (error) {
    hideLoading();
    showError('エラー: ' + error.message);
  }
}

/**
 * ホストが切断された時の処理
 * @private
 */
async function handleHostDisconnected() {
  console.log('[handleHostDisconnected] Host disconnected, ending game...');
  broadcastSentFlag.value = false;
  startTriggeredFlag.value = false;
  
  // ホストが切断された場合、ホスト昇格APIを呼び出す
  showError('ホストが切断されました。ホスト昇格を確認中...');

  let newHostId = null;
  try {
    const res = await fetch(`${API_BASE_URL}/rooms/migrate_host.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: playerSession.currentRoomId })
    });
    const result = await res.json();
    if (result.success && result.migrated && result.host_player_id) {
      newHostId = result.host_player_id;
      // 自分が新ホストになった場合
      if (parseInt(newHostId) === parseInt(playerSession.playerId)) {
        showSuccess('あなたが新しいホストになりました！');
        if (typeof window._magicballUI?.onHostChanged === 'function') {
          window._magicballUI.onHostChanged(true);
        }
      } else {
        showSuccess('新しいホストが選出されました');
        if (typeof window._magicballUI?.onHostChanged === 'function') {
          window._magicballUI.onHostChanged(false);
        }
      }
    } else if (result.room_closed) {
      showError('他に参加者がいないためルームが閉鎖されました');
      playerSession.currentRoomId = null;
      showRoomSelectUI();
      loadRoomList();
      return;
    } else {
      showError('ホスト昇格に失敗しました: ' + (result.message || '不明なエラー'));
    }
  } catch (error) {
    showError('ホスト昇格API通信エラー: ' + error.message);
  }

  // 準備完了状態を確実にリセット
  try {
    await fetch(`${API_BASE_URL}/rooms/ready.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: playerSession.currentRoomId,
        player_id: playerSession.playerId,
        is_ready: false
      })
    });
  } catch (error) {
    console.warn('[handleHostDisconnected] Failed to reset ready state:', error);
  }

  // WebRTC接続を完全にクローズ
  if (webrtcManager) {
    try {
      webrtcManager.close();
    } catch (error) {
      console.warn('[handleHostDisconnected] Error closing WebRTC:', error);
    }
    webrtcManager = null;
    window._magicballWebRTC = null;
  }
  // グローバルstateのリセット
  if (typeof state !== 'undefined') {
    state.gameMode = 'waiting';
    state.myPlayerIndex = null;
    state.isSpectator = false;
    state.players = [];
    state.comboCount = 0;
    state.lastComboTime = 0;
    state.activePowerups = [];
    state.powerups = [];
    state.balls = [];
    state.map = [];
    state.currentGameMode = null;
    state.isHost = false;
    state.isOnlineMode = true;
  }
  // ゲームを終了
  if (window._magicball && window._magicball.endGameAndReturnToRoom) {
    window._magicball.endGameAndReturnToRoom();
  }

  // 2秒後にルームに戻る（UI更新のため）
  setTimeout(async () => {
    showWaitingRoomUI();
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.disabled = true;
    await updateParticipantList();
    if (readyBtn) readyBtn.disabled = false;
    startWaitingRoomPolling();
    showSuccess('ルームに戻りました');
  }, 2000);
}

/**
 * ルームが閉鎖された時の処理
 */
function handleRoomClosed() {
  showError('ホストが切断したため、ルームが閉鎖されました');
  
  // WebRTC接続をクローズ
  if (webrtcManager) {
    webrtcManager.close();
    webrtcManager = null;
    window._magicballWebRTC = null;
  }
  
  // ルーム一覧に戻る
  playerSession.currentRoomId = null;
  showRoomSelectUI();
  loadRoomList();
}

/**
 * ホスト変更時の処理
 * @param {boolean} isNowHost - 自分が新ホストになったかどうか
 */
function handleHostChanged(isNowHost) {
  console.log('[handleHostChanged] Is now host:', isNowHost);
  broadcastSentFlag.value = false;
  startTriggeredFlag.value = false;
  
  if (isNowHost) {
    // 自分がホストに昇格した
    showSuccess('あなたが新しいホストになりました！');

    // グローバルフラグをリセット（ホスト昇格時）
    initializingFlag.value = false;
    broadcastSentFlag.value = false;
    startTriggeredFlag.value = false;
    hasDetectedGameStartFlag.value = false;

    // グローバルstateのリセット
    if (typeof state !== 'undefined') {
      state.gameMode = 'waiting';
      state.myPlayerIndex = null;
      state.isSpectator = false;
      state.players = [];
      state.comboCount = 0;
      state.lastComboTime = 0;
      state.activePowerups = [];
      state.powerups = [];
      state.balls = [];
      state.map = [];
      state.currentGameMode = null;
      state.isHost = true;
      state.isOnlineMode = true;
    }
    // 参加者リストを取得し、WebRTC再接続→ゲーム再開
    (async () => {
      try {
        // ルーム情報取得
        const res = await fetch(`${API_BASE_URL}/rooms/list.php?room_id=${playerSession.currentRoomId}`);
        const data = await res.json();
        if (!data.success || !data.room || !data.participants) {
          showError('参加者情報の取得に失敗しました');
          return;
        }
        // playerInfo配列を再構築
        const playerInfo = data.participants.map(p => ({
          playerId: p.player_id !== undefined ? parseInt(p.player_id) : null,
          ballType: p.ball_type || 'kuro',
          playerName: p.display_name || p.player_name || null
        }));
        const totalPlayers = playerInfo.length;
        const hostPlayerId = data.room.host_player_id ? parseInt(data.room.host_player_id) : null;

        // state.isHostをtrueに（AI制御権限を引き継ぐ）
        if (typeof window !== 'undefined' && window.state) {
          window.state.isHost = true;
        }

        // WebRTC再接続＆ゲーム再開
        await initWebRTCAndStartGame(totalPlayers, playerInfo, hostPlayerId, true);
      } catch (e) {
        showError('ホスト昇格後の再接続に失敗しました: ' + e.message);
      }
    })();

    // 準備完了リストを強制更新（UIを即座に反映）
    updateParticipantList();
  } else {
    // 自分がホストでなくなった（通常は発生しない）
    showSuccess('ホストが変更されました');
    updateParticipantList();
  }
}

/**
 * チャット送信処理
 */
async function handleSendChat() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (message === '') {
    return; // 空メッセージは送信しない
  }
  
  if (!chatManager) {
    console.error('チャットマネージャーが初期化されていません', {
      roomId: playerSession.currentRoomId,
      playerId: playerSession.playerId,
      playerName: playerSession.playerName
    });
    showError('チャットが利用できません。ページを再読み込みしてください。');
    return;
  }
  
  console.log('チャット送信:', { message, roomId: chatManager.roomId, playerId: chatManager.playerId });
  const result = await chatManager.sendMessage(message);
  
  if (result.success) {
    input.value = ''; // 入力欄をクリア
    console.log('チャット送信成功:', result);
    // ポーリングで自動更新されるため、手動更新は不要
  } else {
    console.error('チャット送信失敗:', result);
    showError(result.error || 'メッセージ送信に失敗しました');
  }
}

/**
 * チャット入力キーイベント
 */
function handleChatKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSendChat();
  }
}

/**
 * チャット表示更新
 */
function updateChatDisplay(messages) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  // メッセージをレンダリング
  let html = '';
  messages.forEach(msg => {
    const time = new Date(msg.sent_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const isBlocked = msg.message_text === '禁止ワードが含まれます';
    const isSystem = msg.is_system == 1;
    
    let messageClass = 'chat-message';
    if (isSystem) {
      messageClass += ' system';
    } else if (isBlocked) {
      messageClass += ' blocked';
    }
    
    if (isSystem) {
      html += `<div class="${messageClass}">
        <span class="chat-message-text">${msg.message_text}</span>
        <span class="chat-message-time">${time}</span>
      </div>`;
    } else {
      html += `<div class="${messageClass}">
        <span class="chat-message-sender">${msg.display_name}:</span>
        <span class="chat-message-text">${msg.message_text}</span>
        <span class="chat-message-time">${time}</span>
      </div>`;
    }
  });
  
  chatMessages.innerHTML = html;
  
  // 自動スクロール（最新メッセージを表示）
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
