/**
 * AI制御ロジック
 */

import {
  AI_NORMAL_INTERVAL_MIN,
  AI_NORMAL_INTERVAL_MAX,
  AI_DANGER_INTERVAL,
  AI_FIRE_CHANCE,
  AI_SNIPE_CHANCE,
  AI_ATTACK_MODE_SNIPE_CHANCE,
  AI_ITEMS_THRESHOLD,
  AI_BREAK_BLOCK_CHANCE,
  AI_IDLE_FIRE_TIMEOUT,
  DEFAULT_EXPLOSION_RANGE,
  COLS,
  ROWS
} from './constants.js';
import { state } from './state.js';
import { inBounds, cellAt, ballExists } from './utils.js';
import { tryStartMove } from './player.js';

/**
 * BFSでプレイヤー間の接続性を判定
 * @param {Object} p1 - プレイヤー1
 * @param {Object} p2 - プレイヤー2
 * @returns {boolean} - 通路でつながっているか
 */
function arePlayersConnected(p1, p2) {
  const startX = Math.floor(p1.x + 0.0001);
  const startY = Math.floor(p1.y + 0.0001);
  const goalX = Math.floor(p2.x + 0.0001);
  const goalY = Math.floor(p2.y + 0.0001);

  if (startX === goalX && startY === goalY) return true;

  const visited = new Set();
  const queue = [[startX, startY]];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    if (cx === goalX && cy === goalY) return true;

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const d of dirs) {
      const nx = cx + d.x, ny = cy + d.y;
      const key = `${nx},${ny}`;
      if (!inBounds(nx, ny) || visited.has(key)) continue;
      const cell = cellAt(nx, ny);
      if (cell === 1) continue; // 壁は通行不可
      // 箱(2)とボールは一時的な障害物として無視(破壊可能)
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

/**
 * AIのアイテム確保状態を判定
 * @param {Object} p - AIプレイヤー
 * @returns {boolean} - 十分なアイテムを確保しているか
 */
function hasEnoughItems(p) {
  const totalItems = p.items.range + p.items.maxBalls + p.items.speed;
  return totalItems >= AI_ITEMS_THRESHOLD;
}

/**
 * マップ上のブロック数をカウント
 * @returns {number} - 破壊可能なブロック(箱)の数
 */
function countBlocks() {
  let count = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (cellAt(x, y) === 2) count++;
    }
  }
  return count;
}

/**
 * 指定セルの危険度を計算（値が小さいほど危険）
 * @param {number} x - セルX座標
 * @param {number} y - セルY座標
 * @param {Set} danger - 危険エリア
 * @param {string} playerId - プレイヤーID（自分のボールを特に危険視）
 * @returns {number} - 危険度（ボール/爆発からの最短距離、危険なら-1）
 */
function calculateDangerScore(x, y, danger, playerId) {
  if (danger.has(`${x},${y}`)) return -1; // 危険エリア
  
  // 最も近いボールまたは爆発からの距離を計算
  let minDist = Infinity;
  
  // ボールからの距離（自分のボールは特に危険）
  for (const b of state.balls) {
    const bx = Math.floor(b.fx + 0.0001);
    const by = Math.floor(b.fy + 0.0001);
    let dist = Math.abs(x - bx) + Math.abs(y - by);
    // 自分のボールは距離を短く評価（より危険視）
    if (b.owner === playerId) dist = Math.max(0, dist - 2);
    if (dist < minDist) minDist = dist;
  }
  
  // 爆発からの距離（最も危険）
  for (const e of state.explosions) {
    const dist = Math.abs(x - e.x) + Math.abs(y - e.y);
    if (dist < minDist) minDist = dist * 0.5; // 爆発は特に危険
  }
  
  // プレビューからの距離（もうすぐ爆発）
  for (const p of state.previews) {
    const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (dist < minDist) minDist = dist * 0.7; // プレビューも危険
  }
  
  return minDist; // 距離が遠いほど安全
}

