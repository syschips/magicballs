/**
 * 入力処理
 */

import { TILE, UI_TOP_HEIGHT } from './constants.js';
import { state } from './state.js';
import { chatInputMode, setChatInputMode, addChatInputChar, removeChatInputChar, getChatInputText, setChatInputText } from './renderer.js';

// 前回の発射キー状態を保持（エッジ検出用）
let lastFiringState = false;

/**
 * 入力イベントをホストに送信（クライアント用）
 */
function sendInputEvent(type, data) {
  const webrtc = window._magicballWebRTC;
  if (!webrtc || !window.playerSession) return;
  
  const hostPlayerId = state.players.find(p => !p.isCPU && p.realPlayerId !== window.playerSession.playerId)?.realPlayerId;
  if (!hostPlayerId) return;
  
  webrtc.send(hostPlayerId, {
    type: 'input',
    playerId: window.playerSession.playerId,
    playerIndex: state.myPlayerIndex, // プレイヤーインデックスも送信
    event: type,
    data: data
  });
}

/**
 * キーから移動方向を計算してホストに送信
 */
function sendMoveInput() {
  if (!state.isOnlineMode || state.isHost) return;
  
  // 自分のキーマッピングを取得
  const mapping = getKeyMapping(state.myPlayerIndex);
  if (!mapping) return;
  
  // 移動方向を計算
  let dx = 0, dy = 0;
  if (state.keys[mapping.left]) { dx = -1; dy = 0; }
  else if (state.keys[mapping.right]) { dx = 1; dy = 0; }
  else if (state.keys[mapping.down]) { dx = 0; dy = 1; }
  else if (state.keys[mapping.up]) { dx = 0; dy = -1; }
  
  // 発射キーの状態も送信
  const fireKey = getFireKey(state.myPlayerIndex);
  const firing = state.keys[fireKey] || false;
  lastFiringState = firing;
  
  // ホストに送信
  sendInputEvent('move', { dx, dy, firing });
}

/**
 * プレイヤーインデックスに応じたキーマッピングを取得
 * オンラインモードでは全員が矢印キーを使用
 */
function getKeyMapping(playerIndex) {
  // オンラインモードでは自分のプレイヤーは常に矢印キーで操作
  if (state.isOnlineMode) {
    return { left: 'arrowleft', right: 'arrowright', down: 'arrowdown', up: 'arrowup' };
  }
  
  // オフラインモード
  if (playerIndex === 0) {
    return { left: 'arrowleft', right: 'arrowright', down: 'arrowdown', up: 'arrowup' };
  } else if (playerIndex === 1) {
    return { left: 'a', right: 'd', down: 's', up: 'w' };
  }
  // 他のプレイヤーは後で実装
  return null;
}

/**
 * プレイヤーインデックスに応じた発射キーを取得
 * オンラインモードでは全員がスペースキーを使用
 */
function getFireKey(playerIndex) {
  // オンラインモードでは自分のプレイヤーは常にスペースキーで発射
  if (state.isOnlineMode) {
    return ' ';
  }
  
  // オフラインモード
  if (playerIndex === 0) return state.keybinds.p1fire || ' ';
  if (playerIndex === 1) return state.keybinds.p2fire || 'f';
  return ' ';
}

/**
 * キーボード入力のセットアップ
 * - 全てのキーを小文字化してkeysオブジェクトに記録
 * - 矢印キーとスペースキーのデフォルト動作(スクロール)を無効化
 * - チャット入力モード時は操作を無効化
 */
