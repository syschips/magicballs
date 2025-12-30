/**
 * 待機ルームとルーム操作まわりの処理を集約するモジュール。
 * 依存は外から注入することでUI本体との結合度を下げる。
 */
export function createWaitingRoomFlow({
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
  checkAndStartGame,
  ChatManager,
  updateChatDisplay
}) {
  let roomListPollingInterval = null;
  let waitingRoomPollingInterval = null;
  const hasDetectedGameStart = hasDetectedGameStartFlag || { value: false };

  function startRoomListPolling() {
    stopRoomListPolling();
    roomListPollingInterval = setInterval(loadRoomList, TIMING.ROOM_LIST_POLLING_INTERVAL);
  }

  function stopRoomListPolling() {
    if (roomListPollingInterval) {
      clearInterval(roomListPollingInterval);
      roomListPollingInterval = null;
    }
  }

  async function loadRoomList() {
    try {
      await fetch(`${API_BASE_URL}/rooms/cleanup.php`, { method: 'POST' }).catch(() => {});
      const result = await RoomAPI.listRooms();
      if (result.success) {
        const roomList = document.getElementById('roomList');
        roomList.innerHTML = '';
        const validRooms = result.rooms.filter(room => room.current_players > 0 && room.status === 'waiting');
        if (validRooms.length === 0) {
          roomList.innerHTML = '<p>現在参加可能なルームはありません</p>';
          return;
        }
        validRooms.forEach(room => {
          const roomDiv = document.createElement('div');
          roomDiv.className = 'room-item';
          const modeLabel = room.game_mode === 'party' ? 'パーティ' : 'クラシック';
          roomDiv.innerHTML = `
            <h3>${room.room_name}</h3>
            <p>モード: ${modeLabel}</p>
            <p>プレイヤー: ${room.current_players}/${room.max_players}</p>
            <button class="join-room-btn" data-room-id="${room.room_id}">参加</button>
          `;
          roomList.appendChild(roomDiv);
        });
        document.querySelectorAll('.join-room-btn').forEach(btn => {
          btn.onclick = () => handleJoinRoom(btn.dataset.roomId);
        });
      }
    } catch (error) {
      handleError(error, 'loadRoomList', false);
    }
  }

  function startWaitingRoomPolling() {
    stopWaitingRoomPolling();
    waitingRoomPollingInterval = setInterval(async () => {
      await updateParticipantList();
    }, TIMING.WAITING_ROOM_POLLING_INTERVAL);
  }

  function stopWaitingRoomPolling() {
    if (waitingRoomPollingInterval) {
      clearInterval(waitingRoomPollingInterval);
      waitingRoomPollingInterval = null;
    }
  }

  async function handleCreateRoom() {
    const roomNameInput = document.getElementById('roomNameInput');
    const maxPlayersInput = document.getElementById('maxPlayersInput');
    const gameModeInput = document.getElementById('gameModeInput');
    if (!roomNameInput || !maxPlayersInput || !gameModeInput) {
      console.warn('[handleCreateRoom] Missing form elements', {
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

  async function handleJoinRoom(roomId) {
    showLoading('ルームに参加中...');
    try {
      const result = await playerSession.joinRoom(roomId);
      hideLoading();
      if (result.success) {
        showSuccess('ルームに参加しました');
        showWaitingRoomUI();
        startWaitingRoomPolling();
        await new Promise(resolve => setTimeout(resolve, 100));
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

  async function handleHostReady(data, currentPlayerId) {
    try {
      if (typeof window !== 'undefined' && window._magicballWebRTC) {
        try {
          window._magicballWebRTC.close();
          window._magicballWebRTC = null;
          if (typeof window.webrtcManager !== 'undefined') window.webrtcManager = null;
          console.log('[handleHostReady] Closed previous WebRTC connection');
        } catch (e) {
          console.warn('[handleHostReady] Error closing previous WebRTC connection:', e);
        }
      }
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
        // state.isHost は維持（ホスト状態を保持）
        state.isOnlineMode = true;
        state.gameSessionId = null;
        console.log('[handleHostReady] Cleared state for clean start (preserved isHost)');
      }
      window._gameStartBroadcastSent = false;
      window._gameStartTriggered = false;
      if (typeof window !== 'undefined' && window._magicballSessionIdGlobal) {
        window._magicballSessionIdGlobal = null;
      }
    } catch (cleanupErr) {
      console.warn('[handleHostReady] Cleanup warning:', cleanupErr);
    }
    const notReadyPlayers = data.participants.filter(p => !p.is_cpu && parseInt(p.player_id) !== currentPlayerId && !p.is_ready);
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
      if (readyResult.success) {
        showSuccess('ゲームを開始します');
        showWaitingRoomUI();
        startWaitingRoomPolling();
      } else {
        showError('ゲーム開始失敗: ' + readyResult.message);
      }
    } catch (error) {
      hideLoading();
      handleError(error, 'handleHostReady');
    }
  }

  async function updateParticipantList() {
    try {
      const data = await fetchRoomState();
      if (!data) return;
      const participantList = document.getElementById('participantList');
      const roomNameDisplay = document.getElementById('roomNameDisplay');
      if (data.success && data.participants) {
        if (data.room && data.room.room_name && roomNameDisplay) {
          roomNameDisplay.textContent = data.room.room_name;
        }
        const hostPlayerId = data.room ? parseInt(data.room.host_player_id) : null;
        const currentPlayerId = parseInt(playerSession.playerId);
        const isHost = hostPlayerId === currentPlayerId;
        const gameMode = data.room ? (data.room.game_mode || 'classic') : 'classic';
        console.log(`[Host Check] hostPlayerId=${hostPlayerId}, currentPlayerId=${currentPlayerId}, isHost=${isHost}, gameMode=${gameMode}`);
        renderParticipantList(data.participants, hostPlayerId, gameMode);
        updateReadyButton(isHost, data.participants, hostPlayerId, currentPlayerId);
        if (data.room && data.room.status === 'playing' && !hasDetectedGameStart.value) {
          hasDetectedGameStart.value = true;
          console.log('[updateParticipantList] Game start detected, executing checkAndStartGame');
          checkAndStartGame(data.room, data.participants);
        }
      } else {
        participantList.innerHTML = '<p>参加者情報を取得できませんでした</p>';
      }
    } catch (error) {
      handleError(error, 'updateParticipantList', false);
    }
  }

  function resetStartDetection() {
    hasDetectedGameStart.value = false;
  }

  function initWaitingRoomChat(chatManagerRef) {
    if (chatManagerRef.current) {
      chatManagerRef.current.stopPolling();
    }
    if (playerSession.currentRoomId && playerSession.playerId) {
      chatManagerRef.current = new ChatManager(playerSession.currentRoomId, playerSession.playerId);
      chatManagerRef.current.startPolling(updateChatDisplay);
      window._magicballChatManager = chatManagerRef.current;
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

  return {
    startRoomListPolling,
    stopRoomListPolling,
    startWaitingRoomPolling,
    stopWaitingRoomPolling,
    loadRoomList,
    handleCreateRoom,
    handleJoinRoom,
    handleHostReady,
    updateParticipantList,
    resetStartDetection,
    hasDetectedGameStart,
    initWaitingRoomChat
  };
}
