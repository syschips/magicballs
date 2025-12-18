/**
 * プレイヤー関連の処理
 */

import { COLS, ROWS, DEFAULT_LIVES, RESPAWN_INVINCIBILITY_TIME, POWERUP_TYPES, PLAYER_SPEED, BALL_TYPES, PLAYER_INDEX, BALL_REMAINING_TIME_TRIGGER, TILE, UI_TOP_HEIGHT } from './constants.js';
import { state } from './state.js';
import { inBounds, cellAt, ballExists, hasPowerup, applyPowerup, addScore } from './utils.js';
import { createPowerupParticles } from './particle.js';

/**
 * プレイヤーオブジェクトの生成
 * @param {number} id - プレイヤーID (1 or 2)
 * @param {number} x - 初期X座標
 * @param {number} y - 初期Y座標
 * @param {string} color - 表示色
 * @param {string} ballType - ボールタイプ ('kuro', 'shiro', 'kiiro')
 * @returns プレイヤーオブジェクト
 */
export function createPlayer(id, x, y, color, ballType = 'kuro') {
  const ballStats = BALL_TYPES[ballType] || BALL_TYPES.kuro;
  
  return {
    id, x, y, color,
    spawnX: x, spawnY: y,   // リスポーン位置
    moving: false,           // 移動中フラグ（AI用）
    pendingTarget: null,     // 移動先座標（AI用）
    moveProgress: 0,         // 移動進捗(0-1)（AI用）
    dir: { x: 0, y: 1 },    // 向いている方向(ボール発射方向)
    speedTilesPerSec: ballStats.playerSpeed || PLAYER_SPEED,    // 移動速度（ボールタイプに応じて変化）
    alive: true,            // 生存状態
    lives: DEFAULT_LIVES, // ライフ数
    score: 0,               // スコア
    invincibilityTime: 0,   // 無敵時間
    ballsLeft: 3,           // 残りボール数（初期値3）
    ballType: ballType,     // ボールタイプ
    kuroStats: { 
      speed: ballStats.speed, 
      interval: ballStats.interval, 
      stage: ballStats.fuse 
    }, // ボール性能
    lastFire: -999,         // 最後にボールを発射した時刻
    isCPU: false,           // CPU制御フラグ
    _ai: { timer: 0, dir: { x: 0, y: 0 }, gameStartTime: performance.now() / 1000 }, // AI用内部状態
    _humanInput: { dx: 0, dy: 0 }, // 人間プレイヤー用入力状態
    items: { maxBalls: 0, range: 0, speed: 0 } // 取得したアイテム数
  };
}

/**
 * キー入力から移動方向を計算
 * 仕様:
 * - 斜め移動なし
 * - 複数キー同時押し時の優先順位: 左 > 右 > 下 > 上
 * @param {Object} mapping - 方向ごとのキーマッピング
 * @returns {Object} {dx, dy} - 移動方向ベクトル
 */
export function computeMoveDirectionFromKeys(mapping) {
  if (mapping.left && state.keys[mapping.left]) return { dx: -1, dy: 0 };
  if (mapping.right && state.keys[mapping.right]) return { dx: 1, dy: 0 };
  if (mapping.down && state.keys[mapping.down]) return { dx: 0, dy: 1 };
  if (mapping.up && state.keys[mapping.up]) return { dx: 0, dy: -1 };
  return { dx: 0, dy: 0 }; // 入力なし
}

/**
 * 移動開始の試行: 指定方向への移動を開始
 * 手順:
 * 1. 現在位置をグリッドにスナップ(ズレ補正)
 * 2. 移動先タイルが通行可能かチェック(壁・箱・ボールがあれば移動不可)
 * 3. OKなら移動状態に設定し、1タイル分の移動をスケジュール
 */
