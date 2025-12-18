/**
 * ボール関連の処理(発射、移動、爆発)
 */

import {
  EXPLOSION_PREVIEW_DURATION,
  EXPLOSION_WAVE_DELAY,
  EXPLOSION_EFFECT_DURATION,
  ITEM_DROP_CHANCE,
  BALL_COLLISION_EXPLODE_TIME,
  DEFAULT_EXPLOSION_RANGE,
  POWERUP_TYPES,
  TILE,
  UI_TOP_HEIGHT,
  SCORE_BLOCK_DESTROY,
  SCORE_PLAYER_HIT
} from './constants.js';
import { state } from './state.js';
import { inBounds, cellAt, beep, hasPowerup, spawnPowerup, addScore } from './utils.js';
import { createExplosionParticles } from './particle.js';
import { damagePlayer } from './player.js';

/**
 * ボールの発射: プレイヤーの現在位置にボールを配置し、向いている方向へ移動開始
 * 制限事項:
 * - 発射間隔(interval)のクールダウン中は発射不可
 * - 同時配置数の上限(デフォルト3個 + maxBallsアイテム効果)を超えたら発射不可
 * - 死亡中は発射不可
 */
export function placeBall(player) {
  if (!player.alive) return; // 死亡中は何もしない

  const now = performance.now() / 1000;
  // 発射間隔チェック: 前回発射からの経過時間が足りなければ発射できない
  if (now - player.lastFire < player.kuroStats.interval) return;

  // 同時配置数の上限チェック(アイテム効果を加算)
  const maxBallsLimit = 3 + player.items.maxBalls;
  if (state.balls.filter(b => b.owner === player.id).length >= maxBallsLimit) return;

  // ボールの移動方向を決定(プレイヤーの向きを使用、向きが未設定なら下方向)
  let dx = player.dir.x, dy = player.dir.y;
  if (dx === 0 && dy === 0) dy = 1; // デフォルトは下向き
  
  // プレイヤーの所属マスの中心に配置
  const cellX = Math.round(player.x);
  const cellY = Math.round(player.y);
  
  // 粘着性パワーアップの確認
  const hasSticky = hasPowerup(player.id, POWERUP_TYPES.STICKY);
  
  const ball = {
    id: Math.random().toString(36).slice(2, 10),
    fx: cellX + 0.5, fy: cellY + 0.5, // マスの中心に配置
    dir: { x: dx, y: dy },
    speed: hasSticky ? 0 : Math.max(0, Math.min(2, player.kuroStats.speed)),
    fuse: Math.max(2, Math.min(5, player.kuroStats.stage)),
    owner: player.id,
    placedAt: now,
    moving: !hasSticky, 
    stopped: hasSticky
  };
  state.balls.push(ball);
  player.lastFire = now;
  beep(440, 0.05); // 発射音
  
  // マルチボールパワーアップ: 追加のボールを発射
  if (hasPowerup(player.id, POWERUP_TYPES.MULTI_BALL)) {
    // 4方向にボールを追加発射
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, 
      { x: 0, y: 1 }, { x: 0, y: -1 }
    ];
    dirs.forEach(dir => {
      if (dir.x !== dx || dir.y !== dy) { // 元の方向以外
        const extraBall = {
          id: Math.random().toString(36).slice(2, 10),
          fx: cellX + 0.5, fy: cellY + 0.5,
          dir: { x: dir.x, y: dir.y },
          speed: hasSticky ? 0 : Math.max(0, Math.min(2, player.kuroStats.speed)),
          fuse: Math.max(2, Math.min(5, player.kuroStats.stage)),
          owner: player.id,
          placedAt: now,
          moving: !hasSticky,
          stopped: hasSticky
        };
        state.balls.push(extraBall);
      }
    });
  }
}

/**
 * 爆発のプレビューとスケジューリング
 * 手順:
 * 1. 爆発範囲を計算(十字型、所有者のrangeアイテムを加算)
 * 2. プレビュー表示(通常0.3秒、誘爆時は0秒)
 * 3. 中心から外側へ順次爆発(0.15秒間隔で段階的に広がる)
 * 壁や箱で爆風が遮られるため、各方向に対して個別に範囲判定を行う。
 * @param {Object} ball - 爆発するボール
 * @param {boolean} immediate - true=誘爆(即座に爆発)、false=通常(予告あり)
 */
