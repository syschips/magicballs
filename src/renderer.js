/**
 * 描画処理
 */

import { COLS, ROWS, TILE, CANVAS_W } from './constants.js';
import { state } from './state.js';
import { inBounds } from './utils.js';

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
 */
export function render(ctx) {
  // 画面をクリア
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // マップの描画(タイル、壁、箱)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE, py = y * TILE;
      ctx.fillStyle = '#cdefff';
      ctx.fillRect(px, py, TILE, TILE); // タイル背景
      if (state.map[y][x] === 1) { // 壁
        ctx.fillStyle = '#3a6b86';
        roundRect(ctx, px + 6, py + 6, TILE - 12, TILE - 12, 6, true, false);
      }
      else if (state.map[y][x] === 2) { // 破壊可能な箱
        ctx.fillStyle = '#d4a373';
        roundRect(ctx, px + 8, py + 8, TILE - 16, TILE - 16, 4, true, false);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.strokeRect(px, py, TILE, TILE); // グリッド線
    }
  }

  // 爆発プレビューの描画(黄色い点滅エフェクト)
  for (const p of state.previews) {
    const alpha = Math.max(0, (p.until - performance.now() / 1000) / 0.6);
    ctx.fillStyle = `rgba(255,200,0,${0.28 * alpha})`;
    for (const c of p.cells) {
      if (inBounds(c.x, c.y)) ctx.fillRect(c.x * TILE + 6, c.y * TILE + 6, TILE - 12, TILE - 12);
    }
  }

  // ボールの描画(導火線バー付き)
  for (const k of state.balls) {
    const px = k.fx * TILE, py = k.fy * TILE;
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
    const elapsed = performance.now() / 1000 - k.placedAt;
    const rem = Math.max(0, k.fuse - elapsed);
    const barW = TILE * 0.9 * (rem / k.fuse);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px - TILE * 0.45, py + TILE * 0.25, barW, 4);
  }

  // 爆発エフェクトの描画
  for (const e of state.explosions) {
    const alpha = Math.max(0, e.life / 0.45);
    ctx.fillStyle = `rgba(255,120,0,${0.7 * alpha})`;
    ctx.fillRect(e.x * TILE + 6, e.y * TILE + 6, TILE - 12, TILE - 12);
  }

  // アイテムの描画
  for (const item of state.items) {
    const px = item.x * TILE, py = item.y * TILE;
    // アイテムタイプ別に異なる形状と色で描画
    if (item.type === 'maxBalls') {
      ctx.fillStyle = '#ff9999';
      ctx.beginPath();
      ctx.arc(px + TILE * 0.5, py + TILE * 0.5, TILE * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+B', px + TILE * 0.5, py + TILE * 0.5);
    } else if (item.type === 'range') {
      ctx.fillStyle = '#99ff99';
      ctx.beginPath();
      ctx.moveTo(px + TILE * 0.5, py + TILE * 0.3);
      ctx.lineTo(px + TILE * 0.7, py + TILE * 0.7);
      ctx.lineTo(px + TILE * 0.3, py + TILE * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+R', px + TILE * 0.5, py + TILE * 0.5);
    } else if (item.type === 'speed') {
      ctx.fillStyle = '#9999ff';
      ctx.beginPath();
      ctx.moveTo(px + TILE * 0.3, py + TILE * 0.3);
      ctx.lineTo(px + TILE * 0.7, py + TILE * 0.5);
      ctx.lineTo(px + TILE * 0.3, py + TILE * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+S', px + TILE * 0.5, py + TILE * 0.5);
    }
  }

  // プレイヤーの描画(移動補間あり)
  for (const p of state.players) {
    const cx = (p.x + (p.moving && p.pendingTarget ? (p.pendingTarget.x - p.x) * p.moveProgress : 0) + 0.5) * TILE;
    const cy = (p.y + (p.moving && p.pendingTarget ? (p.pendingTarget.y - p.y) * p.moveProgress : 0) + 0.5) * TILE;
    if (p.alive) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.id === 1 ? 'A' : 'B', cx, cy);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 18, 8, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('X', cx - 6, cy + 6);
    }
  }

  // アイテムUI表示
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  ctx.font = '14px sans-serif';
  ctx.fillText(`P1: B:${state.players[0].items.maxBalls} R:${state.players[0].items.range} S:${state.players[0].items.speed}`, 10, 10);
  ctx.fillText(`P2: B:${state.players[1].items.maxBalls} R:${state.players[1].items.range} S:${state.players[1].items.speed}`, CANVAS_W - 250, 10);

  // 生死状態表示
  const msgEl = document.getElementById('message');
  if (msgEl) msgEl.textContent = `${state.players[0].alive ? 'P1:生' : 'P1:死'} ・ ${state.players[1].alive ? 'P2:生' : 'P2:死'}`;
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
