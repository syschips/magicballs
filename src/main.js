/**
 * メインゲームループと統合
 */

import { COLS, ROWS, CANVAS_W, CANVAS_H, POWERUP_TYPES, PLAYER_INDEX, TICK_RATE, TICK_DELTA } from './constants.js';
import { TIMING } from './config.js';
import { state, resetState } from './state.js';
import { render } from './renderer.js';
import { initMap } from './map.js';
import { createPlayer, updatePlayers, stopMoveAtCurrentPosition, updatePlayerInvincibility } from './player.js';
import { placeBall, updateBalls, updatePreviews, updateExplosions } from './ball.js';
import { runAI, dangerCellsFromBalls } from './ai.js';
import { setupKeyboardInput, setupCanvasClick, setupUIBindings } from './input.js';
import { updatePowerups, updateCombo, hasPowerup } from './utils.js';
import { updateParticles } from './particle.js';
import { initUI } from './ui.js';

// Canvas初期化
const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

/**
 * ゲームのリセット
 * - マップを再生成
 * - 全エンティティをクリア
 * - プレイヤーを初期位置に配置
 * - CPU設定をUIから取得
 * @param {number} totalPlayers - 総プレイヤー数（オンライン対戦時に指定）
 * @param {Array} humanPlayerIds - 人間プレイヤーのID配列
 */
function resetGame(totalPlayers = 2, humanPlayerIds = [1]) {
  initMap();
  resetState();
  
  // 初期位置の定義
  const spawnPositions = [
    { x: 0, y: 0, color: '#ff6b6b' },              // P1: 左上
    { x: COLS - 1, y: ROWS - 1, color: '#4da6ff' },// P2: 右下
    { x: 0, y: ROWS - 1, color: '#66ff66' },       // P3: 左下
    { x: COLS - 1, y: 0, color: '#ffff66' },       // P4: 右上
    { x: 0, y: Math.floor(ROWS / 2), color: '#ff66ff' },      // P5: 左中央
    { x: COLS - 1, y: Math.floor(ROWS / 2), color: '#66ffff' } // P6: 右中央
  ];
  
  state.players = [];
  
  // オフラインモードの場合（UIから設定を取得）
  if (totalPlayers === 2 && humanPlayerIds.length === 1) {
    state.players = [
      createPlayer(1, 0, 0, '#ff6b6b'),              // P1: 左上
      createPlayer(2, COLS - 1, ROWS - 1, '#4da6ff') // P2: 右下
    ];
    
    const cpuToggle = document.getElementById('cpuToggle');
    if (cpuToggle) {
      state.players[1].isCPU = cpuToggle.checked;
    }
    
    // P3とP4を追加(チェックボックスがONの場合)
    const cpu3Toggle = document.getElementById('cpu3Toggle');
    if (cpu3Toggle && cpu3Toggle.checked) {
      const p3 = createPlayer(3, 0, ROWS - 1, '#66ff66'); // P3: 左下(緑)
      p3.isCPU = true;
      state.players.push(p3);
    }
    
    const cpu4Toggle = document.getElementById('cpu4Toggle');
    if (cpu4Toggle && cpu4Toggle.checked) {
      const p4 = createPlayer(4, COLS - 1, 0, '#ffff66'); // P4: 右上(黄)
      p4.isCPU = true;
      state.players.push(p4);
    }
  } else {
    // オンラインモードの場合（指定された人数分プレイヤーを作成）
    console.log('[resetGame] Online mode:', { totalPlayers, humanPlayerIds });
    state.isOnlineMode = true;
    
    for (let i = 0; i < totalPlayers; i++) {
      const playerId = i + 1;
      const pos = spawnPositions[i] || spawnPositions[0]; // フォールバック
      const player = createPlayer(playerId, pos.x, pos.y, pos.color);
      
      // humanPlayerIdsの中で対応するDBのplayer_idを取得（nullならCPU）
      const realPlayerId = humanPlayerIds[i];
      
      // 人間プレイヤーかCPUかを判定
      if (realPlayerId !== null && realPlayerId !== undefined) {
        player.realPlayerId = realPlayerId; // DBのplayer_idを保存
        player.isCPU = false;
        console.log(`[resetGame] Created player ${playerId}:`, { realPlayerId, isCPU: false, pos });
      } else {
        // CPU補充
        player.isCPU = true;
        player.realPlayerId = null;
        console.log(`[resetGame] Created CPU player ${playerId}:`, { pos });
      }
      
      state.players.push(player);
    }
    const humanCount = humanPlayerIds.filter(id => id !== null && id !== undefined).length;
    console.log('[resetGame] Total players created:', state.players.length, { humans: humanCount, cpus: totalPlayers - humanCount });
    
    // 自分のプレイヤーインデックスを特定（playerSessionからmyPlayerIdを取得）
    if (typeof window !== 'undefined' && window.playerSession && window.playerSession.playerId) {
      state.myPlayerId = window.playerSession.playerId;
      
      // 重要: humanPlayerIdsはDBのplayer_idの配列 [5, 6, 7, ...]
      // state.players[i].idはゲーム内のID（1, 2, 3, ...）
      // 正しいマッピング: humanPlayerIdsの中での位置 = state.playersのインデックス
      const indexInHumanPlayers = humanPlayerIds.indexOf(state.myPlayerId);
      
      if (indexInHumanPlayers >= 0 && indexInHumanPlayers < state.players.length) {
        state.myPlayerIndex = indexInHumanPlayers;
        state.isSpectator = false;
        console.log(`[resetGame] My player: playerId=${state.myPlayerId}, index=${state.myPlayerIndex}`);
      } else if (indexInHumanPlayers < 0) {
        // humanPlayerIdsに含まれていない = 観戦者
        state.myPlayerIndex = null;
        state.isSpectator = true;
        console.log(`[resetGame] Spectator mode: playerId=${state.myPlayerId}`);
      } else {
        // インデックスが範囲外（エラー）
        console.error(`[resetGame] Index out of range: indexInHumanPlayers=${indexInHumanPlayers}, players.length=${state.players.length}`);
        state.myPlayerIndex = null;
        state.isSpectator = true;
      }
    } else {
      // playerSessionがない場合（オフラインモード、またはエラー）
      console.warn('[resetGame] No playerSession found');
      state.myPlayerIndex = null;
      state.isSpectator = true;
    }
  }
  
  // ゲームモードを開始画面に設定
  if (state.gameMode === 'start') {
    // 初回のみスタート画面を表示
  } else {
    state.gameMode = 'playing';
  }
}