export function setupKeyboardInput() {
  console.log('[Input] Setting up keyboard input');
  
  window.addEventListener('keydown', e => {
    if (!e || !e.key) return;
    const k = e.key.toLowerCase();
    
    // デバッグ: Enterキーの状態をログ
    if (k === 'enter') {
      console.log('[Input] Enter key detected:', {
        gameMode: state?.gameMode,
        chatInputMode,
        isComposing: e.isComposing
      });
    }
    
    // ゲーム中のEnterキー: チャット入力モード切り替え
    if (state && state.gameMode === 'playing' && k === 'enter') {
      // IME入力中のEnterは無視（変換確定用）
      if (e.isComposing) {
        return;
      }
      
      e.preventDefault();
      
      if (chatInputMode) {
        // チャット送信
        const text = getChatInputText();
        if (text.trim().length > 0 && window._magicballChatManager) {
          window._magicballChatManager.sendMessage(text);
        }
        setChatInputMode(false);
      } else {
        // チャット入力モード開始
        setChatInputMode(true);
      }
      return;
    }
    
    // Escapeキー: チャット入力キャンセルまたはポーズ
    if (k === 'escape') {
      if (chatInputMode) {
        setChatInputMode(false);
        e.preventDefault();
        return;
      }
      
      if (window._magicball && window._magicball.togglePause) {
        window._magicball.togglePause();
      }
      e.preventDefault();
      return;
    }
    
    // チャット入力モード時の文字入力
    if (chatInputMode) {
      // Backspace: input要素で自動処理されるが、念のため
      if (k === 'backspace') {
        removeChatInputChar();
        e.preventDefault();
      } 
      // その他のキーはinput要素が自動処理（IME含む）
      return;
    }
    
    // 通常のゲーム入力
    state.keys[k] = true;
    
    // オンラインモード＆クライアント: 入力状態をホストに送信
    if (state.isOnlineMode && !state.isHost) {
      sendMoveInput();
    }
    
    // 矢印キーとスペースのデフォルト動作(スクロール)を防止
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }
  });
  
  window.addEventListener('keyup', e => {
    if (!e || !e.key) return;
    const k = e.key.toLowerCase();
    
    // チャット入力モード時は通常入力を無効化
    if (chatInputMode) {
      return;
    }
    
    if (state && state.keys) {
      state.keys[k] = false;
      
      // オンラインモード＆クライアント: 入力状態をホストに送信
      if (state.isOnlineMode && !state.isHost) {
        sendMoveInput();
      }
    }
  });
}

/**
 * キャンバスクリック: P1の向きを設定
 * クリック位置がプレイヤーから見てどの方向かを計算し、向きを更新
 * (ボール発射方向に影響)
 */
export function setupCanvasClick(canvas) {
  if (!canvas) return;
  canvas.addEventListener('click', (e) => {
    if (!state || !state.players || state.players.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top - UI_TOP_HEIGHT; // UIオフセットを引く
    
    // オンラインモードでは自分のプレイヤーのみ操作
    const myPlayerIndex = state.isOnlineMode ? state.myPlayerIndex : 0;
    const p = state.players[myPlayerIndex];
    if (!p) return;
    
    const px = (p.x + 0.5) * TILE, py = (p.y + 0.5) * TILE;
    const dx = mx - px, dy = my - py;
    // 水平距離と垂直距離を比較して、大きい方を優先
    if (Math.abs(dx) > Math.abs(dy)) p.dir = { x: dx > 0 ? 1 : -1, y: 0 };
    else p.dir = { x: 0, y: dy > 0 ? 1 : -1 };
    
    // オンラインモード＆クライアント: 向き変更をホストに送信
    if (state.isOnlineMode && !state.isHost && window._magicballWebRTC) {
      sendInputEvent('direction', { x: p.dir.x, y: p.dir.y });
    }
  });
}

/**
 * UIイベントのバインディング
 * - リセットボタン: ゲームを再開始
 * - CPUトグル: P2をCPU制御に切り替え
 * - キー設定適用ボタン: カスタムキーバインドを適用
 * - 難易度選択ボタン: 難易度を選択してゲーム開始
 */
export function setupUIBindings(resetCallback, startGameCallback, togglePauseCallback) {
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetCallback);
  }
  
  const cpuToggle = document.getElementById('cpuToggle');
  if (cpuToggle) {
    cpuToggle.addEventListener('change', (e) => {
      if (state.players[1]) {
        state.players[1].isCPU = e.target.checked;
      }
    });
  }
  
  const applyKeys = document.getElementById('applyKeys');
  if (applyKeys) {
    applyKeys.addEventListener('click', () => {
      const p1 = document.getElementById('p1fire').value.trim().toLowerCase();
      const p2 = document.getElementById('p2fire').value.trim().toLowerCase();
      const norm = (v) => v === 'space' ? ' ' : v; // "space"文字列をスペース文字に変換
      if (p1) state.keybinds.p1fire = norm(p1);
      if (p2) state.keybinds.p2fire = norm(p2);
    });
  }
  
  // ゲーム開始ボタン
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (startGameCallback) {
        startGameCallback();
      }
    });
  }
}