export function tryStartMove(player, dx, dy) {
  if (!player.alive) {
    console.log(`[tryStartMove] Failed: player dead`);
    return;
  }
  if (player.moving) {
    console.log(`[tryStartMove] Failed: already moving (progress=${player.moveProgress})`);
    return;
  }
  if (dx === 0 && dy === 0) {
    console.log(`[tryStartMove] Failed: no direction`);
    return;
  }

  // 現在位置から相対移動（スナップしない）
  const currentX = player.x;
  const currentY = player.y;
  const targetX = currentX + dx;
  const targetY = currentY + dy;

  // 現在の所属マスと移動先の所属マス（四捨五入で判定）
  const currentCellX = Math.round(currentX);
  const currentCellY = Math.round(currentY);
  const targetCellX = Math.round(targetX);
  const targetCellY = Math.round(targetY);

  // 移動先のマスが現在と異なる場合のみチェック
  // （同じマス内での移動は常に許可）
  if (targetCellX !== currentCellX || targetCellY !== currentCellY) {
    // 移動先の通行可能性チェック
    if (!inBounds(targetCellX, targetCellY)) {
      console.log(`[tryStartMove] Failed: out of bounds (${targetCellX},${targetCellY})`);
      return;
    }
    if (cellAt(targetCellX, targetCellY) !== 0) {
      console.log(`[tryStartMove] Failed: blocked by cell=${cellAt(targetCellX, targetCellY)} at (${targetCellX},${targetCellY})`);
      return;
    }
    if (ballExists(targetCellX, targetCellY)) {
      console.log(`[tryStartMove] Failed: ball exists at (${targetCellX},${targetCellY})`);
      return;
    }
  }

  // 移動開始: 現在位置から1タイル分の移動を設定
  player.moving = true;
  player.pendingTarget = { x: targetX, y: targetY };
  player.moveProgress = 0;
  player.dir = { x: dx, y: dy }; // 向きを更新(ボール発射方向に影響)
  console.log(`[tryStartMove] Success: moving from (${currentX},${currentY}) to (${targetX},${targetY})`);
}

/**
 * 移動の中途停止: 現在の補間位置で移動を中断
 * 人間プレイヤー用の機能(キーを離したらその場で止まる)
 * AIは危険回避時にも使用する。
 */
export function stopMoveAtCurrentPosition(player) {
  if (!player.moving || !player.pendingTarget) return;

  // 現在の進捗率を取得
  const t = Math.min(1, Math.max(0, player.moveProgress));
  // 補間位置を計算（グリッドスナップしない）
  player.x = player.x + (player.pendingTarget.x - player.x) * t;
  player.y = player.y + (player.pendingTarget.y - player.y) * t;

  // 移動状態をクリア
  player.moving = false;
  player.pendingTarget = null;
  player.moveProgress = 0;
}

/**
 * プレイヤーの更新処理(入力処理、移動、アイテム取得)
 * 手順:
 * 1. P1/P2の入力を処理(AIのP2はrunAIを呼ぶ)
 * 2. 移動中のプレイヤーの補間移動を進める
 * 3. AIは移動中に移動先が危険になったら中途停止
 * 4. 人間プレイヤーはキー入力がなくなったら中途停止
 * 5. アイテム収集判定
 */
