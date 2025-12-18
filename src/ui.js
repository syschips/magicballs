/**
 * UI制御とオンライン機能の統合
 * @module ui
 */

import { state } from './state.js';
import { PlayerSession, RoomAPI, RankingAPI } from './api.js';
import { createWebRTCManager } from './webrtc.js';
import { showError, showSuccess, showLoading, hideLoading } from './notifications.js';
import { ChatManager } from './chat.js';
import { TIMING, WEBRTC_CONFIG } from './config.js';
import { handleError, AppError, ErrorType } from './errorHandler.js';

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
    showCharSelectUI();
  } else {
    // セッションがない場合はログイン画面へ
    showAuthUI();
  }
  
  // グローバルに公開（main.jsから参照するため）
  window._magicballSession = playerSession;
  
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
 * ログイン処理
 */
async function handleLogin() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  
  if (!username || !password) {
    showError('プレイヤー名とパスワードを入力してください');
    return;
  }
  
  showLoading('ログイン中...');
  try {
    const result = await playerSession.login(username, password);
    hideLoading();
    
    if (result.success) {
      showSuccess(`ログイン成功！レート: ${playerSession.rate}`);
      showCharSelectUI();
    } else {
      showError('ログイン失敗: ' + result.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleLogin');
  }
}

/**
 * 新規登録処理
 */
async function handleRegister() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  
  if (!username || !password) {
    showError('プレイヤー名とパスワードを入力してください');
    return;
  }
  
  if (password.length < 6) {
    showError('パスワードは6文字以上にしてください');
    return;
  }
  
  showLoading('登録中...');
  try {
    const result = await playerSession.register(username, password);
    hideLoading();
    
    if (result.success) {
      showSuccess('登録成功！');
      showCharSelectUI();
    } else {
      showError('登録失敗: ' + result.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleRegister');
  }
}

/**
 * オフラインプレイ
 */
function handleOfflinePlay() {
  // オフラインモード用にゲームを初期化してすぐに開始
  state.isOnlineMode = false; // オフラインモードを明示
  if (typeof window._magicballStartGame === 'function') {
    window._magicballStartGame(2, [1]); // 2人プレイ、プレイヤー1のみ人間
  }
  showGameUI();
}

/**
 * キャラ選択確定
 */
function handleCharConfirm() {
  showRoomSelectUI();
  loadRoomList();
  startRoomListPolling(); // 定期更新を開始
}

/**
 * ルーム作成
 */
async function handleCreateRoom() {
  const roomName = document.getElementById('roomNameInput').value.trim() || `${playerSession.playerName}の部屋`;
  const maxPlayers = parseInt(document.getElementById('maxPlayersInput').value);
  const gameTime = parseInt(document.getElementById('gameTimeInput').value);
  
  showLoading('ルーム作成中...');
  try {
    const result = await playerSession.createRoom(roomName, maxPlayers, gameTime);
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
  try {
    // まず空のルームをクリーンアップ
    await fetch(`${API_BASE_URL}/rooms/cleanup.php`, { method: 'POST' }).catch(() => {});
    
    const result = await RoomAPI.listRooms();
    if (result.success) {
      const roomList = document.getElementById('roomList');
      roomList.innerHTML = '';
      
      // current_players > 0 かつ status='waiting' のルームのみ表示
      const validRooms = result.rooms.filter(room => 
        room.current_players > 0 && room.status === 'waiting'
      );
      
      if (validRooms.length === 0) {
        roomList.innerHTML = '<p>現在参加可能なルームはありません</p>';
        return;
      }
      
      validRooms.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-item';
        roomDiv.innerHTML = `
          <h3>${room.room_name}</h3>
          <p>プレイヤー: ${room.current_players}/${room.max_players}</p>
          <p>ゲーム時間: ${room.game_time}秒</p>
          <button class="join-room-btn" data-room-id="${room.room_id}">参加</button>
        `;
        roomList.appendChild(roomDiv);
      });
      
      // 参加ボタンにイベントリスナー追加
      document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.onclick = () => handleJoinRoom(btn.dataset.roomId);
      });
    }
  } catch (error) {
    handleError(error, 'loadRoomList', false);
  }
}