/**
 * 勝敗判定とゲーム終了処理
 * 生存者が1人以下になったらゲーム終了
 * - 1人生き残っていればそのプレイヤーの勝利
 * - 0人なら引き分け
 * - オンライン対戦の場合、結果をサーバーに送信
 */
async function checkWin() {
  if (!state || state.gameMode !== 'playing') return;
  if (!state.players || !Array.isArray(state.players)) return;
  
  const alive = state.players.filter(p => p && p.alive);
  if (alive.length <= 1) {
    if (alive.length === 1) {
      state.gameMode = 'clear';
    } else {
      state.gameMode = 'gameover';
    }
    
    console.log('[checkWin] Game ended:', { 
      mode: state.gameMode, 
      alive: alive.length,
      isHost: state.isHost,
      isOnline: state.isOnlineMode 
    });
    
    // オンライン対戦の場合、ホストが最終スナップショットを送信してから同期を停止
    if (typeof window !== 'undefined' && window._magicballWebRTC) {
      if (state.isHost) {
        console.log('[checkWin] Sending final snapshot before stopping sync');
        broadcastSnapshot(); // 最終状態を送信
      }
      console.log('[checkWin] Stopping WebRTC sync');
      stopWebRTCSync();
    }
    
    // オンライン対戦かつホストの場合のみ結果をサーバーに送信
    if (state.isOnlineMode && state.isHost) {
      await sendGameResultToServer();
    }
    
    // オンライン対戦の場合、ルームに戻るボタンを表示＆3秒後に自動復帰
    if (state.isOnlineMode &&
        typeof window._magicballSession !== 'undefined' && 
        window._magicballSession.isLoggedIn && 
        window._magicballSession.isLoggedIn() &&
        typeof window._magicballUI !== 'undefined') {
      window._magicballUI.showReturnToRoomButton();
      
      // 3秒後に自動でルームに戻る
      setTimeout(() => {
        if (state.gameMode === 'clear' || state.gameMode === 'gameover') {
          console.log('[checkWin] Auto-returning to room after 3 seconds');
          if (window._magicballUI && window._magicballUI.returnToRoom) {
            window._magicballUI.returnToRoom();
          }
        }
      }, TIMING.AUTO_RETURN_TO_ROOM_DELAY);
    }
  }
}