export function updatePlayers(dt, runAI) {
  if (!state || !state.players || state.players.length === 0) {
    console.warn('[updatePlayers] No players exist');
    return null;
  }

  // 各プレイヤーのキーマッピング
  const p1map = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown' };
  const p2map = { left: 'a', right: 'd', up: 'w', down: 's' };

  // 発射アクションを収集
  let fireAction = null;
  let p2Action = null;
  let p3Action = null;
  let p4Action = null;

    // オンラインモードの場合の自分のプレイヤーインデックス検証
    if (state.isOnlineMode && state.myPlayerIndex !== null && state.myPlayerIndex >= 0 && state.myPlayerIndex < state.players.length) {
    // ============================================================
    // オンラインモード: 自分のプレイヤーのみ操作
    // ============================================================
    
    // ホストの場合：全プレイヤーを処理
    if (state.isHost) {
      for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        if (!player || player.isCPU) continue;
        
        if (player.alive) {
          // 自分のプレイヤーはローカル入力
          if (i === state.myPlayerIndex) {
            const d = computeMoveDirectionFromKeys(p1map);
            player._humanInput = { dx: d.dx, dy: d.dy };
            
            if (state.keys[state.keybinds.p1fire]) {
              console.log(`[Host Fire] index=${i}, pos=(${player.x.toFixed(2)},${player.y.toFixed(2)})`);
              state.keys[state.keybinds.p1fire] = false;
              if (i === 0) fireAction = { player, action: 'fire' };
              else if (i === 1) p2Action = { player, action: 'fire' };
            }
          }
          // リモートプレイヤーはhandleRemoteInputで設定された_humanInputを使用（既に設定済み）
          else {
            // _humanInputは既にhandleRemoteInputで設定されている
            // 発射キーもhandleRemoteInputで設定されている
            if (i === 1 && state.keys[state.keybinds.p2fire]) {
              console.log(`[Remote Fire] index=${i}, pos=(${player.x.toFixed(2)},${player.y.toFixed(2)})`);
              state.keys[state.keybinds.p2fire] = false;
              p2Action = { player, action: 'fire' };
            }
          }
        } else {
          player._humanInput = { dx: 0, dy: 0 };
        }
      }
    }
    // クライアントの場合：自分のプレイヤーのみ操作（予測移動用）
    else {
      const myPlayer = state.players[state.myPlayerIndex];
      if (myPlayer && !myPlayer.isCPU) {
        if (myPlayer.alive) {
          // 矢印キーで自分のプレイヤーを操作
          const d = computeMoveDirectionFromKeys(p1map);
          myPlayer._humanInput = { dx: d.dx, dy: d.dy };
          
          if (state.keys[state.keybinds.p1fire]) {
            console.log(`[Client Fire] index=${state.myPlayerIndex}, pos=(${myPlayer.x.toFixed(2)},${myPlayer.y.toFixed(2)})`);
            state.keys[state.keybinds.p1fire] = false;
            fireAction = { player: myPlayer, action: 'fire' };
          }
        } else {
          myPlayer._humanInput = { dx: 0, dy: 0 };
        }
      }
    }
    
    // CPU処理（ホストのみ）
    if (state.isHost) {
      for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        if (player && player.isCPU && player.alive) {
          const cpuAction = runAI(player, dt);
          if (cpuAction && cpuAction.action === 'fire') {
            // CPUの発射処理
            if (i === 0) fireAction = cpuAction;
            else if (i === 1) p2Action = cpuAction;
            else if (i === 2) p3Action = cpuAction;
            else if (i === 3) p4Action = cpuAction;
          }
        }
      }
    }
    
  } else if (state.isOnlineMode && state.isSpectator) {
    // ============================================================
    // 観戦モード: 入力を受け付けない、表示のみ
    // ============================================================
    console.log('[updatePlayers] Spectator mode - no input, no AI execution');
    
    // 観戦者はAIを実行しない（ホストから同期されるのを待つ）
    // すべてのプレイヤー動作はsync.jsでホストから受信
    
  } else {
    // ============================================================
    // オフラインモード: 従来の処理（P1=矢印、P2=WASD）
    // ============================================================
    
    // P1の入力処理(人間プレイヤー - 連続移動)
    const player1 = state.players[0];
    if (player1 && !player1.isCPU) {
      if (player1.alive) {
        const d1 = computeMoveDirectionFromKeys(p1map);
        player1._humanInput = { dx: d1.dx, dy: d1.dy };
        if (state.keys && state.keys[state.keybinds.p1fire]) {
          console.log(`[P1 Fire] input=(${d1.dx},${d1.dy}), pos=(${player1.x.toFixed(2)},${player1.y.toFixed(2)})`);
          state.keys[state.keybinds.p1fire] = false;
          fireAction = { player: player1, action: 'fire' };
        }
      } else {
        // 死亡中は入力をクリア
        player1._humanInput = { dx: 0, dy: 0 };
      }
    }

    // P2の入力処理(CPUまたはキーボード)
    const player2 = state.players[1];
    if (state.players.length > 1 && player2) {
      if (player2.isCPU) {
        p2Action = runAI(player2, dt);
      } else {
        // P2が存在し、かつ生きている場合のみ処理
        if (player2.alive) {
          const d2 = computeMoveDirectionFromKeys(p2map);
          player2._humanInput = { dx: d2.dx, dy: d2.dy };
          if (state.keys && state.keys[state.keybinds.p2fire]) {
            console.log(`[P2 Fire] pos=(${player2.x.toFixed(2)},${player2.y.toFixed(2)}), ballsLeft=${player2.ballsLeft}`);
            state.keys[state.keybinds.p2fire] = false;
            p2Action = { player: player2, action: 'fire' };
          }
        } else {
          // 死亡中は入力をクリア
          player2._humanInput = { dx: 0, dy: 0 };
        }
      }
    }

    // P3とP4のAI処理(CPU専用)
    const player3 = state.players[2];
    const player4 = state.players[3];
    if (state.players.length > 2 && player3 && player3.alive) {
      p3Action = runAI(player3, dt);
    }
    if (state.players.length > 3 && player4 && player4.alive) {
      p4Action = runAI(player4, dt);
    }
  }

  // 全プレイヤーの移動処理とアイテム取得
  for (const p of state.players) {
    if (!p.alive) continue; // 死亡中はスキップ

    // AI用の移動処理（従来通り）
    if (p.isCPU && p.moving && p.pendingTarget) {
      const baseSpeed = Math.max(0.5, p.speedTilesPerSec);
      const speed = baseSpeed * (1 + p.items.speed * 0.2);
      p.moveProgress += dt * speed;

      // 移動完了
      if (p.moveProgress >= 1) {
        console.log(`[Player Move] AI completed move from (${p.x},${p.y}) to (${p.pendingTarget.x},${p.pendingTarget.y})`);
        // AIは整数座標に補正（浮動小数点誤差を防ぐ）
        p.x = Math.round(p.pendingTarget.x);
        p.y = Math.round(p.pendingTarget.y);
        p.moving = false;
        p.pendingTarget = null;
        p.moveProgress = 0;
      }
    }

    // 人間プレイヤー用の連続移動処理
    if (!p.isCPU && p._humanInput) {
      const dx = p._humanInput.dx;
      const dy = p._humanInput.dy;
      
      if (dx === 0 && dy === 0) {
        // キーが離されている：その場で停止（位置はそのまま）
        // 何もしない
      } else {
        // キーが押されている：移動を試みる
        const baseSpeed = Math.max(0.5, p.speedTilesPerSec);
        const speed = baseSpeed * (1 + p.items.speed * 0.2);
        const moveAmount = dt * speed;
        
        // 移動先の座標を計算
        const newX = p.x + dx * moveAmount;
        const newY = p.y + dy * moveAmount;
        
        // 移動先の所属マスを判定
        const targetCellX = Math.round(newX);
        const targetCellY = Math.round(newY);
        
        // 通行可能かチェック(ボールは無視)
        if (inBounds(targetCellX, targetCellY) && 
            cellAt(targetCellX, targetCellY) === 0) {
          // 移動可能:位置を更新
          p.x = newX;
          p.y = newY;
          p.dir = { x: dx, y: dy }; // 向きを更新
        }
        // 移動不可の場合は位置をそのままにする（スナップしない）
      }
    }

    // アイテム収集判定: 所属マス（四捨五入）でアイテムを取得
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      if (Math.round(p.x) === item.x && Math.round(p.y) === item.y) {
        p.items[item.type]++;
        state.items.splice(i, 1);
      }
    }
    
    // パワーアップ収集判定
    collectPowerup(p, Math.round(p.x), Math.round(p.y));

    // ボールとの衝突判定: 残り時間2秒以下のボールを踏むと爆発
    const now = performance.now() / 1000;
    for (const ball of state.balls) {
      const ballCellX = Math.floor(ball.fx);
      const ballCellY = Math.floor(ball.fy);
      const playerCellX = Math.round(p.x);
      const playerCellY = Math.round(p.y);
      
      if (playerCellX === ballCellX && playerCellY === ballCellY) {
        // 配置からの経過時間で残り時間を計算
        const elapsed = now - ball.placedAt;
        const remaining = ball.fuse - elapsed;
        console.log(`[Ball Collision] P${p.id} stepped on ball! remaining=${remaining.toFixed(2)}s, fuse=${ball.fuse}, moving=${ball.moving}`);
        if (remaining <= BALL_REMAINING_TIME_TRIGGER) {
          // 残り時間以下: 即座に爆発トリガー
          console.log(`[Ball Trigger] Triggering explosion!`);
          ball.placedAt = now - ball.fuse; // 導火線を0にして即座に爆発させる
        }
      }
    }
  }

  // すべての発射アクションを配列で返す
  const actions = [];
  if (fireAction) actions.push(fireAction);
  if (p2Action) actions.push(p2Action);
  if (p3Action) actions.push(p3Action);
  if (p4Action) actions.push(p4Action);
  return actions.length > 0 ? actions : null;
}