/**
 * ルーム一覧の定期更新を開始
 */
function startRoomListPolling() {
  // 既存のインターバルをクリア（重複防止）
  stopRoomListPolling();
  // 5秒ごとに更新
  roomListPollingInterval = setInterval(loadRoomList, TIMING.ROOM_LIST_POLLING_INTERVAL);
}

/**
 * ルーム一覧の定期更新を停止
 */
function stopRoomListPolling() {
  if (roomListPollingInterval) {
    clearInterval(roomListPollingInterval);
    roomListPollingInterval = null;
  }
}

/**
 * ルーム参加
 */
async function handleJoinRoom(roomId) {
  showLoading('ルームに参加中...');
  try {
    const result = await playerSession.joinRoom(roomId);
    hideLoading();
    
    if (result.success) {
      showSuccess('ルームに参加しました');
      showWaitingRoomUI();
      startWaitingRoomPolling();
      
      // チャットマネージャーが初期化されるまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // システムメッセージ送信（参加通知）
      if (window._magicballChatManager) {
        await window._magicballChatManager.sendSystemMessage(`${playerSession.playerName} さんが参加しました`);
      }
    } else {
      showError('ルーム参加失敗: ' + result.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleJoinRoom');
  }
}

/**
 * ホストのゲーム開始処理
 * @param {Object} data - ルーム状態データ
 * @param {number} currentPlayerId - 現在のプレイヤーID
 * @private
 */
async function handleHostReady(data, currentPlayerId) {
  // 準備未完了のプレイヤーをチェック
  const notReadyPlayers = data.participants.filter(p => 
    !p.is_cpu && parseInt(p.player_id) !== currentPlayerId && !p.is_ready
  );
  
  if (notReadyPlayers.length > 0) {
    const notReadyNames = notReadyPlayers.map(p => p.display_name).join('、');
    showError(`準備未完了のプレイヤーがいます: ${notReadyNames}`);
    return;
  }
  
  showLoading('ゲーム開始中...');
  try {
    const readyResponse = await fetch(`${API_BASE_URL}/rooms/ready.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: playerSession.currentRoomId,
        player_id: playerSession.playerId,
        is_ready: true
      })
    });
    
    const readyResult = await readyResponse.json();
    hideLoading();
    
    if (readyResult.success && readyResult.all_ready) {
      showSuccess('ゲーム開始！');
    } else if (readyResult.success) {
      showError('全員の準備が完了していません');
    } else {
      showError('準備完了に失敗しました: ' + readyResult.message);
    }
  } catch (error) {
    hideLoading();
    handleError(error, 'handleHostReady');
  }
}

/**
 * 非ホストの準備状態トグル処理
 * @param {Object} data - ルーム状態データ
 * @param {number} currentPlayerId - 現在のプレイヤーID
 * @private
 */
async function handleParticipantReady(data, currentPlayerId) {
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

function startWaitingRoomPolling() {
  // 既存のインターバルをクリア（重複防止）
  stopWaitingRoomPolling();
  
  // 参加者情報を定期的に取得
  waitingRoomPollingInterval = setInterval(async () => {
    await updateParticipantList();
  }, TIMING.WAITING_ROOM_POLLING_INTERVAL);
  
  // ハートビート送信（last_seen_at更新用、180秒＝3分毎）
  waitingRoomHeartbeatInterval = setInterval(async () => {
    if (!playerSession.currentRoomId) return;
    
    try {
      // last_seen_atを更新するために空の状態を送信
      await fetch(`${API_BASE_URL}/game/update.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: playerSession.currentRoomId,
          player_id: playerSession.playerId,
          state_data: { heartbeat: true, timestamp: Date.now() }
        })
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, TIMING.HEARTBEAT_INTERVAL);
  
  // 初回実行
  updateParticipantList();
}

function stopWaitingRoomPolling() {
  if (waitingRoomPollingInterval) {
    clearInterval(waitingRoomPollingInterval);
    waitingRoomPollingInterval = null;
  }
  if (waitingRoomHeartbeatInterval) {
    clearInterval(waitingRoomHeartbeatInterval);
    waitingRoomHeartbeatInterval = null;
  }
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
function renderParticipantList(participants, hostPlayerId) {
  const participantList = document.getElementById('participantList');
  let html = '<ul>';
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
  
  if (isHost) {
    readyBtn.textContent = 'ゲーム開始';
    readyBtn.className = 'primary-btn';
    
    const nonHostHumanPlayers = participants.filter(p => 
      !p.is_cpu && parseInt(p.player_id) !== hostPlayerId
    );
    const allOthersReady = nonHostHumanPlayers.length === 0 || 
                           nonHostHumanPlayers.every(p => p.is_ready);
    readyBtn.disabled = !allOthersReady;
    
    console.log('[Host] Other players ready:', allOthersReady, 'Non-host players:', nonHostHumanPlayers);
  } else {
    const myParticipant = participants.find(p => parseInt(p.player_id) === currentPlayerId);
    const isReady = myParticipant ? myParticipant.is_ready : false;
    readyBtn.textContent = isReady ? '準備解除' : '準備完了';
    readyBtn.disabled = false;
    readyBtn.className = isReady ? 'danger-btn' : 'primary-btn';
  }
}

/**
 * ゲーム開始をチェックして実行
 * @param {Object} room - ルーム情報
 * @param {Array} participants - 参加者リスト
 * @private
 */
function checkAndStartGame(room, participants) {
  if (room.status === 'playing' && state.gameMode !== 'playing') {
    stopWaitingRoomPolling();
    
    const sortedParticipants = participants
      .filter(p => !p.is_cpu)
      .sort((a, b) => a.position - b.position);
    
    const maxPlayers = room.max_players || 4;
    const humanPlayerIds = sortedParticipants.map(p => parseInt(p.player_id));
    
    while (humanPlayerIds.length < maxPlayers) {
      humanPlayerIds.push(null);
    }
    
    const totalPlayers = maxPlayers;
    const hostPlayerId = room.host_player_id;
    const isHost = hostPlayerId === parseInt(playerSession.playerId);
    
    console.log('[checkAndStartGame] Starting game:', { 
      totalPlayers, 
      humanPlayerIds, 
      humanCount: sortedParticipants.length,
      cpuCount: totalPlayers - sortedParticipants.length,
      hostPlayerId, 
      isHost,
      participants: sortedParticipants.map(p => ({ id: p.player_id, pos: p.position }))
    });
    
    initWebRTCAndStartGame(totalPlayers, humanPlayerIds, hostPlayerId, isHost);
    showGameUI();
  }
}

async function updateParticipantList() {
  try {
    const data = await fetchRoomState();
    if (!data) return;
    
    const participantList = document.getElementById('participantList');
    const roomNameDisplay = document.getElementById('roomNameDisplay');
    
    if (data.success && data.participants) {
      // ルーム名を表示
      if (data.room && data.room.room_name && roomNameDisplay) {
        roomNameDisplay.textContent = data.room.room_name;
      }
      
      const hostPlayerId = data.room ? parseInt(data.room.host_player_id) : null;
      const currentPlayerId = parseInt(playerSession.playerId);
      const isHost = hostPlayerId === currentPlayerId;
      
      console.log(`[Host Check] hostPlayerId=${hostPlayerId}, currentPlayerId=${currentPlayerId}, isHost=${isHost}`);
      
      renderParticipantList(data.participants, hostPlayerId);
      updateReadyButton(isHost, data.participants, hostPlayerId, currentPlayerId);
      
      if (data.room) {
        checkAndStartGame(data.room, data.participants);
      }
    } else {
      participantList.innerHTML = '<p>参加者情報を取得できませんでした</p>';
    }
  } catch (error) {
    handleError(error, 'updateParticipantList', false);
  }
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
  webrtcManager.onConnectionStateChange((peerId, connectionState) => {
    console.log(`[WebRTC] Connection with ${peerId}: ${connectionState}`);
    
    // 接続確立時の処理
    if (connectionState === 'connected') {
      console.log(`[WebRTC] Successfully connected to ${peerId}`);
    } 
    // 切断・失敗時の処理
    else if (connectionState === 'failed' || connectionState === 'disconnected') {
      console.warn(`[WebRTC] Connection ${connectionState} with ${peerId}`);
      
      // ホストの場合: 切断した子プレイヤーをゲームオーバーにする
      if (isHost && window._magicball && window._magicball.handlePlayerDisconnected) {
        window._magicball.handlePlayerDisconnected(peerId);
      }
      // 子の場合: ホストが切断したら終了処理
      else if (!isHost && peerId === hostPlayerId) {
        // peer接続をクリーンアップしてからホスト切断処理
        if (webrtcManager && webrtcManager.peers.has(peerId)) {
          try {
            const pc = webrtcManager.peers.get(peerId);
            if (pc && pc.connectionState !== 'closed') {
              pc.close();
            }
            webrtcManager.peers.delete(peerId);
            webrtcManager.dataChannels.delete(peerId);
          } catch (error) {
            console.warn('[WebRTC] Error cleaning up peer:', error);
          }
        }
        handleHostDisconnected();
      }
    }
  });
}

/**
 * WebRTCメッセージハンドラーを設定
 * スナップショットと入力イベントの受信処理
 * @param {WebRTCManager} webrtcManager - WebRTCマネージャーインスタンス
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @private
 */
function setupWebRTCMessageHandler(webrtcManager, isHost) {
  webrtcManager.onMessage((senderId, message) => {
    if (message.type === 'snapshot' && !isHost) {
      // クライアント: スナップショットを適用
      if (typeof window._magicballApplySnapshot === 'function') {
        window._magicballApplySnapshot(message);
      }
    } else if (message.type === 'input' && isHost) {
      // ホスト: クライアントの入力イベントを処理
      if (typeof window._magicballHandleRemoteInput === 'function') {
        window._magicballHandleRemoteInput(message);
      }
    }
  });
}

/**
 * WebRTC接続の確立を待機
 * 最大接続試行回数までDataChannelの開通を確認
 * @param {WebRTCManager} webrtcManager - WebRTCマネージャーインスタンス
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @param {number[]} humanPlayerIds - 人間プレイヤーのID配列
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @returns {Promise<void>}
 * @private
 */
async function waitForWebRTCConnection(webrtcManager, isHost, humanPlayerIds, hostPlayerId) {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = WEBRTC_CONFIG.MAX_CONNECTION_ATTEMPTS;
    
    const checkConnection = setInterval(() => {
      attempts++;
      
      // ホスト: 全参加者との接続を確認
      if (isHost) {
        const allConnected = humanPlayerIds
          .filter(id => id !== null && id !== playerSession.playerId)
          .every(id => {
            const dc = webrtcManager.dataChannels.get(id);
            return dc && dc.readyState === 'open';
          });
        
        if (allConnected || attempts >= maxAttempts) {
          clearInterval(checkConnection);
          console.log('[WebRTC] Host connection check complete:', allConnected ? 'all connected' : 'timeout');
          resolve();
        }
      } 
      // クライアント: ホストとの接続を確認
      else {
        const dc = webrtcManager.dataChannels.get(hostPlayerId);
        const connected = dc && dc.readyState === 'open';
        
        if (connected || attempts >= maxAttempts) {
          clearInterval(checkConnection);
          console.log('[WebRTC] Client connection check complete:', connected ? 'connected' : 'timeout');
          resolve();
        }
      }
    }, TIMING.CONNECTION_CHECK_INTERVAL);
  });
}