/**
 * BFSで広域的に安全な場所を探索
 * @param {number} cx - 現在位置X
 * @param {number} cy - 現在位置Y
 * @param {Set} danger - 危険エリア
 * @param {number} maxDepth - 最大探索深度
 * @returns {Array} - 安全な場所へのパス [{x, y, dist}]
 */
function findSafeZonesBFS(cx, cy, danger, maxDepth = 5) {
  const passable = (nx, ny) => inBounds(nx, ny) && cellAt(nx, ny) === 0 && !ballExists(nx, ny);
  const visited = new Set();
  const queue = [[cx, cy, 0, []]];
  visited.add(`${cx},${cy}`);
  const safeZones = [];

  while (queue.length > 0) {
    const [x, y, dist, path] = queue.shift();
    
    // 安全な場所を発見
    if (!danger.has(`${x},${y}`) && dist > 0) {
      safeZones.push({ x, y, dist, path });
    }

    // 最大深度に達したら探索終了
    if (dist >= maxDepth) continue;

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const d of dirs) {
      const nx = x + d.x, ny = y + d.y;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && passable(nx, ny)) {
        visited.add(key);
        queue.push([nx, ny, dist + 1, [...path, d]]);
      }
    }
  }

  return safeZones;
}

/**
 * 現在位置から脱出可能な方向の数をカウント
 * @param {number} cx - 現在位置X
 * @param {number} cy - 現在位置Y
 * @returns {number} - 脱出可能な方向数
 */
function countEscapeRoutes(cx, cy) {
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const passable = (nx, ny) => inBounds(nx, ny) && cellAt(nx, ny) === 0 && !ballExists(nx, ny);
  let count = 0;
  for (const d of dirs) {
    const nx = cx + d.x, ny = cy + d.y;
    if (passable(nx, ny)) count++;
  }
  return count;
}

/**
 * ボール発射後に安全な逃げ道があるかチェック
 * @param {number} cx - 現在位置X
 * @param {number} cy - 現在位置Y
 * @param {Object} player - プレイヤー
 * @param {Set} currentDanger - 現在の危険エリア
 * @returns {boolean} - 安全な逃げ道があるか
 */
function hasEscapeRoute(cx, cy, player, currentDanger) {
  // ボール配置後の危険範囲をシミュレート
  const newBallDanger = simulateBallDanger(cx, cy, player);
  const combinedDanger = new Set([...currentDanger, ...newBallDanger]);

  // BFSで安全地帯を探索（最大5歩先まで）
  const safeZones = findSafeZonesBFS(cx, cy, combinedDanger, 5);
  
  // 安全地帯が2つ以上あれば安全（選択肢がある）
  if (safeZones.length >= 2) return true;
  
  // 安全地帯が1つでも、そこから更に脱出可能なら安全
  if (safeZones.length === 1) {
    const zone = safeZones[0];
    const escapeRoutes = countEscapeRoutes(zone.x, zone.y);
    return escapeRoutes >= 2; // 2方向以上に逃げられる
  }

  return false; // 逃げ道なし
}

/**
 * 指定位置にボールを配置した場合の危険範囲をシミュレート
 * @param {number} x - ボール配置位置X
 * @param {number} y - ボール配置位置Y
 * @param {Object} owner - ボール所有者
 * @returns {Set} - 危険セルのSet
 */
function simulateBallDanger(x, y, owner) {
  const danger = new Set();
  const cx = Math.floor(x + 0.0001);
  const cy = Math.floor(y + 0.0001);
  danger.add(`${cx},${cy}`);

  const maxRange = DEFAULT_EXPLOSION_RANGE + (owner ? owner.items.range : 0);
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  for (const d of dirs) {
    for (let r = 1; r <= maxRange; r++) {
      const nx = cx + d.x * r, ny = cy + d.y * r;
      if (!inBounds(nx, ny)) break;
      if (cellAt(nx, ny) === 1) break;
      danger.add(`${nx},${ny}`);
      if (cellAt(nx, ny) === 2) break;
    }
  }
  return danger;
}