/**
 * プレイヤーにダメージを与える
 * @param {Object} player - プレイヤーオブジェクト
 */
export function damagePlayer(player) {
  if (!player.alive || player.invincibilityTime > 0) return;
  
  player.lives--;
  if (player.lives > 0) {
    // リスポーン
    respawnPlayer(player);
  } else {
    // ゲームオーバー
    player.alive = false;
  }
}

/**
 * プレイヤーをリスポーン
 * @param {Object} player - プレイヤーオブジェクト
 */
export function respawnPlayer(player) {
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.invincibilityTime = RESPAWN_INVINCIBILITY_TIME;
  player.moving = false;
  player.pendingTarget = null;
  player.moveProgress = 0;
}

/**
 * プレイヤーの無敵時間を更新
 * @param {number} dt - デルタタイム(秒)
 */
export function updatePlayerInvincibility(dt) {
  state.players.forEach(p => {
    if (p.invincibilityTime > 0) {
      p.invincibilityTime -= dt;
      if (p.invincibilityTime < 0) p.invincibilityTime = 0;
    }
  });
}

/**
 * プレイヤーがパワーアップアイテムを取得
 * @param {Object} player - プレイヤーオブジェクト
 * @param {number} x - X座標
 * @param {number} y - Y座標
 */
export function collectPowerup(player, x, y) {
  // パワーアップアイテムの取得判定
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const powerup = state.powerups[i];
    if (Math.round(player.x) === powerup.x && Math.round(player.y) === powerup.y) {
      applyPowerup(player, powerup.type);
      createPowerupParticles(powerup.x * TILE + TILE / 2, powerup.y * TILE + TILE / 2 + UI_TOP_HEIGHT, player.color);
      state.powerups.splice(i, 1);
    }
  }
}

/**
 * プレイヤーの速度を取得（パワーアップ効果込み）
 * @param {Object} player - プレイヤーオブジェクト
 * @returns {number} 速度
 */
export function getPlayerSpeed(player) {
  let speed = player.speedTilesPerSec;
  
  // アイテム効果
  speed += player.items.speed * 0.5;
  
  // パワーアップ効果
  if (hasPowerup(player.id, POWERUP_TYPES.SPEED)) {
    speed *= 1.5;
  }
  
  return speed;
}