// ===== WebRTC同期処理 =====
let snapshotInterval = null;
const SNAPSHOT_RATE = 20; // 20Hz（50msごと）

/**
 * WebRTC同期をセットアップ
 */
function setupWebRTCSync() {
  const webrtc = window._magicballWebRTC;
  if (!webrtc) return;
  
  if (state.isHost) {
    // ホスト: 定期的にスナップショットを送信（20Hz）
    console.log('[WebRTC Sync] Host: Starting snapshot broadcast at 20Hz');
    snapshotInterval = setInterval(() => {
      broadcastSnapshot();
    }, TIMING.SNAPSHOT_INTERVAL);
  } else {
    // クライアント: スナップショットを受信（ui.jsで既に設定済み）
    console.log('[WebRTC Sync] Client: Listening for snapshots');
  }
  
  // グローバルにハンドラを公開（ui.jsのコールバックから呼ばれる）
  window._magicballHandleRemoteInput = handleRemoteInput;
  window._magicball = {
    handlePlayerDisconnected,
    endGameAndReturnToRoom,
    resetGame
  };
}

/**
 * WebRTC同期を停止
 */
function stopWebRTCSync() {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
    console.log('[WebRTC Sync] Stopped');
  }
}

/**
 * リモートプレイヤーの入力イベントを処理（ホスト用）
 */
/**
 * ホスト: クライアントからの入力イベントを処理
 */
function handleRemoteInput(message) {
  if (!state.isHost) return;
  
  const playerId = message.playerId;
  const playerIndex = message.playerIndex;
  const eventType = message.event;
  const data = message.data;
  
  console.log('[Remote Input] Received:', { playerId, playerIndex, eventType, data });
  
  // プレイヤーを特定
  const player = state.players.find(p => p.realPlayerId === playerId);
  if (!player) {
    console.warn('[Remote Input] Player not found:', playerId);
    return;
  }
  
  // 前回の発射キー状態を保持（プレイヤーごと）
  if (!player._lastFiring) {
    player._lastFiring = false;
  }
  
  // 移動入力を適用
  if (eventType === 'move') {
    // プレイヤーの_humanInputに保存（updatePlayers内で使用）
    player._humanInput = { dx: data.dx, dy: data.dy };
    
    // 発射キーの状態を反映
    const fireKey = playerIndex === 0 ? state.keybinds.p1fire : state.keybinds.p2fire;
    const wasFiring = player._lastFiring;
    const isFiring = data.firing;
    
    state.keys[fireKey] = isFiring;
    
    // 新しく押された場合（エッジ検出）
    if (isFiring && !wasFiring && player.ballsLeft > 0 && !player.moving) {
      console.log('[Remote Input] Placing ball for player:', playerIndex, 'at', player.x, player.y);
      import('./ball.js').then(module => {
        module.placeBall(player);
      });
    }
    
    player._lastFiring = isFiring;
  } else if (eventType === 'direction') {
    // 方向変更
    player.dir = { x: data.x, y: data.y };
  }
}

/**
 * ゲーム状態のスナップショットを作成
 */
function createSnapshot() {
  return {
    type: 'snapshot',
    tick: state.currentTick,
    gameTime: state.gameTime,
    timeScale: state.timeScale,
    gameMode: state.gameMode, // ゲーム終了判定用
    map: state.map, // 壁破壊の同期用
    players: state.players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      ballsLeft: p.ballsLeft,
      alive: p.alive,
      score: p.score,
      combo: p.combo,
      invincible: p.invincible,
      invincibleTime: p.invincibleTime,
      dir: p.dir // 向き情報も同期
    })),
    balls: state.balls.map(b => ({
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      remaining: b.remaining,
      fuse: b.fuse,
      moving: b.moving
    })),
    explosions: state.explosions.map(e => ({
      x: e.x,
      y: e.y,
      radius: e.radius,
      life: e.life
    })),
    powerups: state.powerups.map(pu => ({
      x: pu.x,
      y: pu.y,
      type: pu.type,
      collected: pu.collected
    })),
    items: state.items.map(item => ({ // アイテムも同期
      x: item.x,
      y: item.y,
      type: item.type,
      collected: item.collected
    }))
  };
}