export function schedulePreviewAndExplosion(ball, immediate = false) {
  // ボール座標の検証
  if (!ball || typeof ball.fx !== 'number' || typeof ball.fy !== 'number' || 
      isNaN(ball.fx) || isNaN(ball.fy) || !isFinite(ball.fx) || !isFinite(ball.fy)) {
    console.error('Invalid ball coordinates:', ball);
    return;
  }
  
  const cx = Math.floor(ball.fx);
  const cy = Math.floor(ball.fy);
  
  // 座標が有効か確認
  if (isNaN(cx) || isNaN(cy) || !isFinite(cx) || !isFinite(cy)) {
    console.error('Invalid calculated coordinates:', cx, cy);
    return;
  }
  
  const cells = [{ x: cx, y: cy }]; // 中心セル

  // 所有者のrangeアイテム効果を取得
  const owner = (ball.owner && state.players) ? state.players.find(p => p && p.id === ball.owner) : null;
  const maxRange = DEFAULT_EXPLOSION_RANGE + (owner?.items?.range || 0);

  // 上下左右四方向に爆風を伸ばす
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  for (const d of dirs) {
    for (let r = 1; r <= maxRange; r++) {
      const nx = cx + d.x * r, ny = cy + d.y * r;
      if (!inBounds(nx, ny)) break;    // フィールド外で停止
      if (cellAt(nx, ny) === 1) break;    // 壁で停止
      cells.push({ x: nx, y: ny, r: r });    // rは中心からの距離(時間差爆発用)
      if (cellAt(nx, ny) === 2) break;    // 箱で停止(箱も爆風に含まれる)
    }
  }

  // 予告時間を決定（誘爆時は0、通常時は0.3秒）
  const previewTime = immediate ? 0 : EXPLOSION_PREVIEW_DURATION;

  // プレビューを追加（誘爆時も一瞬だけ登録して即座に削除）
  if (previewTime > 0) {
    state.previews.push({
      cells,
      until: performance.now() / 1000 + previewTime,
      ballId: ball.id,
      origin: { x: cx, y: cy }
    });
  }

  // プレビュー終了後に爆発を実行
  setTimeout(() => {
    triggerExplosionCell(cx, cy, true, ball.owner); // 中心をまず爆発（連鎖可能、owner情報を渡す）

    // 距離別にグルーピングして時間差爆発を実現
    const grouped = {};
    for (const c of cells) {
      if ('r' in c) {
        grouped[c.r] = grouped[c.r] || [];
        grouped[c.r].push(c);
      }
    }
    const delays = Object.keys(grouped).map(k => parseInt(k)).sort((a, b) => a - b);

    // 各距離のセルを0.15秒間隔で順次爆発(中心から外側へ波状に広がる演出)
    delays.forEach((r, idx) => {
      setTimeout(() => {
        for (const cell of grouped[r]) triggerExplosionCell(cell.x, cell.y, true, ball.owner);
      }, EXPLOSION_WAVE_DELAY * 1000 * (idx + 1));
    });

    if (previewTime > 0) {
      state.previews = state.previews.filter(p => p.ballId !== ball.id); // プレビューを削除
    }
    beep(120, 0.12); // 爆発音
  }, previewTime * 1000);
}

/**
 * 爆発セルのトリガー: 指定座標で爆発を発生させる
 * 処理内容:
 * 1. 爆発エフェクトを追加(0.45秒間表示)
 * 2. 箱があれば破壊し、30%の確率でアイテムをドロップ、パワーアップもドロップ
 * 3. その位置にいるプレイヤーにダメージ
 * 4. その位置にあるボールを誘爆(連鎖反応)
 * @param {number} x - 爆発X座標
 * @param {number} y - 爆発Y座標
 * @param {boolean} canChain - 連鎖可能かどうか（trueで誘爆処理を行う）
 * @param {number} ownerId - 爆発を起こしたプレイヤーID
 */
export function triggerExplosionCell(x, y, canChain = false, ownerId = null) {
  // 爆発エフェクトを登録(0.45秒間表示)
  state.explosions.push({ x, y, life: EXPLOSION_EFFECT_DURATION });
  
  // パーティクル生成（UI_TOP_HEIGHTオフセットを追加）
  createExplosionParticles(x * TILE + TILE / 2, y * TILE + TILE / 2 + UI_TOP_HEIGHT);

  // 箱の破壊処理とアイテムドロップ
  if (inBounds(x, y) && state.map && state.map[y] && state.map[y][x] === 2) {
    state.map[y][x] = 0; // 箱を通行可能に変更
    
    // スコア追加（爆発を起こしたプレイヤーに）
    if (ownerId) {
      const owner = state.players.find(p => p.id === ownerId);
      if (owner) {
        addScore(owner, SCORE_BLOCK_DESTROY, true);
      }
    }
    
    // 30%の確率でアイテムをドロップ
    if (Math.random() < ITEM_DROP_CHANCE) {
      const itemTypes = ['maxBalls', 'range', 'speed'];
      const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      state.items.push({ x, y, type });
    }
    
    // パワーアップをドロップ
    const powerup = spawnPowerup(x, y);
    if (powerup) {
      state.powerups.push(powerup);
    }
  }

  // プレイヤーのダメージ判定: 爆発位置にいるプレイヤーにダメージ（四捨五入で所属マス判定）
  for (const p of state.players) {
    if (!p.alive) continue;
    if (Math.round(p.x) === x && Math.round(p.y) === y) {
      damagePlayer(p);
      
      // ダメージを与えたプレイヤーにスコア
      if (ownerId && ownerId !== p.id) {
        const owner = state.players.find(pl => pl.id === ownerId);
        if (owner) {
          addScore(owner, SCORE_PLAYER_HIT, true);
        }
      }
    }
  }

  // 連鎖反応: 爆発位置にあるボールを誘爆させる（切り捨てで所属マス判定）
  if (canChain) {
    for (let i = state.balls.length - 1; i >= 0; i--) {
      const k = state.balls[i];
      const kx = Math.floor(k.fx), ky = Math.floor(k.fy);
      if (kx === x && ky === y) {
        state.balls.splice(i, 1);
        // 既にプレビュー登録済みでなければ即座に誘爆
        if (!state.previews.some(p => p.ballId === k.id)) {
          schedulePreviewAndExplosion(k, true); // immediate=trueで即座に爆発
        }
      }
    }
  }
}

