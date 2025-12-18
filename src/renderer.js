/**
 * 描画処理
 */

import { 
  COLS, ROWS, TILE, CANVAS_W, CANVAS_H, UI_TOP_HEIGHT, GAME_FIELD_H,
  POWERUP_TYPES, INVINCIBILITY_BLINK_INTERVAL, BALL_TYPES, 
  CHAT_MESSAGE_DISPLAY_COUNT, RENDER_CONSTANTS 
} from './constants.js';
import { state } from './state.js';
import { inBounds, hasPowerup } from './utils.js';
import { renderParticles } from './particle.js';

// チャット入力モード管理
export let chatInputMode = false;
export let chatInputText = '';

/**
 * ゲームフィールド座標をCanvas座標に変換するヘルパー
 */
function toCanvasY(gameY) {
  return gameY + UI_TOP_HEIGHT;
}

/**
 * チャット入力モード設定
 */
export function setChatInputMode(enabled) {
  chatInputMode = enabled;
  if (!enabled) {
    chatInputText = '';
  }
}

/**
 * チャット入力テキスト追加
 */
export function addChatInputChar(char) {
  if (chatInputText.length < CHAT_INPUT_MAX_LENGTH) {
    chatInputText += char;
  }
}

/**
 * チャット入力テキスト削除
 */
export function removeChatInputChar() {
  chatInputText = chatInputText.slice(0, -1);
}

/**
 * チャット入力テキスト取得
 */
export function getChatInputText() {
  return chatInputText;
}

// ========== 描画ヘルパー関数 ==========

/**
 * アイテム描画用のヘルパー関数
 */
function drawItemDisplay(ctx, x, y, color, text, value) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 40, 40);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 40, 40);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + 20, y + 15);
  ctx.font = '18px monospace';
  ctx.fillText(value, x + 20, y + 32);
}

/**
 * パワーアップアイコン描画用のヘルパー関数
 */
function drawPowerupIcon(ctx, x, y, w, h, iconType, isActive) {
  ctx.fillStyle = isActive ? '#90ee90' : '#444';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = isActive ? '#fff' : '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(iconType, x + w / 2, y + h / 2);
}

/**
 * アイテム描画用のヘルパー（マップ上のアイテム）
 */