/**
 * ホスト: スナップショットをブロードキャスト
 */
function broadcastSnapshot() {
  const webrtc = window._magicballWebRTC;
  if (!webrtc || !state.isHost) return;
  
  const snapshot = createSnapshot();
  webrtc.broadcast(snapshot);
}

/**
 * クライアント: スナップショットを適用
 */
function applySnapshot(snapshot) {
  if (!snapshot || snapshot.type !== 'snapshot') {
    console.warn('[WebRTC Sync] Invalid snapshot:', snapshot);
    return;
  }
  
  console.log('[WebRTC Sync] Applying snapshot:', { 
    tick: snapshot.tick, 
    gameMode: snapshot.gameMode,
    players: snapshot.players?.length,
    balls: snapshot.balls?.length
  });
  
  // Tick同期
  state.currentTick = snapshot.tick;
  state.gameTime = snapshot.gameTime;
  state.timeScale = snapshot.timeScale;
  state.gameMode = snapshot.gameMode; // ゲーム終了判定を同期
  
  // マップ状態を更新（壁破壊の同期）
  if (snapshot.map) {
    state.map = snapshot.map;
  }
  
  // プレイヤー状態を更新
  snapshot.players.forEach((pSnapshot, idx) => {
    if (idx < state.players.length) {
      const p = state.players[idx];
      p.x = pSnapshot.x;
      p.y = pSnapshot.y;
      p.vx = pSnapshot.vx;
      p.vy = pSnapshot.vy;
      p.ballsLeft = pSnapshot.ballsLeft;
      p.alive = pSnapshot.alive;
      p.score = pSnapshot.score;
      p.combo = pSnapshot.combo;
      p.invincible = pSnapshot.invincible;
      p.invincibleTime = pSnapshot.invincibleTime;
      if (pSnapshot.dir) {
        p.dir = pSnapshot.dir;
      }
    }
  });
  
  // ボール状態を更新
  state.balls = snapshot.balls.map(bSnapshot => ({
    x: bSnapshot.x,
    y: bSnapshot.y,
    vx: bSnapshot.vx,
    vy: bSnapshot.vy,
    remaining: bSnapshot.remaining,
    fuse: bSnapshot.fuse,
    moving: bSnapshot.moving,
    owner: null // オーナー情報は省略
  }));
  
  // 爆発を更新
  state.explosions = snapshot.explosions.map(eSnapshot => ({
    x: eSnapshot.x,
    y: eSnapshot.y,
    radius: eSnapshot.radius,
    life: eSnapshot.life
  }));
  
  // パワーアップを更新
  state.powerups = snapshot.powerups.map(puSnapshot => ({
    x: puSnapshot.x,
    y: puSnapshot.y,
    type: puSnapshot.type,
    collected: puSnapshot.collected
  }));
  
  // アイテムを更新
  if (snapshot.items) {
    state.items = snapshot.items.map(itemSnapshot => ({
      x: itemSnapshot.x,
      y: itemSnapshot.y,
      type: itemSnapshot.type,
      collected: itemSnapshot.collected
    }));
  }
}

/**
 * ゲーム結果をサーバーに送信（オンライン対戦時）
 */
