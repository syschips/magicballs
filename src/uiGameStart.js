import { TIMING, WEBRTC_CONFIG } from './config.js';

/**
 * ゲーム開始フローとセッション管理をまとめたモジュール。
 * 外部から依存を注入して循環参照を避ける。
 */
export function createGameStartFlow({
  state,
  playerSession,
  createWebRTCManager,
  showWaitingRoomUI,
  showGameUI,
  showError,
  startWaitingRoomPolling,
  resetRoomWithRetry,
  enterGameStartPhase,
  handleHostDisconnected,
  stopWaitingRoomPolling,
  getWebRTCManager,
  setWebRTCManager,
  flags
}) {
  const { broadcastSentFlag, startTriggeredFlag, initializingFlag, lastStartFailureAt, hasDetectedGameStart } = flags;

  function setInitializing(val) {
    initializingFlag.value = val;
  }
  function setLastFailure(ts) {
    lastStartFailureAt.value = ts;
  }
  function resetStartDetection() {
    hasDetectedGameStart.value = false;
  }

  function setupWebRTCConnectionHandler(webrtcManager, isHost, hostPlayerId) {
    webrtcManager.onConnectionStateChange((peerId, connectionState) => {
      console.log(`[WebRTC] Connection with ${peerId}: ${connectionState}`);
      if (connectionState === 'connected') {
        console.log(`[WebRTC] Successfully connected to ${peerId}`);
      } else if (connectionState === 'failed' || connectionState === 'disconnected') {
        const isGameEnded = state && (state.gameMode === 'clear' || state.gameMode === 'gameover');
        if (isGameEnded) {
          console.log(`[WebRTC] Connection ${connectionState} with ${peerId} (game ended, normal cleanup)`);
          return;
        }
        // ゲーム開始前の一時的な切断はホスト切断扱いにしない（再オファーを待つ）
        const hasStarted = startTriggeredFlag?.value || hasDetectedGameStart?.value;
        console.warn(`[WebRTC] Connection ${connectionState} with ${peerId}`);
        if (isHost && window._magicball && window._magicball.handlePlayerDisconnected) {
          window._magicball.handlePlayerDisconnected(peerId);
        } else if (!isHost && peerId === hostPlayerId) {
          // ホスト側がまだ開始ブロードキャスト前であれば、切断を即ゲーム終了にしない
          if (!hasStarted) {
            console.warn('[WebRTC] Host connection dropped before start; waiting for re-offer');
            return;
          }
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

  function setupWebRTCMessageHandler(webrtcManager, isHost) {
    webrtcManager.onMessage((senderId, message) => {
      if (message.type === 'start' && !isHost) {
        if (!message.sessionId) {
          message.sessionId = Date.now();
          console.warn('[WebRTCMessageHandler] start message missing sessionId, generated locally', { sessionId: message.sessionId });
        }
        console.log('[WebRTCMessageHandler] start message received', {
          type: message.type,
          totalPlayers: message.totalPlayers,
          playerInfoLength: message.playerInfo?.length,
          playerInfo: message.playerInfo,
          hostPlayerId: message.hostPlayerId,
          mapSeed: message.mapSeed,
          sessionId: message.sessionId
        });
        if (typeof state !== 'undefined') {
          state.gameSessionId = message.sessionId;
        }
        if (typeof window !== 'undefined' && window._magicballState) {
          window._magicballState.gameSessionId = message.sessionId;
        }
        if (typeof window !== 'undefined') {
          window._magicballSessionIdGlobal = message.sessionId;
        }
        enterGameStartPhase(message.totalPlayers, message.playerInfo, message.hostPlayerId, message.mapSeed, message.sessionId);
      } else if (message.type === 'start' && isHost) {
        // ホスト自身が受信することは基本ないが、再送時に受けた場合もフラグを揃えて重複開始を防止
        if (!startTriggeredFlag.value) {
          startTriggeredFlag.value = true;
        }
        broadcastSentFlag.value = true;
      } else if (message.type === 'snapshot' && !isHost) {
        if (typeof window._magicballApplySnapshot === 'function') {
          window._magicballApplySnapshot(message);
        }
      } else if (message.type === 'input' && isHost) {
        if (typeof window._magicballHandleRemoteInput === 'function') {
          window._magicballHandleRemoteInput(message);
        }
      }
    });
  }

  // ブロードキャストとホスト開始を一元化（二重送信防止）
  function triggerHostBroadcastAndStart(webrtcManager, finalTotalPlayers, finalPlayerInfo, hostPlayerId, mapSeed, sessionId) {
    if (!webrtcManager || broadcastSentFlag.value) return;
    console.log('[Broadcast Trigger] Starting broadcast+host start');
    broadcastSentFlag.value = true;
    const broadcastMessage = {
      type: 'start',
      totalPlayers: finalTotalPlayers,
      playerInfo: finalPlayerInfo,
      hostPlayerId,
      mapSeed,
      sessionId
    };
    console.log('[Broadcast Trigger] 内容', broadcastMessage);
    webrtcManager.broadcast(broadcastMessage);
    if (typeof window._magicballStartGame === 'function' && !startTriggeredFlag.value) {
      startTriggeredFlag.value = true;
      window._magicballStartGame(finalTotalPlayers, finalPlayerInfo, hostPlayerId, mapSeed, sessionId);
      if (typeof showGameUI === 'function') showGameUI();
    }
  }

  function waitForWebRTCConnection(webrtcManager, isHost, playerInfo, hostPlayerId) {
    return new Promise((resolve) => {
      let attempts = 0;
      // タイミング設定に基づいて最大試行回数を算出
      const maxAttempts = Math.ceil(TIMING.MAX_CONNECTION_WAIT / TIMING.CONNECTION_CHECK_INTERVAL);
      const checkConnection = setInterval(() => {
        attempts++;
        if (!webrtcManager || !webrtcManager.dataChannels) {
          console.warn('[WebRTC] Manager or dataChannels missing, aborting connection wait');
          clearInterval(checkConnection);
          resolve();
          return;
        }
        if (isHost) {
          const allConnected = playerInfo
            .filter(info => info.playerId !== null && info.playerId !== playerSession.playerId)
            .every(info => {
              const dc = webrtcManager.dataChannels.get(info.playerId);
              const pc = webrtcManager.peers.get(info.playerId);
              const dcReady = dc && dc.readyState === 'open';
              const pcConnected = pc && (
                pc.connectionState === 'connected' ||
                pc.connectionState === 'completed' ||
                pc.iceConnectionState === 'connected' ||
                pc.iceConnectionState === 'completed' ||
                (pc.connectionState === 'connecting' && pc.iceConnectionState === 'connected')
              );
              return dcReady || pcConnected;
            });
            if (attempts % 20 === 0) {
            const statuses = playerInfo
              .filter(info => info.playerId !== null && info.playerId !== playerSession.playerId)
              .map(info => {
                const dc = webrtcManager.dataChannels.get(info.playerId);
                const pc = webrtcManager.peers.get(info.playerId);
                return `P${info.playerId}: dc=${dc?.readyState || 'none'}, pc=${pc?.connectionState || 'none'}, ice=${pc?.iceConnectionState || 'none'}`;
              });
              console.log(`[WebRTC] Connection status (${attempts}/${maxAttempts}):`, statuses.join(' | '));
          }
          if (allConnected || attempts >= maxAttempts) {
            clearInterval(checkConnection);
            console.log('[WebRTC] Host connection check complete:', allConnected ? 'all connected' : 'timeout');
            resolve();
          }
        } else {
          const dc = webrtcManager.dataChannels.get(hostPlayerId);
          const pc = webrtcManager.peers.get(hostPlayerId);
          const dcReady = dc && dc.readyState === 'open';
          const pcConnected = pc && (
            pc.connectionState === 'connected' ||
            pc.connectionState === 'completed' ||
            pc.iceConnectionState === 'connected' ||
            pc.iceConnectionState === 'completed' ||
            (pc.connectionState === 'connecting' && pc.iceConnectionState === 'connected')
          );
          const connected = dcReady || pcConnected;
          if (attempts % 20 === 0) {
            console.log(`[WebRTC] Client connection status (${attempts}/${maxAttempts}):`, { dcState: dc?.readyState, pcState: pc?.connectionState, iceState: pc?.iceConnectionState });
          }
          if (connected || attempts >= maxAttempts) {
            clearInterval(checkConnection);
            console.log('[WebRTC] Client connection check complete:', connected ? 'connected' : 'timeout');
            resolve();
          }
        }
      }, TIMING.CONNECTION_CHECK_INTERVAL);
    });
  }

  // DataChannelがopenになるまで待機（ホスト用）
  function waitForDataChannelsOpen(webrtcManager, playerInfo, hostPlayerId) {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = Math.ceil(TIMING.MAX_CONNECTION_WAIT / TIMING.CONNECTION_CHECK_INTERVAL);
      const checkDC = setInterval(() => {
        attempts++;
        if (!webrtcManager || !webrtcManager.dataChannels) {
          console.warn('[WebRTC] Manager or dataChannels missing, aborting DC wait');
          clearInterval(checkDC);
          resolve(false);
          return;
        }
        const allOpen = playerInfo
          .filter(info => info.playerId !== null && info.playerId !== playerSession.playerId)
          .every(info => {
            const dc = webrtcManager.dataChannels.get(info.playerId);
            return dc && dc.readyState === 'open';
          });
        if (attempts % 20 === 0) {
          const statuses = playerInfo
            .filter(info => info.playerId !== null && info.playerId !== playerSession.playerId)
            .map(info => {
              const dc = webrtcManager.dataChannels.get(info.playerId);
              const pc = webrtcManager.peers.get(info.playerId);
              return `P${info.playerId}: dc=${dc?.readyState || 'none'}, pc=${pc?.connectionState || 'none'}, ice=${pc?.iceConnectionState || 'none'}`;
            });
          console.log(`[WebRTC] DataChannel status (${attempts}/${maxAttempts}):`, statuses.join(' | '));
        }
        if (allOpen || attempts >= maxAttempts) {
          clearInterval(checkDC);
          console.log('[WebRTC] DataChannel open check complete:', allOpen ? 'all open' : 'timeout');
          resolve(allOpen);
        }
      }, TIMING.CONNECTION_CHECK_INTERVAL);
    });
  }
  
  // DataChannel open発火時に、ホストが条件を満たせば即時ブロードキャストを再試行
  async function triggerBroadcastIfReady(webrtcManager, filteredPlayerInfo, hostPlayerId, mapSeed, sessionId, totalPlayers) {
    try {
      if (!webrtcManager || !webrtcManager.dataChannels) return;
      if (broadcastSentFlag.value) return; // 二重送信防止
      // すべてopenか確認
      const dcAllOpen = await waitForDataChannelsOpen(webrtcManager, filteredPlayerInfo, hostPlayerId);
      if (!dcAllOpen) return;
      console.log('[Broadcast Retry] DataChannels opened, triggering broadcast');
      const hostIdNum = parseInt(hostPlayerId, 10);
      let finalPlayerInfo = filteredPlayerInfo.slice();
      const hostInfo = filteredPlayerInfo.find(info => parseInt(info.playerId, 10) === hostIdNum);
      if (hostInfo && !finalPlayerInfo.find(info => parseInt(info.playerId, 10) === hostIdNum)) {
        finalPlayerInfo.push(hostInfo);
      }
      triggerHostBroadcastAndStart(webrtcManager, totalPlayers, finalPlayerInfo, hostPlayerId, mapSeed, sessionId);
    } catch (err) {
      console.warn('[Broadcast Retry] Failed to trigger broadcast on DC open:', err);
    }
  }

  async function initWebRTCAndStartGame(totalPlayers, playerInfo, hostPlayerId, isHost, mapSeed = undefined, sessionId = null) {
    console.log('[initWebRTCAndStartGame] called', { isHost, playerInfo, hostPlayerId, mapSeed, sessionId });
    console.log('[setupWebRTCMessageHandler] called', { isHost, webrtcManager: getWebRTCManager() });
    if (window._magicballWebRTC) {
      try {
        console.log('[initWebRTCAndStartGame] Closing previous WebRTC connection');
        window._magicballWebRTC.close();
        window._magicballWebRTC = null;
      } catch (e) {
        console.warn('[initWebRTCAndStartGame] Error closing previous WebRTC:', e);
      }
    }
    if (getWebRTCManager()) {
      try {
        getWebRTCManager().close();
        setWebRTCManager(null);
      } catch (e) {
        console.warn('[initWebRTCAndStartGame] Error closing local webrtcManager:', e);
      }
    }
    console.log('[initWebRTCAndStartGame] Previous WebRTC cleaned up');
    try {
      console.log('[WebRTC] Initializing connection...', {
        roomId: playerSession.currentRoomId,
        playerId: playerSession.playerId,
        isHost
      });
      const manager = createWebRTCManager(playerSession.currentRoomId, playerSession.playerId, isHost);
      setWebRTCManager(manager);
      setupWebRTCConnectionHandler(manager, isHost, hostPlayerId);
      setupWebRTCMessageHandler(manager, isHost);
      // DataChannel open時の再試行フック（ホストのみ）
      if (isHost) {
        const filteredPlayerInfoForHook = playerInfo.filter(info => info && info.playerId != null);
        manager.onDataChannelOpen(async (peerId) => {
          console.log('[WebRTC] DataChannel opened event from', peerId);
          // まだ開始ブロードキャストを送っていない場合のみ再試行
          if (!broadcastSentFlag.value) {
            await triggerBroadcastIfReady(manager, filteredPlayerInfoForHook, hostPlayerId, mapSeed, sessionId, totalPlayers);
          }
        });
      }
      if (isHost) {
        const participantIds = playerInfo
          .map(info => info.playerId)
          .filter(id => id !== null && id !== playerSession.playerId);
        console.log('[WebRTC] Host connecting to participants:', participantIds);
        await manager.connectAsHost(participantIds);
      } else {
        console.log('[WebRTC] Client connecting to host:', hostPlayerId);
        await manager.connectAsParticipant(hostPlayerId);
      }
      window._magicballWebRTC = manager;
      await waitForWebRTCConnection(manager, isHost, playerInfo, hostPlayerId);
      if (!manager || !manager.dataChannels) {
        console.warn('[initWebRTCAndStartGame] WebRTC manager missing after wait, aborting');
        broadcastSentFlag.value = false;
        startTriggeredFlag.value = false;
        if (typeof showWaitingRoomUI === 'function') showWaitingRoomUI();
        startWaitingRoomPolling();
        return;
      }
      if (isHost) {
        const openPeers = playerInfo
          .map(info => info.playerId)
          .filter(id => id !== null && id !== playerSession.playerId)
          .filter(id => {
            const dc = manager.dataChannels.get(id);
            const pc = manager.peers.get(id);
            const dcReady = dc && dc.readyState === 'open';
            const pcConnected = pc && (
              pc.connectionState === 'connected' ||
              pc.connectionState === 'completed' ||
              pc.iceConnectionState === 'connected' ||
              pc.iceConnectionState === 'completed' ||
              (pc.connectionState === 'connecting' && pc.iceConnectionState === 'connected')
            );
            return dcReady || pcConnected;
          });
        console.log('[initWebRTCAndStartGame] Peer connection status:', playerInfo
          .filter(info => info.playerId !== null && info.playerId !== playerSession.playerId)
          .map(info => {
            const dc = manager.dataChannels.get(info.playerId);
            const pc = manager.peers.get(info.playerId);
            return `P${info.playerId}: dc=${dc?.readyState || 'none'}, pc=${pc?.connectionState || 'none'}, ice=${pc?.iceConnectionState || 'none'}`;
          }).join(' | '));
        // DataChannelがopenになるまで待機（ブロードキャストの確実化）
        const dcsOpen = await waitForDataChannelsOpen(manager, playerInfo, hostPlayerId);
        if (!dcsOpen) {
          console.warn('[initWebRTCAndStartGame] DataChannels not open yet. Will rely on next polling to retry broadcast.');
          // 追加の復旧策: 未openピアに対してOfferを再作成
          const notOpenIds = playerInfo
            .map(info => info.playerId)
            .filter(id => id !== null && id !== playerSession.playerId)
            .filter(id => {
              const dc = manager.dataChannels.get(id);
              return !(dc && dc.readyState === 'open');
            });
          for (const pid of notOpenIds) {
            await manager.retryOfferConnection(pid, true);
          }
        }
        // DataChannel openイベントでもブロードキャストをトリガ（onDataChannelOpenから呼ばれる）
        const filteredPlayerInfoForHook = playerInfo.filter(info => info && info.playerId != null);
        manager.onDataChannelOpen(async (peerId) => {
          console.log('[WebRTC] DataChannel opened event from', peerId);
          if (!broadcastSentFlag.value) {
            await triggerBroadcastIfReady(manager, filteredPlayerInfoForHook, hostPlayerId, mapSeed, sessionId, totalPlayers);
          }
        });
      }
      console.log('[WebRTC] Starting game with playerInfo:', playerInfo);
      if (isHost) {
        // ホスト側のゲーム開始は、broadcast送信後（checkAndStartGame内）に実行
        console.log('[WebRTC] Host start deferred until after broadcast');
      } else {
        console.log('[initWebRTCAndStartGame] 非ホスト: 終了');
      }
    } catch (error) {
      console.error('[WebRTC] Initialization failed:', error);
      window._magicballStartGame(totalPlayers, playerInfo, hostPlayerId, mapSeed, sessionId);
    }
  }

  function checkAndStartGame(room, participants) {
    if (room.status === 'playing' && state.gameMode !== 'playing') {
      if (initializingFlag.value) {
        console.log('[checkAndStartGame] Already initializing, skipping...');
        return;
      }
      if (lastStartFailureAt.value && Date.now() - lastStartFailureAt.value < 5000) {
        return;
      }
      initializingFlag.value = true;
      try {
        stopWaitingRoomPolling();
        if (room.game_mode) {
          state.currentGameMode = room.game_mode;
          console.log('[checkAndStartGame] Set game mode:', state.currentGameMode);
        }
        const sortedParticipants = participants
          .filter(p => !p.is_cpu)
          .sort((a, b) => a.position - b.position);
        const maxPlayers = room.max_players || 4;
        const playerInfo = sortedParticipants.map(p => ({
          playerId: parseInt(p.player_id),
          ballType: p.ball_type || 'kuro',
          playerName: p.display_name || p.player_name || null
        }));
        const filteredPlayerInfo = playerInfo.filter(info => info && info.playerId != null);
        const totalPlayers = maxPlayers;
        const hostPlayerId = room.host_player_id;
        const isHost = hostPlayerId === parseInt(playerSession.playerId);
        console.log('[checkAndStartGame] Starting game:', {
          totalPlayers,
          playerInfo,
          humanCount: sortedParticipants.length,
          cpuCount: totalPlayers - sortedParticipants.length,
          hostPlayerId,
          isHost,
          gameMode: state.currentGameMode,
          participants: sortedParticipants.map(p => ({ id: p.player_id, pos: p.position, ballType: p.ball_type }))
        });
        if (isHost) {
          if (broadcastSentFlag.value) {
            console.log('[checkAndStartGame] ホスト: 既にゲーム開始を broadcast済みのためスキップ');
            return;
          }
          (async () => {
            broadcastSentFlag.value = false;
            startTriggeredFlag.value = false;
            const mapSeed = Math.floor(Math.random() * 1e9);
            const sessionId = Date.now();
            state.gameSessionId = sessionId;
            if (typeof window !== 'undefined') {
              window._magicballState.gameSessionId = sessionId;
              window._magicballSessionIdGlobal = sessionId;
            }
            console.log('[checkAndStartGame] Host sessionId set before broadcast', { sessionId });
            if (!sessionId) {
              console.error('[checkAndStartGame] sessionId generation failed');
            }
            if (!window._magicballWebRTC) {
              await initWebRTCAndStartGame(totalPlayers, filteredPlayerInfo, hostPlayerId, true, mapSeed, sessionId);
            }
            const CONNECTION_TIMEOUT = 30000;
            let timedOut = false;
            let timeoutId = setTimeout(() => { timedOut = true; }, CONNECTION_TIMEOUT);
            await waitForWebRTCConnection(window._magicballWebRTC, true, filteredPlayerInfo, hostPlayerId);
            clearTimeout(timeoutId);
            if (!window._magicballWebRTC || !window._magicballWebRTC.dataChannels) {
              console.warn('[checkAndStartGame] WebRTC connection missing after wait, aborting start');
              broadcastSentFlag.value = false;
              startTriggeredFlag.value = false;
              showWaitingRoomUI();
              startWaitingRoomPolling();
              return;
            }
            let connectedIds = filteredPlayerInfo
              .map(info => info.playerId)
              .filter(pid => {
                const dc = window._magicballWebRTC.dataChannels.get(pid);
                const pc = window._magicballWebRTC.peers.get(pid);
                const dcReady = dc && dc.readyState === 'open';
                const pcConnected = pc && (
                  pc.connectionState === 'connected' ||
                  pc.connectionState === 'completed' ||
                  pc.iceConnectionState === 'connected' ||
                  pc.iceConnectionState === 'completed' ||
                  (pc.connectionState === 'connecting' && pc.iceConnectionState === 'connected')
                );
                return dcReady || pcConnected;
              });
            let finalPlayerInfo = filteredPlayerInfo.filter(info => connectedIds.includes(info.playerId));
            if (!connectedIds.length) {
              // 即時リセットは行わず、接続遅延を考慮して継続待機する
              console.warn('[checkAndStartGame] ホスト: 参加者の接続待機を継続（ルームは維持、リセットしない）');
              setLastFailure(Date.now());
              broadcastSentFlag.value = false;
              startTriggeredFlag.value = false;
              // ここで追加の接続待機を一度だけ行い、次回のポーリングで再試行させる
              await waitForWebRTCConnection(window._magicballWebRTC, true, filteredPlayerInfo, hostPlayerId);
              // 再計算しても接続がなければ抜けて次のポーリングで再試行
              connectedIds = filteredPlayerInfo
                .map(info => info.playerId)
                .filter(pid => {
                  const dc = window._magicballWebRTC.dataChannels.get(pid);
                  const pc = window._magicballWebRTC.peers.get(pid);
                  const dcReady = dc && dc.readyState === 'open';
                  const pcConnected = pc && (
                    pc.connectionState === 'connected' ||
                    pc.connectionState === 'completed' ||
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed' ||
                    (pc.connectionState === 'connecting' && pc.iceConnectionState === 'connected')
                  );
                  return dcReady || pcConnected;
                });
              finalPlayerInfo = filteredPlayerInfo.filter(info => connectedIds.includes(info.playerId));
              if (!connectedIds.length) {
                console.warn('[checkAndStartGame] ホスト: 依然として未接続。次回のポーリングで再試行します');
                return;
              }
            }
            const hostIdNum = parseInt(hostPlayerId, 10);
            const hostInfo = filteredPlayerInfo.find(info => parseInt(info.playerId, 10) === hostIdNum);
            if (hostInfo && !finalPlayerInfo.find(info => parseInt(info.playerId, 10) === hostIdNum)) {
              finalPlayerInfo.push(hostInfo);
            }
            const finalTotalPlayers = totalPlayers;
            if (timedOut && finalTotalPlayers < filteredPlayerInfo.length) {
              const excluded = filteredPlayerInfo.filter(info => !connectedIds.includes(info.playerId));
              if (excluded.length > 0) {
                showError('一部のプレイヤーが接続できなかったため、除外してゲームを開始します。');
              }
            }
            // ブロードキャスト前にDataChannelがopenかを確認（PCがconnectedなら即進む）
            const dcAllOpen = await waitForDataChannelsOpen(window._magicballWebRTC, filteredPlayerInfo, hostPlayerId);
            const pcAllConnected = filteredPlayerInfo
              .filter(info => info && info.playerId != null && info.playerId !== playerSession.playerId)
              .every(info => {
                const pc = window._magicballWebRTC.peers.get(info.playerId);
                return pc && (
                  pc.connectionState === 'connected' ||
                  pc.connectionState === 'completed' ||
                  pc.iceConnectionState === 'connected' ||
                  pc.iceConnectionState === 'completed'
                );
              });
            if (!dcAllOpen && !pcAllConnected) {
              console.warn('[checkAndStartGame] ホスト: DataChannelが未openかつPCも未接続のため、broadcastを遅延（次回再試行）');
              // 再試行: 未openピアに対してOffer再送をトリガ
              const notOpenIds = filteredPlayerInfo
                .map(info => info.playerId)
                .filter(id => id !== null && id !== playerSession.playerId)
                .filter(id => {
                  const dc = window._magicballWebRTC.dataChannels.get(id);
                  return !(dc && dc.readyState === 'open');
                });
              for (const pid of notOpenIds) {
                await window._magicballWebRTC.retryOfferConnection(pid, true);
              }
              return;
            }
            if (!dcAllOpen && pcAllConnected) {
              console.log('[checkAndStartGame] ホスト: DC未openだがPC接続済み、再Offerを強制して待機');
              const notOpenIds = filteredPlayerInfo
                .map(info => info.playerId)
                .filter(id => id !== null && id !== playerSession.playerId)
                .filter(id => {
                  const dc = window._magicballWebRTC.dataChannels.get(id);
                  return !(dc && dc.readyState === 'open');
                });
              for (const pid of notOpenIds) {
                await window._magicballWebRTC.retryOfferConnection(pid, true);
              }
              return;
            }
            triggerHostBroadcastAndStart(window._magicballWebRTC, finalTotalPlayers, finalPlayerInfo, hostPlayerId, mapSeed, sessionId);
          })();
        } else {
          (async () => {
            console.log('[checkAndStartGame] 非ホスト: WebRTC初期化開始');
            await initWebRTCAndStartGame(totalPlayers, filteredPlayerInfo, hostPlayerId, false);
            console.log('[checkAndStartGame] 非ホスト: WebRTC初期化完了、ホストのstart messageを待機中');
          })();
        }
      } catch (error) {
        console.error('[checkAndStartGame] Error during initialization:', error);
        initializingFlag.value = false;
        showError('ゲーム開始に失敗しました: ' + error.message);
      } finally {
        initializingFlag.value = false;
      }
    }
  }

  return {
    checkAndStartGame,
    initWebRTCAndStartGame,
    waitForWebRTCConnection,
    setupWebRTCConnectionHandler,
    setupWebRTCMessageHandler,
    resetStartDetection
  };
}