function drawMapItem(ctx, item) {
  if (!item || typeof item.x !== 'number' || typeof item.y !== 'number') return;
  
  const px = item.x * TILE;
  const py = item.y * TILE + UI_TOP_HEIGHT;
  const centerX = px + TILE * 0.5;
  const centerY = py + TILE * 0.5;
  
  ctx.save();
  
  if (item.type === 'maxBalls') {
    ctx.fillStyle = '#ff9999';
    ctx.beginPath();
    ctx.arc(centerX, centerY, TILE * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+B', centerX, centerY);
  } else if (item.type === 'range') {
    ctx.fillStyle = '#99ff99';
    ctx.beginPath();
    ctx.moveTo(centerX, py + TILE * 0.3);
    ctx.lineTo(px + TILE * 0.7, py + TILE * 0.7);
    ctx.lineTo(px + TILE * 0.3, py + TILE * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+R', centerX, centerY);
  } else if (item.type === 'speed') {
    ctx.fillStyle = '#9999ff';
    ctx.beginPath();
    ctx.moveTo(px + TILE * 0.3, py + TILE * 0.3);
    ctx.lineTo(px + TILE * 0.7, centerY);
    ctx.lineTo(px + TILE * 0.3, py + TILE * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+S', centerX, centerY);
  }
  
  ctx.restore();
}

/**
 * パワーアップ描画用のヘルパー（マップ上のパワーアップ）
 */
function drawMapPowerup(ctx, powerup) {
  if (!powerup || typeof powerup.x !== 'number' || typeof powerup.y !== 'number') return;
  
  const px = powerup.x * TILE + TILE * 0.5;
  const py = powerup.y * TILE + TILE * 0.5 + UI_TOP_HEIGHT;
  const time = performance.now() / 1000;
  const pulse = 0.8 + 0.2 * Math.sin(time * 3);
  
  ctx.save();
  ctx.globalAlpha = pulse;
  
  // タイプ別の色と表示
  const powerupConfig = {
    SPEED: { color: '#4169e1', symbol: '⚡', label: 'SPEED' },
    MULTI_BALL: { color: '#ff6347', symbol: '⚪', label: 'MULTI' },
    STICKY: { color: '#ffd700', symbol: '🔗', label: 'STICKY' },
    SLOW_MO: { color: '#9370db', symbol: '⏰', label: 'SLOW' },
    EXTRA_LIFE: { color: '#00ff00', symbol: '❤️', label: 'LIFE' }
  };
  
  const config = powerupConfig[powerup.type] || { color: '#fff', symbol: '?', label: 'PWR' };
  
  // 円形の背景
  ctx.fillStyle = config.color;
  ctx.beginPath();
  ctx.arc(px, py, TILE * 0.35, 0, Math.PI * 2);
  ctx.fill();
  
  // 外枠
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // ラベル
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.label, px, py);
  
  ctx.restore();
}

/**
 * プレイヤー情報パネル描画用のヘルパー
 */
function drawPlayerInfoPanel(ctx, player, index) {
  const labels = ['P1', 'P2', 'P3', 'P4'];
  // 上部UI領域に配置（横に4つ並べる）
  const panelWidth = (CANVAS_W - 50) / 4; // 4つのパネルを均等配置
  const x = 10 + index * (panelWidth + 10);
  const y = 10;
  
  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  roundRect(ctx, x, y, panelWidth, 60, 6, true, false);
  
  // プレイヤー名
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${labels[index]}${player.isCPU ? ' (CPU)' : ''}`, x + 8, y + 18);
  
  // ライフとスコア
  ctx.font = '12px sans-serif';
  const lifeText = '❤'.repeat(player.lives || 0);
  ctx.fillText(`${lifeText || '💀'} ${player.score || 0}点`, x + 8, y + 36);
  
  // アイテム
  ctx.font = '11px sans-serif';
  const items = player.items || { maxBalls: 0, range: 0, speed: 0 };
  ctx.fillText(`B:${items.maxBalls} R:${items.range} S:${items.speed}`, x + 8, y + 52);
  
  // アクティブなパワーアップ（アイコンのみ）
  const playerPowerups = (state.activePowerups || []).filter(pu => pu && pu.playerId === player.id);
  if (playerPowerups.length > 0) {
    const icons = {
      [POWERUP_TYPES.SPEED]: '⚡',
      [POWERUP_TYPES.MULTI_BALL]: '●●',
      [POWERUP_TYPES.STICKY]: '⏸',
      [POWERUP_TYPES.SLOW_MO]: '🐌'
    };
    let powerupText = playerPowerups.map(pu => icons[pu.type] || '?').join(' ');
    ctx.fillText(powerupText, x + 90, y + 52);
  }
}

/**
 * マップ描画（壁、箱、タイル）
 */
function renderMap(ctx) {
  if (!state.map || !Array.isArray(state.map)) return;
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE;
      const py = y * TILE + UI_TOP_HEIGHT; // 上部UI領域分オフセット
      
      // タイル背景
      ctx.fillStyle = '#cdefff';
      ctx.fillRect(px, py, TILE, TILE);
      
      if (state.map[y] && state.map[y][x] === 1) {
        // 壁
        ctx.fillStyle = '#3a6b86';
        roundRect(ctx, px + 6, py + 6, TILE - 12, TILE - 12, 6, true, false);
      } else if (state.map[y] && state.map[y][x] === 2) {
        // 破壊可能な箱
        ctx.fillStyle = '#d4a373';
        roundRect(ctx, px + 8, py + 8, TILE - 16, TILE - 16, 4, true, false);
      }
      
      // グリッド線
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }
}

/**
 * 爆発プレビュー描画
 */
function renderExplosionPreviews(ctx) {
  if (!state.previews || !Array.isArray(state.previews)) return;
  
  for (const p of state.previews) {
    if (!p || !p.cells || !Array.isArray(p.cells)) continue;
    const alpha = Math.max(0, ((p.until || 0) - performance.now() / 1000) / 0.6);
    ctx.fillStyle = `rgba(255,200,0,${0.28 * alpha})`;
    for (const c of p.cells) {
      if (c && inBounds(c.x, c.y)) {
        ctx.fillRect((c.x || 0) * TILE + 6, (c.y || 0) * TILE + 6 + UI_TOP_HEIGHT, TILE - 12, TILE - 12);
      }
    }
  }
}

/**
 * ボール描画（導火線バー付き）
 */
function renderBalls(ctx) {
  if (!state.balls || !Array.isArray(state.balls)) return;
  
  for (const k of state.balls) {
    if (!k || !Number.isFinite(k.fx) || !Number.isFinite(k.fy)) continue;
    const px = k.fx * TILE;
    const py = k.fy * TILE + UI_TOP_HEIGHT;
    
    // ボール本体
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(px, py, TILE * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('●', px, py);
    
    // 導火線バー
    const elapsed = performance.now() / 1000 - (k.placedAt || 0);
    const rem = Math.max(0, (k.fuse || 0) - elapsed);
    const barW = TILE * 0.9 * (rem / (k.fuse || 1));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px - TILE * 0.45, py + TILE * 0.25, barW, 4);
  }
}

/**
 * 爆発エフェクト描画
 */
function renderExplosions(ctx) {
  if (!state.explosions || !Array.isArray(state.explosions)) return;
  
  for (const e of state.explosions) {
    if (!e) continue;
    const alpha = Math.max(0, (e.life || 0) / 0.45);
    ctx.fillStyle = `rgba(255,120,0,${0.7 * alpha})`;
    ctx.fillRect((e.x || 0) * TILE + 6, (e.y || 0) * TILE + 6 + UI_TOP_HEIGHT, TILE - 12, TILE - 12);
  }
}

/**
 * プレイヤー描画（移動補間あり）
 */
function renderPlayers(ctx) {
  if (!state.players || !Array.isArray(state.players)) return;
  
  const labels = ['A', 'B', 'C', 'D'];
  
  for (const p of state.players) {
    if (!p) continue;
    
    // 移動補間計算
    const targetX = p.moving && p.pendingTarget ? (p.pendingTarget.x || 0) : (p.x || 0);
    const targetY = p.moving && p.pendingTarget ? (p.pendingTarget.y || 0) : (p.y || 0);
    const progress = p.moving && p.pendingTarget ? (p.moveProgress || 0) : 0;
    const cx = ((p.x || 0) + (targetX - (p.x || 0)) * progress + 0.5) * TILE;
    const cy = ((p.y || 0) + (targetY - (p.y || 0)) * progress + 0.5) * TILE + UI_TOP_HEIGHT;
    
    // 無敵時間中は点滅
    const isInvincible = (p.invincibilityTime || 0) > 0;
    const shouldBlink = isInvincible && (Math.floor((p.invincibilityTime || 0) / INVINCIBILITY_BLINK_INTERVAL) % 2 === 0);

    if (p.alive && !shouldBlink) {
      // パワーアップ効果によるオーラ
      if (hasPowerup(p.id, POWERUP_TYPES.SPEED)) {
        ctx.fillStyle = 'rgba(0,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (hasPowerup(p.id, POWERUP_TYPES.SLOW_MO)) {
        ctx.fillStyle = 'rgba(0,255,0,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // プレイヤー本体
      ctx.fillStyle = p.color || '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.28, 0, Math.PI * 2);
      ctx.fill();
      
      // ラベル
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[p.id - 1] || p.id, cx, cy);
    } else if (!p.alive) {
      // 死亡時は薄く表示
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 18, 8, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('X', cx - 6, cy + 6);
    }
  }
}

/**
 * 描画処理: 全ゲーム要素をCanvasに描画
 * 描画順:
 * 1. 背景をクリア
 * 2. マップ(壁・箱・タイル)
 * 3. 爆発プレビュー(点滅エフェクト)
 * 4. ボール(導火線バー付き)
 * 5. 爆発エフェクト
 * 6. アイテム
 * 7. プレイヤー(移動補間あり)
 * 8. UI表示(アイテム数、生死状態)
 * 9. ゲーム中チャット表示
 */
export function render(ctx) {
  if (!ctx || !state) return;
  
  // 画面をクリア
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // マップの描画(タイル、壁、箱)
  if (!state.map || !Array.isArray(state.map)) return;
  renderMap(ctx);

  // 爆発プレビューの描画(黄色い点滅エフェクト)
  renderExplosionPreviews(ctx);

  // ボールの描画(導火線バー付き)
  renderBalls(ctx);

  // 爆発エフェクトの描画
  renderExplosions(ctx);

  // アイテムの描画
  if (state.items && Array.isArray(state.items)) {
    for (const item of state.items) {
      drawMapItem(ctx, item);
    }
  }

  // パワーアップの描画
  if (state.powerups && Array.isArray(state.powerups)) {
    for (const powerup of state.powerups) {
      drawMapPowerup(ctx, powerup);
    }
  }

  // プレイヤーの描画(移動補間あり)
  renderPlayers(ctx);

  // パーティクル描画
  renderParticles(ctx);

  // UI表示
  renderUI(ctx);
  
  // ゲーム中チャット表示（下部3行）
  renderInGameChat(ctx);
  
  // チャット入力モード表示
  if (chatInputMode) {
    renderChatInputMode(ctx);
  }
}

/**
 * ゲーム中チャット表示（最新3行）
 */
function renderInGameChat(ctx) {
  // チャットマネージャーが初期化されていない場合は表示しない
  if (!window._magicballChatManager) return;
  
  const chatManager = window._magicballChatManager;
  const recentMessages = chatManager.getRecentMessages(CHAT_MESSAGE_DISPLAY_COUNT);
  
  if (recentMessages.length === 0) return;
  
  const startY = GAME_FIELD_H + UI_TOP_HEIGHT + 10; // 下部UI領域の開始位置
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle'; // テキストのベースラインを中央に設定
  
  recentMessages.forEach((msg, index) => {
    const y = startY + (index * 24);
    const isBlocked = msg.message_text === '禁止ワードが含まれます';
    const isSystem = msg.is_system == 1;
    
    // 背景（22ピクセルの高さ）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(10, y, CANVAS_W - 20, 22);
    
    // テキスト（背景の中央に配置）
    const textY = y + 11; // 背景の中央（22pxの半分）
    if (isSystem) {
      ctx.fillStyle = '#90caf9';
      ctx.fillText(msg.message_text, 16, textY);
    } else if (isBlocked) {
      ctx.fillStyle = '#ff8a80';
      ctx.fillText(`${msg.display_name}: ${msg.message_text}`, 16, textY);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${msg.display_name}: ${msg.message_text}`, 16, textY);
    }
  });
  
  ctx.textAlign = 'center'; // リセット
  ctx.textBaseline = 'alphabetic'; // リセット
}