async function sendGameResultToServer() {
  // playerSessionが利用可能かチェック
  if (typeof window._magicballSession === 'undefined' || !window._magicballSession.isLoggedIn()) {
    return; // オフラインモードの場合は何もしない
  }
  
  const session = window._magicballSession;
  if (!session.currentRoomId) return;
  
  // ホストのみが送信（重複防止）
  if (!state.isHost) {
    console.log('[sendGameResult] Not host, skipping result submission');
    return;
  }
  
  try {
    // 各プレイヤーの結果を集計
    if (!state.players || !Array.isArray(state.players)) {
      console.warn('[sendGameResult] No players to send results');
      return;
    }
    const results = state.players
      .filter(p => p && !p.isCPU && p.realPlayerId) // CPUを除外、realPlayerIdがあるもののみ
      .map(p => {
        // 勝敗を判定
        let result = 'lose';
        if (state.gameMode === 'clear') {
          // 生き残ったプレイヤーが勝者
          result = p.alive ? 'win' : 'lose';
        } else if (state.gameMode === 'gameover') {
          // 全滅の場合は引き分け
          result = 'draw';
        }
        
        return {
          player_id: p.realPlayerId, // DBのplayer_idを使用
          result: result,
          score: p.score || 0
        };
      });
    
    // 勝者IDを特定
    const winner = state.players.find(p => !p.isCPU && p.alive && state.gameMode === 'clear');
    const winner_id = winner ? winner.realPlayerId : null;
    
    console.log('[sendGameResult] Submitting results:', { results, winner_id });
    
    // GameAPI経由でサーバーに送信
    const { GameAPI } = await import('./api.js');
    if (!GameAPI || !GameAPI.finishGame) {
      throw new Error('GameAPI.finishGame is not available');
    }
    
    const result = await GameAPI.finishGame(session.currentRoomId, results, winner_id);
    
    if (result && result.success) {
      console.log('ゲーム結果を送信しました', result.rate_changes);
      
      // レート変動をグローバルに保存（UI表示用）
      window._magicballRateChanges = result.rate_changes;
    }
  } catch (error) {
    console.error('ゲーム結果の送信に失敗しました:', error);
  }
}

/**
 * メッセージ表示を更新
 */
function updateMessage(msg) {
  const el = document.getElementById('message');
  if (el) el.textContent = msg;
}

/**
 * プレイヤー更新処理の拡張版
 * AI危険回避と発射処理を統合
 */
function updatePlayersWithAI(dt) {
  // プレイヤー移動とアイテム取得（AIも内部で処理される）
  const playerActions = updatePlayers(dt, runAI);
  
  // ボール発射処理（複数プレイヤー対応）
  if (playerActions) {
    for (const action of playerActions) {
      if (action.action === 'fire') {
        placeBall(action.player);
      }
    }
  }
}

/**
 * メイン更新処理: 全ゲーム要素を毎フレーム更新
 * @param {number} dt - デルタタイム(秒)
 */
function update(dt) {
  // ゲームモードに応じた処理
  if (!state || state.gameMode === 'start' || state.gameMode === 'paused') {
    return; // スタート画面とポーズ中は更新しない
  }
  
  if (state.gameMode === 'playing') {
    // オンラインモード＆クライアント: ゲームロジックを実行しない（スナップショットのみ適用）
    if (state.isOnlineMode && !state.isHost) {
      // クライアントはパーティクルのみ更新（視覚効果）
      updateParticles(dt);
      // ゲーム終了判定は実行（gameModeがスナップショットで同期される）
      checkWin();
      return;
    }
    
    // ホストまたはオフラインモード: 通常のゲームロジック実行
    // ゲーム時間を更新
    state.gameTime += dt;
    
    // スローモーション効果を更新
    let hasSlowMo = false;
    for (const p of state.players) {
      if (hasPowerup(p.id, POWERUP_TYPES.SLOW_MO)) {
        hasSlowMo = true;
        break;
      }
    }
    state.timeScale = hasSlowMo ? 0.5 : 1.0;
    
    // パワーアップ更新
    updatePowerups(dt);
    
    // コンボ更新
    updateCombo();
    
    // プレイヤー更新
    updatePlayerInvincibility(dt);
    updatePlayersWithAI(dt);
    
    // ボール更新
    updateBalls(dt);
    updatePreviews();
    updateExplosions(dt);
    
    // パーティクル更新
    updateParticles(dt);
    
    // 勝敗判定
    checkWin();
  }
}

/**
 * メインループ: requestAnimationFrameで呼ばれる
 * 固定Tick方式: 可変フレームレートでも一定間隔でゲームロジックを更新
 * @param {number} ts - タイムスタンプ(ミリ秒)
 */