/**
 * ボールの更新処理
 * - 移動中のボールを指定方向に移動させる
 * - 壁や箱に衝突した場合:
 *   - 残り導火線≦2秒なら即座に爆発
 *   - それ以外はその位置で停止
 * - 停止中のボールは進行方向の障害物が消えたら移動を再開
 * - 導火線が尽きたら爆発
 */
export function updateBalls(dt) {
  // スローモーション効果を適用
  if (!state || !state.balls || !Array.isArray(state.balls)) return;
  const effectiveDt = dt * (state.timeScale || 1.0);
  
  const now = performance.now() / 1000;
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const k = state.balls[i];
    if (!k || !Number.isFinite(k.fx) || !Number.isFinite(k.fy)) {
      // 無効なボールを削除
      state.balls.splice(i, 1);
      continue;
    }

    // 停止中のボールは進行方向の障害物が消えていないかチェック
    if (k.stopped) {
      const elapsed = now - k.placedAt;
      const rem = Math.max(0, k.fuse - elapsed);
      
      // 残り時間が2秒以下になったら即座に爆発
      if (rem <= BALL_COLLISION_EXPLODE_TIME) {
        schedulePreviewAndExplosion(k);
        state.balls.splice(i, 1);
        continue;
      }
      
      const nextX = Math.floor(k.fx + k.dir.x);
      const nextY = Math.floor(k.fy + k.dir.y);
      // 進行方向が通行可能になっていれば移動を再開
      if (inBounds(nextX, nextY) && cellAt(nextX, nextY) === 0) {
        k.moving = true;
        k.stopped = false;
      }
    }

    // 移動中かつ停止していないボールを移動
    if (k.moving && !k.stopped) {
      const move = k.speed * effectiveDt;
      const newFx = k.fx + k.dir.x * move;
      const newFy = k.fy + k.dir.y * move;
      const nextX = Math.floor(newFx);
      const nextY = Math.floor(newFy);

      // 移動先が障害物かチェック
      if (!inBounds(nextX, nextY) || cellAt(nextX, nextY) === 1 || cellAt(nextX, nextY) === 2) {
        const elapsed = now - k.placedAt;
        const rem = Math.max(0, k.fuse - elapsed);
        // 残り時間が2秒以下なら即座に爆発
        if (rem <= BALL_COLLISION_EXPLODE_TIME) {
          schedulePreviewAndExplosion(k);
          state.balls.splice(i, 1);
          continue;
        } else {
          // それ以外はその場で停止（位置を変えない）
          k.moving = false; 
          k.stopped = true;
        }
      } else {
        // 通行可能なら移動
        k.fx = newFx;
        k.fy = newFy;
      }
    }

    // 導火線タイマーチェック: 時間切れで爆発
    const elapsedTotal = now - k.placedAt;
    if (elapsedTotal >= k.fuse) {
      schedulePreviewAndExplosion(k);
      state.balls.splice(i, 1);
    }
  }
}

/**
 * 爆発プレビューの更新: 表示時間が過ぎたプレビューを削除
 */
export function updatePreviews() {
  const now = performance.now() / 1000;
  state.previews = state.previews.filter(p => p.until > now);
}

/**
 * 爆発エフェクトの更新: 残り時間を減らし、0になったら削除
 */
export function updateExplosions(dt) {
  for (let i = state.explosions.length - 1; i >= 0; i--) {
    state.explosions[i].life -= dt;
    if (state.explosions[i].life <= 0) state.explosions.splice(i, 1);
  }
}