/**
 * 時間ベースの危険度マップを計算
 * 危険度が高いほど数値が大きい（0 = 安全、1000+ = 即死）
 * 
 * 危険度の基準:
 * - 爆発中: 1000（即死）
 * - プレビュー中: 500-800（爆発まで近い）
 * - ボール: 100-400（残り時間による）
 * - 通行不可: Infinity
 * 
 * @returns {Map} - キー: "x,y", 値: 危険度スコア
 */
export function calculateDangerMap() {
  const now = performance.now() / 1000;
  const dangerMap = new Map();
  
  // 全セルを初期化（通行可能=0、壁/箱=Infinity）
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const key = `${x},${y}`;
      const cell = cellAt(x, y);
      if (cell === 1 || cell === 2) {
        dangerMap.set(key, Infinity); // 壁と箱は通行不可
      } else {
        dangerMap.set(key, 0); // 通行可能（ボールがある場所は後で危険度を設定）
      }
    }
  }
  
  // 各ボールについて爆発範囲の危険度を計算
  for (const b of state.balls) {
    const cx = Math.floor(b.fx + 0.0001);
    const cy = Math.floor(b.fy + 0.0001);
    const elapsed = now - b.placedAt;
    const timeToExplosion = b.fuse - elapsed;
    
    // 残り時間に基づく危険度（0.6秒のプレビュー時間を含む）
    let baseDanger;
    if (timeToExplosion <= 0.6) {
      baseDanger = 800; // プレビュー中（もうすぐ爆発）
    } else if (timeToExplosion <= 1.5) {
      baseDanger = 400; // 危険（1.5秒以内に爆発）
    } else if (timeToExplosion <= 3.0) {
      baseDanger = 200; // 中程度
    } else {
      baseDanger = 100; // まだ時間がある
    }
    
    // 所有者のアイテム効果を考慮
    const owner = state.players.find(p => p.id === b.owner);
    const maxRange = DEFAULT_EXPLOSION_RANGE + (owner ? owner.items.range : 0);
    
    // 爆発範囲内のセルに危険度を設定
    const updateDanger = (x, y, danger) => {
      const key = `${x},${y}`;
      const current = dangerMap.get(key) || 0;
      if (current !== Infinity) {
        dangerMap.set(key, Math.max(current, danger));
      }
    };
    
    updateDanger(cx, cy, baseDanger);
    
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const d of dirs) {
      for (let r = 1; r <= maxRange; r++) {
        const nx = cx + d.x * r, ny = cy + d.y * r;
        if (!inBounds(nx, ny)) break;
        if (cellAt(nx, ny) === 1) break;
        updateDanger(nx, ny, baseDanger);
        if (cellAt(nx, ny) === 2) break;
      }
    }
  }
  
  // 爆発中のセル（最高危険度）
  for (const e of state.explosions) {
    const key = `${e.x},${e.y}`;
    dangerMap.set(key, 1000);
  }
  
  // プレビュー中のセル（高危険度）
  for (const preview of state.previews) {
    const timeToExplosion = preview.until - now;
    const previewDanger = Math.max(500, 800 - timeToExplosion * 500);
    
    for (const cell of preview.cells) {
      const key = `${cell.x},${cell.y}`;
      const current = dangerMap.get(key) || 0;
      if (current !== Infinity) {
        dangerMap.set(key, Math.max(current, previewDanger));
      }
    }
  }
  
  return dangerMap;
}

/**
 * 旧関数との互換性のため（Set版）
 * 危険度 > 0 のセルを返す
 */
export function dangerCellsFromBalls() {
  const dangerMap = calculateDangerMap();
  const danger = new Set();
  
  for (const [key, score] of dangerMap.entries()) {
    if (score > 0 && score !== Infinity) {
      danger.add(key);
    }
  }
  
  return danger;
}

/**
 * AIルーチン(P2用)
 * 行動原理:
 * 1. 危険判定: 現在位置が爆発範囲または爆発中のタイルかどうか
 * 2. 行動タイミング:
 *    - 危険な位置にいる場合: タイマー無視して即座に行動(緊急回避)
 *    - 安全な場合: 0.4-1.6秒のランダム間隔で行動
 * 3. 移動先選択:
 *    - 安全な移動先(危険エリア外)を優先
 *    - 安全な場所がなければ、通行可能な場所を選択(フォールバック)
 * 4. 攻撃判定:
 *    - 安全な位置にいるときのみボールを発射
 *    - 通常行動25%の確率で発射
 *    - P1と同じ縦または横列にいる場合40%の確率で狙い撃ち
 * 
 * @param {Object} p - AIプレイヤー
 * @param {number} dt - 経過時間
 * @returns {Object|null} - アクション({player, action: 'fire'}) または null
 */