/**
 * チャット入力モード表示
 */
function renderChatInputMode(ctx) {
  const y = CANVAS_H - 40; // 下部UI領域の最下部
  
  // 背景
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(10, y - 30, CANVAS_W - 20, 36);
  
  // 枠線
  ctx.strokeStyle = '#2196f3';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, y - 30, CANVAS_W - 20, 36);
  
  // テキスト
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  const displayText = chatInputText.length > 0 ? chatInputText : 'メッセージを入力...';
  const textColor = chatInputText.length > 0 ? '#ffffff' : '#aaaaaa';
  ctx.fillStyle = textColor;
  ctx.fillText(displayText + '|', 18, y - 8);
  
  // 文字数
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = chatInputText.length > 90 ? '#ff8a80' : '#aaaaaa';
  ctx.fillText(`${chatInputText.length}/100`, CANVAS_W - 18, y - 8);
  
  ctx.textAlign = 'center'; // リセット
  ctx.lineWidth = 1; // リセット
}

/**
 * 角丸矩形の描画ヘルパー
 */
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * 星型の描画ヘルパー
 */
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

/**
 * UI表示
 */
function renderUI(ctx) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // プレイヤー情報表示
  if (state.players && Array.isArray(state.players)) {
    state.players.forEach((p, i) => {
      if (p) drawPlayerInfoPanel(ctx, p, i);
    });
  }
  
  // ゲーム時間とコンボ表示
  if (state.gameMode === 'playing') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, CANVAS_W / 2 - 100, CANVAS_H - 50, 200, 40, 8, true, false);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    const minutes = Math.floor(state.gameTime / 60);
    const seconds = Math.floor(state.gameTime % 60);
    ctx.fillText(`⏱ ${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_W / 2, CANVAS_H - 35);
    
    if (state.comboCount > 0) {
      ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`COMBO x${state.comboCount}`, CANVAS_W / 2, CANVAS_H - 18);
    }
  }
  
  // ゲームモード別のオーバーレイ
  if (state.gameMode === 'start') {
    renderStartScreen(ctx);
  } else if (state.gameMode === 'charSelect') {
    renderCharSelectScreen(ctx);
  } else if (state.gameMode === 'roomSelect') {
    renderRoomSelectScreen(ctx);
  } else if (state.gameMode === 'waiting') {
    renderWaitingRoomScreen(ctx);
  } else if (state.gameMode === 'countdown') {
    renderCountdownScreen(ctx);
  } else if (state.gameMode === 'paused') {
    renderPausedScreen(ctx);
  } else if (state.gameMode === 'gameover' || state.gameMode === 'clear') {
    renderGameOverScreen(ctx);
  }
}

/**
 * スタート画面
 */
function renderStartScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('MagicBall', CANVAS_W / 2, CANVAS_H / 2 - 100);
  
  ctx.font = '24px sans-serif';
  ctx.fillText('MagicBall PvP Battle Game', CANVAS_W / 2, CANVAS_H / 2 - 50);
  
  ctx.font = '20px sans-serif';
  ctx.fillText('オンライン対戦で始めるにはログインボタンをクリック', CANVAS_W / 2, CANVAS_H / 2 + 20);
  
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('操作: WASD / 矢印キー', CANVAS_W / 2, CANVAS_H / 2 + 60);
  ctx.fillText('ボール設置: スペース / F', CANVAS_W / 2, CANVAS_H / 2 + 85);
  ctx.fillText('ポーズ: ESC', CANVAS_W / 2, CANVAS_H / 2 + 110);
}

/**
 * キャラクター選択画面
 */
function renderCharSelectScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('ボールタイプ選択', CANVAS_W / 2, 80);
  
  // 3種類のボールタイプを横並びで表示
  const ballTypes = [
    { id: 'kuro', name: 'クロ', color: '#333', desc: 'バランス型' },
    { id: 'shiro', name: 'シロ', color: '#eee', desc: 'スピード型' },
    { id: 'kiiro', name: 'キイロ', color: '#fd3', desc: '連射型' }
  ];
  
  const cardWidth = 180;
  const cardHeight = 250;
  const startX = CANVAS_W / 2 - (cardWidth * 1.5 + 40);
  const cardY = 150;
  
  ballTypes.forEach((ball, idx) => {
    const cardX = startX + idx * (cardWidth + 40);
    const isSelected = state.selectedBallType === ball.id;
    
    // カード背景
    ctx.fillStyle = isSelected ? 'rgba(100,200,255,0.3)' : 'rgba(50,50,50,0.5)';
    ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
    
    // 枠線
    ctx.strokeStyle = isSelected ? '#6cf' : '#666';
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);
    
    // ボールプレビュー（大きな円）
    ctx.fillStyle = ball.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cardX + cardWidth / 2, cardY + 70, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // ボール名
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(ball.name, cardX + cardWidth / 2, cardY + 140);
    
    // タイプ説明
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(ball.desc, cardX + cardWidth / 2, cardY + 165);
    
    // ステータス表示
    const stats = BALL_TYPES[ball.id];
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ccc';
    ctx.textAlign = 'left';
    ctx.fillText(`速度: ${(stats.speed * 100).toFixed(0)}%`, cardX + 15, cardY + 195);
    ctx.fillText(`間隔: ${(stats.interval * 100).toFixed(0)}%`, cardX + 15, cardY + 215);
    ctx.fillText(`導火線: ${(stats.fuse * 100).toFixed(0)}%`, cardX + 15, cardY + 235);
    ctx.textAlign = 'center';
  });
  
  // 決定ボタンのヒント
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('クリックして選択 → 決定ボタンで次へ', CANVAS_W / 2, cardY + cardHeight + 50);
}

/**
 * ルーム選択画面
 */
function renderRoomSelectScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('ルーム選択', CANVAS_W / 2, 60);
  
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('参加するルームを選ぶか、新規ルームを作成してください', CANVAS_W / 2, 100);
  
  // ルーム一覧表示エリア（実際のルーム情報はJavaScriptで動的に生成）
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('（ルーム一覧はHTMLで表示）', CANVAS_W / 2, CANVAS_H / 2);
}

/**
 * 待機ルーム画面
 */
function renderWaitingRoomScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('待機中...', CANVAS_W / 2, 80);
  
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText('他のプレイヤーを待っています', CANVAS_W / 2, 120);
  
  // 参加プレイヤー表示エリア（実際の情報はHTMLで表示）
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText('（参加プレイヤー一覧はHTMLで表示）', CANVAS_W / 2, CANVAS_H / 2);
  
  ctx.font = '20px sans-serif';
  ctx.fillText('全員が準備完了したらゲーム開始', CANVAS_W / 2, CANVAS_H - 80);
}

/**
 * カウントダウン画面
 */
function renderCountdownScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  
  if (state.countdown > 0) {
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(state.countdown, CANVAS_W / 2, CANVAS_H / 2 + 40);
  } else {
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText('START!', CANVAS_W / 2, CANVAS_H / 2 + 20);
  }
}


/**
 * ポーズ画面
 */
function renderPausedScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('一時停止', CANVAS_W / 2, CANVAS_H / 2);
  
  ctx.font = '24px sans-serif';
  ctx.fillText('ESCで再開', CANVAS_W / 2, CANVAS_H / 2 + 60);
}

/**
 * ゲームオーバー/クリア画面
 */
function renderGameOverScreen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  
  if (state.gameMode === 'clear') {
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('ゲームクリア!', CANVAS_W / 2, CANVAS_H / 2 - 80);
  } else {
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('ゲームオーバー', CANVAS_W / 2, CANVAS_H / 2 - 80);
  }
  
  // 勝者表示
  const alivePlayers = state.players.filter(p => p.alive);
  if (alivePlayers.length === 1) {
    ctx.font = '32px sans-serif';
    ctx.fillStyle = alivePlayers[0].color;
    const labels = ['P1', 'P2', 'P3', 'P4'];
    ctx.fillText(`${labels[alivePlayers[0].id - 1]} の勝利!`, CANVAS_W / 2, CANVAS_H / 2 - 20);
  }
  
  // スコア表示
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  state.players.forEach((p, i) => {
    const labels = ['P1', 'P2', 'P3', 'P4'];
    ctx.fillText(`${labels[i]}: ${p.score}点`, CANVAS_W / 2, CANVAS_H / 2 + 20 + i * 30);
  });
  
  // レート変動表示（オンライン対戦時）
  if (typeof window._magicballRateChanges !== 'undefined' && window._magicballRateChanges) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffd700';
    let yOffset = CANVAS_H / 2 + 20 + state.players.length * 30 + 20;
    
    for (const [playerId, rateChange] of Object.entries(window._magicballRateChanges)) {
      const change = rateChange.rate_change;
      const changeText = change >= 0 ? `+${change}` : `${change}`;
      const color = change >= 0 ? '#4ade80' : '#ef4444';
      ctx.fillStyle = color;
      ctx.fillText(`P${playerId} レート: ${changeText} (${rateChange.rate_after})`, CANVAS_W / 2, yOffset);
      yOffset += 25;
    }
  }
  
  // 操作説明
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#aaa';
  
  // オンライン対戦かどうかで表示を変える
  const isOnline = typeof window._magicballSession !== 'undefined' && 
                   window._magicballSession.isLoggedIn && 
                   window._magicballSession.isLoggedIn();
  
  if (isOnline) {
    ctx.fillText('「ルームに戻る」ボタンでもう一度対戦できます', CANVAS_W / 2, CANVAS_H - 60);
  } else {
    ctx.fillText('リスタートボタンをクリックして再開', CANVAS_W / 2, CANVAS_H - 60);
  }
}

