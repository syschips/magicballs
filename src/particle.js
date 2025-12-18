/**
 * パーティクルシステム
 */

import { PARTICLE_LIFESPAN, PARTICLE_COUNT_EXPLOSION, PARTICLE_COUNT_POWERUP, UI_TOP_HEIGHT } from './constants.js';
import { state } from './state.js';

/**
 * パーティクルを生成
 * @param {number} x - X座標(ピクセル)
 * @param {number} y - Y座標(ピクセル)
 * @param {string} color - 色
 * @param {number} count - パーティクル数
 * @param {number} speed - 初速
 */
export function createParticles(x, y, color, count = 10, speed = 100) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const velocity = speed * (0.5 + Math.random() * 0.5);
    
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      color,
      life: 0,
      maxLife: PARTICLE_LIFESPAN,
      size: 2 + Math.random() * 3
    });
  }
}

/**
 * 爆発パーティクルを生成
 * @param {number} x - X座標(ピクセル)
 * @param {number} y - Y座標(ピクセル)
 * @param {string} color - 色
 */
export function createExplosionParticles(x, y, color = '#ff6b00') {
  createParticles(x, y, color, PARTICLE_COUNT_EXPLOSION, 150);
}

/**
 * パワーアップ取得パーティクルを生成
 * @param {number} x - X座標(ピクセル)
 * @param {number} y - Y座標(ピクセル)
 * @param {string} color - 色
 */
export function createPowerupParticles(x, y, color = '#ffd700') {
  createParticles(x, y, color, PARTICLE_COUNT_POWERUP, 120);
}

/**
 * パーティクルを更新
 * @param {number} dt - デルタタイム(秒)
 */
export function updateParticles(dt) {
  state.particles = state.particles.filter(p => {
    p.life += dt;
    if (p.life >= p.maxLife) return false;
    
    // 物理演算
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt; // 重力
    p.vx *= 0.98; // 空気抵抗
    
    return true;
  });
}

/**
 * パーティクルを描画
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 */
export function renderParticles(ctx) {
  state.particles.forEach(p => {
    const alpha = 1.0 - (p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    // パーティクルはピクセル座標で生成されるので、y座標をオフセット
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;
}