function loop(ts) {
  const frameTime = (ts - state.lastTime) / 1000; // 前回フレームからの経過時間(秒)
  state.lastTime = ts;
  state.accumulator += frameTime;
  
  // 固定Tickで複数回更新（蓄積された時間分だけ処理）
  while (state.accumulator >= TICK_DELTA) {
    update(TICK_DELTA); // 常に固定値(0.01667秒)で更新
    state.currentTick++;
    state.accumulator -= TICK_DELTA;
  }
  
  // 描画は毎フレーム実行
  render(ctx);
  requestAnimationFrame(loop);
}

// ゲーム開始関数
export function startGame(totalPlayers = 2, humanPlayerIds = [], hostPlayerId = null) {
  // 既にゲーム中の場合は何もしない（重複呼び出しを防ぐ）
  if (state.gameMode === 'playing' || state.gameMode === 'countdown') {
    console.warn('[startGame] Already in playing/countdown mode, ignoring duplicate call');
    return;
  }
  
  console.log('[startGame] Starting game with countdown:', { totalPlayers, humanPlayerIds, hostPlayerId, currentMode: state.gameMode });
  
  // カウントダウン開始
  state.gameMode = 'countdown';
  state.countdown = 3;
  
  const countdownInterval = setInterval(() => {
    state.countdown--;
    console.log('[startGame] Countdown:', state.countdown);
    
    if (state.countdown <= 0) {
      clearInterval(countdownInterval);
      state.gameMode = 'playing';
      console.log('[startGame] Game started!');
      
      // ゲーム開始処理
      resetGame(totalPlayers, humanPlayerIds);
      
      // ゲーム開始処理を続ける
      continueGameStart(totalPlayers, humanPlayerIds, hostPlayerId);
    }
  }, TIMING.COUNTDOWN_INTERVAL);
}

/**
 * カウントダウン後のゲーム開始処理
 */
function continueGameStart(totalPlayers, humanPlayerIds, hostPlayerId) {
  // オンラインモードの場合、ホスト判定を設定
  if (state.isOnlineMode) {
    // hostPlayerIdが渡されている場合はそれを使用
    if (hostPlayerId !== null && typeof window !== 'undefined' && window.playerSession) {
      state.isHost = (parseInt(hostPlayerId) === parseInt(window.playerSession.playerId));
      console.log('[startGame] Host status from hostPlayerId:', state.isHost, { hostPlayerId, myPlayerId: window.playerSession.playerId });
    }
    // フォールバック: 自分のIDがhumanPlayerIds[0]ならホストとみなす
    else if (typeof window !== 'undefined' && window.playerSession) {
      state.isHost = (parseInt(window.playerSession.playerId) === humanPlayerIds[0]);
      console.log('[startGame] Host status fallback (first player):', state.isHost);
    }
    
    // WebRTC同期を開始
    if (typeof window !== 'undefined' && window._magicballWebRTC) {
      console.log('[startGame] Starting WebRTC synchronization as', state.isHost ? 'HOST' : 'CLIENT');
      setupWebRTCSync();
    } else {
      console.warn('[startGame] WebRTC manager not found, synchronization will not work');
    }
    
    // システムメッセージ送信（ホストのみ）
    if (state.isHost && typeof window !== 'undefined' && window._magicballChatManager) {
      window._magicballChatManager.sendSystemMessage('ゲームが開始されました');
    }
  }
  
  // ゲーム開始時にコントロールUIを非表示
  const controlsDiv = document.getElementById('controls');
  if (controlsDiv) {
    controlsDiv.style.display = 'none';
    console.log('[startGame] Controls UI hidden');
  }
  
  console.log('[startGame] Game started:', { totalPlayers, humanPlayerIds, isHost: state.isHost });
}

// ゲームリセット（外部から呼び出し可能）
export { resetGame };

/**
 * プレイヤーが切断された時の処理（ホストのみ）
 * @param {number} playerId - 切断したプレイヤーのID
 */