/**
 * 新しいAI制御ロジック - 時間ベースの危険度計算による統一的な行動決定
 * 
 * 設計方針:
 * 1. 毎フレーム危険度マップを計算（時間ベース）
 * 2. 現在位置より危険度が低い場所へ移動
 * 3. 移動中は基本的に継続（振動防止）
 * 4. justFiredフラグ廃止 - 統一的な危険度評価で処理
 */
export function runAI(p, dt) {
  if (!p.alive) return null;

  const now = performance.now() / 1000;
  const cx = Math.floor(p.x + 0.0001);
  const cy = Math.floor(p.y + 0.0001);
  
  // タイマー更新
  p._ai.timer -= dt;
  
  // 危険度マップを計算
  const dangerMap = calculateDangerMap();
  const currentDanger = dangerMap.get(`${cx},${cy}`) || 0;
  
  // === 移動中の処理 ===
  if (p.moving) {
    // 移動中は判定をスキップして移動を完了させる
    // 移動完了後、次のフレームで新しい判定を行う
    return null;
  }

  // === 行動判定 ===
  // 危険な場合（100以上）または高危険度（500以上）なら即座に行動
  // タイマーが0以下の場合も行動
  const shouldAct = (p._ai.timer <= 0) || (currentDanger >= 100);
  
  // デバッグ用ログ
  if (currentDanger >= 100 || currentDanger === Infinity) {
    console.log(`[AI Debug] danger=${currentDanger}, pos=(${cx},${cy}), timer=${p._ai.timer.toFixed(3)}, balls=${state.balls.length}, shouldAct=${shouldAct}`);
  }
  
  if (!shouldAct) {
    return null;
  }
  
  // === 移動先の評価 ===
  const choices = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  
  let bestMove = null;
  let bestDanger = currentDanger;
  const equalDangerMoves = []; // 同じ危険度の移動先候補
  
  for (const choice of choices) {
    const nx = cx + choice.x;
    const ny = cy + choice.y;
    const key = `${nx},${ny}`;
    const danger = dangerMap.get(key);
    
    // 通行不可はスキップ
    if (danger === undefined || danger === Infinity) continue;
    
    // 現在がInfinity（ボールの上など）の場合は、通行可能な場所へ必ず移動
    if (currentDanger === Infinity) {
      if (danger < bestDanger || bestDanger === Infinity) {
        bestDanger = danger;
        bestMove = choice;
        equalDangerMoves.length = 0;
        equalDangerMoves.push(choice);
      } else if (danger === bestDanger) {
        equalDangerMoves.push(choice);
      }
    } else if (currentDanger >= 100) {
      // 危険な場合: より安全な方向へ、または同等なら記録
      if (danger < bestDanger) {
        bestDanger = danger;
        bestMove = choice;
        equalDangerMoves.length = 0;
        equalDangerMoves.push(choice);
      } else if (danger === bestDanger) {
        // 最初の候補も含めて記録
        if (equalDangerMoves.length === 0) equalDangerMoves.push(bestMove || choice);
        equalDangerMoves.push(choice);
        if (!bestMove) bestMove = choice;
      }
    } else {
      // 安全な場合: 50以上改善される場合のみ（無駄な動きを防ぐ）
      if (danger < bestDanger - 50) {
        bestDanger = danger;
        bestMove = choice;
        equalDangerMoves.length = 0;
        equalDangerMoves.push(choice);
      } else if (danger < bestDanger - 49 && danger >= bestDanger - 50) {
        equalDangerMoves.push(choice);
      }
    }
  }
  
  // 同じ危険度の候補が複数ある場合はランダムに選択
  if (equalDangerMoves.length > 1) {
    bestMove = equalDangerMoves[Math.floor(Math.random() * equalDangerMoves.length)];
  }
  
  // デバッグ: bestMoveの内容を確認
  if ((currentDanger >= 100 || currentDanger === Infinity) && bestMove) {
    console.log(`[AI bestMove] Selected move: (${bestMove.x},${bestMove.y}), currentDanger=${currentDanger}, bestDanger=${bestDanger}`);
  }
  
  // 移動実行（危険回避時のみ、またはInfinityから脱出時）
  if (bestMove && (currentDanger >= 100 || currentDanger === Infinity)) {
    tryStartMove(p, bestMove.x, bestMove.y);
    console.log(`[AI Escape] Moving to (${cx + bestMove.x},${cy + bestMove.y}), danger ${currentDanger} -> ${bestDanger}`);
    // 次の判定タイミング
    if (currentDanger >= 500) {
      p._ai.timer = 0.01; // 高危険時は頻繁にチェック
    } else if (currentDanger >= 200) {
      p._ai.timer = 0.1; // 中危険時
    } else {
      p._ai.timer = 0.5 + Math.random() * 0.5; // 通常時
    }
    return null;
  }
  
  // 移動できない場合のログ
  if (!bestMove && currentDanger >= 100) {
    // 周囲の危険度をログ出力
    const surroundingDangers = choices.map(c => {
      const key = `${cx + c.x},${cy + c.y}`;
      return `${c.x},${c.y}:${dangerMap.get(key)}`;
    }).join(' ');
    console.log(`[AI Stuck] Cannot find escape route! danger=${currentDanger}, pos=(${cx},${cy}), surrounding=[${surroundingDangers}]`);
  }
  
  // アイテムが十分集まっているか判定
  const hasEnoughItems = (p.items.range >= 2 && p.items.speed >= 1) || 
                         (p.items.range >= 1 && p.items.speed >= 2);
  
  // === アイテム収集 ===
  if (currentDanger < 100 && state.items.length > 0) {
    let closestItem = null;
    let closestDist = Infinity;
    
    for (const item of state.items) {
      const itemDanger = dangerMap.get(`${item.x},${item.y}`) || 0;
      if (itemDanger < 200) { // 安全なアイテムのみ
        const dist = Math.abs(item.x - cx) + Math.abs(item.y - cy);
        if (dist < closestDist) {
          closestDist = dist;
          closestItem = item;
        }
      }
    }
    
    if (closestItem) {
      // アイテムに近づく方向を選ぶ
      const currentDist = Math.abs(closestItem.x - cx) + Math.abs(closestItem.y - cy);
      for (const choice of choices) {
        const nx = cx + choice.x;
        const ny = cy + choice.y;
        const danger = dangerMap.get(`${nx},${ny}`);
        
        if (danger !== undefined && danger !== Infinity && danger < 200) {
          const newDist = Math.abs(closestItem.x - nx) + Math.abs(closestItem.y - ny);
          if (newDist < currentDist) {
            console.log(`[AI Item] Moving towards item at (${closestItem.x},${closestItem.y})`);
            tryStartMove(p, choice.x, choice.y);
            p._ai.timer = 0.3;
            return null;
          }
        }
      }
    }
  }
  
  // === ボール発射判定 ===
  // ゲーム開始1秒後から、安全な場所（危険度 < 100）で発射を検討
  const timeSinceStart = now - p._ai.gameStartTime;
  
  if (timeSinceStart > 1.0 && currentDanger < 100) {
    const target = state.players[0];
    const connected = arePlayersConnected(p, target);
    const blocksRemaining = countBlocks();
    
    // 攻撃判定: アイテムが十分集まってからのみプレイヤーを狙う
    const canHitPlayer = target.alive && (target.x === p.x || target.y === p.y);
    
    if (canHitPlayer && hasEnoughItems && Math.random() < AI_SNIPE_CHANCE) {
      // 発射後の脱出可能性をチェック
      let safeEscapeRoutes = 0;
      for (const choice of choices) {
        const nx = cx + choice.x;
        const ny = cy + choice.y;
        const danger = dangerMap.get(`${nx},${ny}`);
        if (danger !== undefined && danger !== Infinity && danger < 200) {
          safeEscapeRoutes++;
        }
      }
      
      // 1方向以上の脱出路があれば発射（条件を緩和）
      if (safeEscapeRoutes >= 1) {
        console.log(`[AI Fire Player] Attacking player, escapeRoutes=${safeEscapeRoutes}`);
        p._ai.timer = 0; // 次のフレームで即座に逃げる
        return { player: p, action: 'fire' };
      }
    }
    
    // ブロック破壊判定（アイテムが少ない時は優先的に破壊）
    const shouldBreakBlocks = !hasEnoughItems || (!connected && blocksRemaining > 0);
    if (shouldBreakBlocks && blocksRemaining > 0 && Math.random() < AI_BREAK_BLOCK_CHANCE) {
      const owner = p;
      const maxRange = DEFAULT_EXPLOSION_RANGE + owner.items.range;
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      
      for (const d of dirs) {
        for (let r = 1; r <= maxRange; r++) {
          const nx = cx + d.x * r, ny = cy + d.y * r;
          if (!inBounds(nx, ny) || cellAt(nx, ny) === 1) break;
          if (cellAt(nx, ny) === 2) {
            // ブロックを発見 - 脱出路チェック
            let safeEscapeRoutes = 0;
            for (const choice of choices) {
              const ex = cx + choice.x;
              const ey = cy + choice.y;
              const danger = dangerMap.get(`${ex},${ey}`);
              if (danger !== undefined && danger !== Infinity && danger < 200) {
                safeEscapeRoutes++;
              }
            }
            
            if (safeEscapeRoutes >= 1) {
              console.log(`[AI Fire Block] Breaking block at (${nx},${ny}), escapeRoutes=${safeEscapeRoutes}`);
              p._ai.timer = 0;
              return { player: p, action: 'fire' };
            }
            break;
          }
        }
      }
    }
    
    // アイドルタイムアウト: 長時間発射していない場合
    const timeSinceLastFire = now - p.lastFire;
    if (timeSinceLastFire > AI_IDLE_FIRE_TIMEOUT && blocksRemaining > 0) {
      let safeEscapeRoutes = 0;
      for (const choice of choices) {
        const ex = cx + choice.x;
        const ey = cy + choice.y;
        const danger = dangerMap.get(`${ex},${ey}`);
        if (danger !== undefined && danger !== Infinity && danger < 200) {
          safeEscapeRoutes++;
        }
      }
      
      if (safeEscapeRoutes >= 1) {
        console.log(`[AI Fire] Firing ball, escapeRoutes=${safeEscapeRoutes}, pos=(${cx},${cy})`);
        p._ai.timer = 0;
        return { player: p, action: 'fire' };
      }
    }
  }
  
  // === 探索移動（安全な場所で目的がない場合）===
  // アイテムが十分集まってからのみプレイヤーに接近
  if (currentDanger < 100 && hasEnoughItems && state.items.length === 0) {
    const target = state.players[0];
    if (target.alive) {
      // プレイヤーに近づく方向を選ぶ
      let bestApproachMove = null;
      let bestApproachDist = Math.abs(target.x - cx) + Math.abs(target.y - cy);
      
      for (const choice of choices) {
        const nx = cx + choice.x;
        const ny = cy + choice.y;
        const danger = dangerMap.get(`${nx},${ny}`);
        
        if (danger !== undefined && danger !== Infinity && danger < 100) {
          const newDist = Math.abs(target.x - nx) + Math.abs(target.y - ny);
          if (newDist < bestApproachDist) {
            bestApproachDist = newDist;
            bestApproachMove = choice;
          }
        }
      }
      
      if (bestApproachMove) {
        tryStartMove(p, bestApproachMove.x, bestApproachMove.y);
        p._ai.timer = 0.4 + Math.random() * 0.4;
        return null;
      }
    }
  }
  
  // タイマーリセット
  p._ai.timer = 0.4 + Math.random() * 0.6;
  
  return null;
}