/**
 * WebRTC接続を確立してゲームを開始
 * ホストは全参加者と接続、参加者はホストと接続
 * @param {number} totalPlayers - 総プレイヤー数（CPU含む）
 * @param {number[]} humanPlayerIds - 人間プレイヤーのID配列（nullはCPU）
 * @param {number} hostPlayerId - ホストのプレイヤーID
 * @param {boolean} isHost - このクライアントがホストかどうか
 * @returns {Promise<void>}
 * @private
 */
async function initWebRTCAndStartGame(totalPlayers, humanPlayerIds, hostPlayerId, isHost) {
  try {
    console.log('[WebRTC] Initializing connection...', { 
      roomId: playerSession.currentRoomId, 
      playerId: playerSession.playerId,
      isHost 
    });
    
    // WebRTCマネージャーを初期化
    webrtcManager = createWebRTCManager(
      playerSession.currentRoomId,
      playerSession.playerId,
      isHost
    );
    
    // ハンドラーの設定
    setupWebRTCConnectionHandler(webrtcManager, isHost, hostPlayerId);
    setupWebRTCMessageHandler(webrtcManager, isHost);
    
    // 接続の確立
    if (isHost) {
      const participantIds = humanPlayerIds.filter(id => id !== null && id !== playerSession.playerId);
      console.log('[WebRTC] Host connecting to participants:', participantIds);
      await webrtcManager.connectAsHost(participantIds);
    } else {
      console.log('[WebRTC] Client connecting to host:', hostPlayerId);
      await webrtcManager.connectAsParticipant(hostPlayerId);
    }
    
    // グローバルに公開（main.jsから参照するため）
    window._magicballWebRTC = webrtcManager;
    
    // DataChannelの確立を待つ
    await waitForWebRTCConnection(webrtcManager, isHost, humanPlayerIds, hostPlayerId);
    
    // ゲーム開始
    console.log('[WebRTC] Starting game with humanPlayerIds:', humanPlayerIds);
    window._magicballStartGame(totalPlayers, humanPlayerIds, hostPlayerId);
    
  } catch (error) {
    console.error('[WebRTC] Initialization failed:', error);
    // エラーでもゲームは開始する（フォールバック）
    window._magicballStartGame(totalPlayers, humanPlayerIds, hostPlayerId);
  }
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
}