function handlePlayerDisconnected(playerId) {
  if (!state.isHost || !state.isOnlineMode) {
    return; // ホストのみが処理
  }
  
  console.log('[handlePlayerDisconnected] Player disconnected:', playerId);
  
  // プレイヤーを探して死亡判定
  const player = state.players.find(p => p.realPlayerId === parseInt(playerId));
  if (player && player.alive) {
    console.log('[handlePlayerDisconnected] Marking player as dead:', playerId);
    player.alive = false;
    player.ballsLeft = 0;
    
    // チャットで通知（ホストのみ送信）
    if (typeof window !== 'undefined' && window._magicballChatManager) {
      window._magicballChatManager.sendSystemMessage(`プレイヤー${playerId}が切断しました`);
    }
    
    // CPUプレイヤーも同時にゲームオーバーにする
    state.players.forEach(p => {
      if (p.isCPU && p.alive) {
        console.log('[handlePlayerDisconnected] Marking CPU as dead:', p.id);
        p.alive = false;
        p.ballsLeft = 0;
      }
    });
    
    // 即座にスナップショットを送信して状態を同期
    if (typeof broadcastSnapshot === 'function') {
      broadcastSnapshot();
    }
  }
}

/**
 * ゲームを終了してルームに戻る処理
 */
function endGameAndReturnToRoom() {
  console.log('[endGameAndReturnToRoom] Ending game...');
  
  // ゲームモードを終了に設定
  state.gameMode = 'gameover';
  
  // WebRTC同期を停止
  stopWebRTCSync();
  
  // すべてのプレイヤーを死亡状態にする
  if (state.players) {
    state.players.forEach(player => {
      player.alive = false;
      player.ballsLeft = 0;
    });
  }
  
  console.log('[endGameAndReturnToRoom] Game ended');
}

/**
 * オンライン対戦中に自分のプレイヤーインデックスを再計算
 * 途中参加・再参加・プレイヤー変更時に使用
 * 
 * @param {Array<number>} humanPlayerIds - 現在のゲームの人間プレイヤーIDリスト
 */
export function recalculateMyPlayerIndex(humanPlayerIds) {
  if (!state.isOnlineMode) {
    console.warn('[recalculateMyPlayerIndex] Not in online mode');
    return;
  }
  
  if (typeof window !== 'undefined' && window.playerSession && window.playerSession.playerId) {
    state.myPlayerId = window.playerSession.playerId;
    
    const indexInHumanPlayers = humanPlayerIds.indexOf(state.myPlayerId);
    
    if (indexInHumanPlayers >= 0 && indexInHumanPlayers < state.players.length) {
      const oldIndex = state.myPlayerIndex;
      state.myPlayerIndex = indexInHumanPlayers;
      state.isSpectator = false;
      console.log(`[recalculateMyPlayerIndex] My player index changed: ${oldIndex} → ${state.myPlayerIndex}`);
    } else if (indexInHumanPlayers < 0) {
      state.myPlayerIndex = null;
      state.isSpectator = true;
      console.log(`[recalculateMyPlayerIndex] Now spectator: playerId=${state.myPlayerId}`);
    } else {
      console.error(`[recalculateMyPlayerIndex] Index out of range: ${indexInHumanPlayers} >= ${state.players.length}`);
      state.myPlayerIndex = null;
      state.isSpectator = true;
    }
  }
}

// ポーズ切り替え
export function togglePause() {
  if (state.gameMode === 'playing') {
    state.gameMode = 'paused';
  } else if (state.gameMode === 'paused') {
    state.gameMode = 'playing';
  }
}

// 入力処理のセットアップ
setupKeyboardInput();
setupCanvasClick(canvas);
setupUIBindings(resetGame, startGame, togglePause);

// グローバルに公開（ui.jsからの循環依存を回避）
window._magicballStartGame = startGame;
window._magicballApplySnapshot = applySnapshot; // WebRTC同期用

// UIのセットアップ（これが初期画面を決定する）
initUI();

// 初期状態はUIによって制御される（initUI内でstate.gameModeが設定される）
// resetGame()はゲーム開始時に呼ばれるので、ここでは呼ばない
// requestAnimationFrameは常に実行（描画ループ）
requestAnimationFrame(loop);

// デバッグ用: コンソールからゲーム状態にアクセス可能
window._magicball = { state, startGame, togglePause, resetGame };