function showGameUI() {
  document.getElementById('authUI').style.display = 'none';
  document.getElementById('charSelectUI').style.display = 'none';
  document.getElementById('roomSelectUI').style.display = 'none';
  document.getElementById('waitingRoomUI').style.display = 'none';
  document.getElementById('gameUI').style.display = 'block';
  
  setCanvasVisibility(true, true);
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
  if (!playerSession.currentRoomId) {
    showError('ルーム情報が見つかりません');
    return;
  }
  
  showLoading('ルームに戻っています...');
  
  try {
    // ホストの場合のみルームをリセット
    const isHost = window._magicball && window._magicball.getState && 
                   window._magicball.getState().isHost;
    
    if (isHost) {
      console.log('[handleReturnToRoom] Host is resetting room');
      const result = await RoomAPI.resetRoom(playerSession.currentRoomId);
      hideLoading();
      
      if (!result.success) {
        showError('ルームに戻れませんでした: ' + result.message);
        return;
      }
    } else {
      // クライアントは少し待ってからルームに戻る（ホストのリセットを待つ）
      console.log('[handleReturnToRoom] Client waiting for host to reset');
      await new Promise(resolve => setTimeout(resolve, 500));
      hideLoading();
    }
    
    // WebRTC接続をクローズ
    if (webrtcManager) {
      webrtcManager.close();
      webrtcManager = null;
      window._magicballWebRTC = null;
    }
    
    // ゲーム状態をリセット
    if (typeof window._magicball !== 'undefined' && window._magicball.resetGame) {
      window._magicball.resetGame();
    }
    
    // 待機ルームに戻る
    showWaitingRoomUI();
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
  
  // ホストが切断された場合、ゲームを終了してルームに戻る
  showError('ホストが切断されました。ゲームを終了してルームに戻ります...');
  
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
  
  // ゲームを終了してルームに戻る
  if (window._magicball && window._magicball.endGameAndReturnToRoom) {
    window._magicball.endGameAndReturnToRoom();
  }
  
  setTimeout(() => {
    handleReturnToRoom();
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
  
  if (isNowHost) {
    // 自分がホストに昇格した
    showSuccess('あなたが新しいホストになりました！');
    
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
