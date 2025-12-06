/* MagicBall 18x12 - ゲーム仕様
 - フィールド: 18x12タイル
 - タイルサイズ: 48px (キャンバス 864x576)
 - 斜め移動なし。複数キー同時押し時の優先順位: 左 > 右 > 下 > 上
 - 2プレイヤー、Player2はCPU切替可能
 - ボール: プレイヤーの向いている方向に直進。壁/箱に当たり残り時間<=2秒なら爆発、それ以外は停止
 - ボール性能: 速度(0-2タイル/秒)、発射間隔(0.1-1秒)、導火線(2-5秒)
 - 爆発: 十字型、0.6秒プレビュー後に中心から外側へ順次爆発(0.12秒間隔)
 - 連鎖反応: 爆発範囲内の他のボールも誘爆
 - プレイヤー死亡: 爆発発生時にそのタイルにいた場合
*/

// ゲームフィールドの基本定数
const COLS = 18, ROWS = 12, TILE = 48;
const CANVAS_W = COLS * TILE, CANVAS_H = ROWS * TILE;

// Canvasの初期化
const canvas = document.getElementById('game');
canvas.width = CANVAS_W; canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

// オーディオコンテキスト: ユーザー操作後に初期化(ブラウザのautoplay制限対策)
let audioCtx = null;
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
// 効果音再生: オシレーターでシンプルなビープ音を生成
function beep(freq, time=0.06){ try{ ensureAudio(); const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=0.06; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + time);}catch(e){} }

// ゲーム状態管理用のグローバル変数
let map = [];        // マップ配列: 0=通行可能, 1=壁, 2=破壊可能な箱
let balls = [];      // 配置済みのボール一覧
let items = [];      // フィールド上のアイテム一覧
let previews = [];   // 爆発予告エフェクト一覧
let explosions = []; // 現在爆発中のセル一覧
let players = [];    // プレイヤー情報(P1, P2)
let keys = {};       // 現在押されているキー状態
let keybinds = {p1fire:' ', p2fire:'f'}; // ボール発射キーの設定(カスタマイズ可能)
let lastTime = performance.now(); // フレームタイミング管理用

/**
 * 危険セルの算出: AIが避けるべきタイルを計算
 * - 現在配置されているボールの爆発予測範囲
 * - 既に爆発中のセル
 * を危険エリアとして返す。AIはこれを使って安全な移動先を選択する。
 */
function dangerCellsFromBalls(){
  const danger = new Set(); // 重複排除のためSet使用
  
  // 各ボールについて爆発範囲を計算
  for(const b of balls){
    const cx = Math.floor(b.fx + 0.0001); // 小数点誤差対策で微小値加算
    const cy = Math.floor(b.fy + 0.0001);
    danger.add(`${cx},${cy}`); // ボール自身の位置
    
    // 所有者のアイテム効果を考慮した爆発範囲を算出
    const owner = players.find(p=>p.id===b.owner);
    const maxRange = 6 + (owner ? owner.items.range : 0);
    
    // 上下左右4方向に爆発範囲を伸ばす
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    for(const d of dirs){
      for(let r=1;r<=maxRange;r++){
        const nx = cx + d.x*r, ny = cy + d.y*r;
        if(!inBounds(nx,ny)) break; // フィールド外で停止
        if(cellAt(nx,ny)===1) break; // 壁で停止
        danger.add(`${nx},${ny}`);
        if(cellAt(nx,ny)===2) break; // 箱で停止(箱も破壊されるが爆風はここまで)
      }
    }
  }
  
  // 既に爆発中のセルも危険エリアに追加(AIが爆風に突っ込まないように)
  for(const e of explosions){
    danger.add(`${e.x},${e.y}`);
  }
  
  return danger;
}

// ユーティリティ関数群
function inBounds(x,y){ return x>=0 && y>=0 && x<COLS && y<ROWS; } // 座標がフィールド内か判定
function cellAt(x,y){ if(!inBounds(x,y)) return 1; return map[y][x]; } // 指定座標のマップ値取得(範囲外は壁扱い)
function ballExists(x,y){ return balls.some(k=>Math.floor(k.fx+0.0001)===x && Math.floor(k.fy+0.0001)===y); } // 指定座標にボールが存在するか

/**
 * マップの初期化: 壁と破壊可能な箱を配置
 * - 外周を壁(値1)で囲む
 * - 2マスおきに規則的に箱(値2)を配置(ボンバーマン風)
 * - さらにランダムに箱を追加してマップに変化をつける
 * - プレイヤー初期位置付近(左上と右下の3x3範囲)は通路を確保
 */
function initMap(){
  // 全マスを通行可能(0)で初期化
  map = new Array(ROWS).fill(0).map(()=>new Array(COLS).fill(0));
  
  // 外周を壁で囲む
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      if(y===0||y===ROWS-1||x===0||x===COLS-1) map[y][x]=1;
      else map[y][x]=0;
    }
  }
  
  // 格子状に破壊可能な箱を配置(2マスおき)
  for(let y=2;y<ROWS-1;y+=2){
    for(let x=2;x<COLS-1;x+=2){
      map[y][x]=2;
    }
  }
  
  // ランダムに追加の箱を配置(55%の確率で配置)
  // プレイヤー初期位置周辺は除外して移動スペースを確保
  for(let y=1;y<ROWS-1;y++){
    for(let x=1;x<COLS-1;x++){
      if(map[y][x]!==0) continue; // 既に何か配置済みならスキップ
      if((x<=2 && y<=2) || (x>=COLS-3 && y>=ROWS-3)) continue; // プレイヤー初期位置周辺を除外
      if(Math.random() < 0.55) map[y][x] = 2;
    }
  }
}

/**
 * プレイヤーオブジェクトの生成
 * @param {number} id - プレイヤーID (1 or 2)
 * @param {number} x - 初期X座標
 * @param {number} y - 初期Y座標
 * @param {string} color - 表示色
 * @returns プレイヤーオブジェクト
 */
function createPlayer(id,x,y,color){
  return {
    id, x, y, color,
    moving:false,           // 移動中フラグ
    pendingTarget:null,     // 移動先座標
    moveProgress:0,         // 移動進捗(0-1)
    dir:{x:0,y:1},         // 向いている方向(ボール発射方向)
    speedTilesPerSec:5,    // 移動速度: 1タイル/0.2秒 = 5タイル/秒
    alive:true,            // 生存状態
    kuroStats:{speed:1.0, interval:0.6, stage:3.0}, // ボール性能(将来の拡張用)
    lastFire:-999,         // 最後にボールを発射した時刻
    isCPU:false,           // CPU制御フラグ
    _ai:{timer:0,dir:{x:0,y:0}}, // AI用内部状態
    items:{maxBalls:0, range:0, speed:0} // 取得したアイテム数
  };
}

/**
 * ゲームのリセット
 * - マップを再生成
 * - 全エンティティをクリア
 * - プレイヤーを初期位置に配置
 * - CPU設定をUIから取得
 */
function resetGame(){
  initMap();
  balls=[]; items=[]; previews=[]; explosions=[];
  players = [
    createPlayer(1,1,1,'#ff6b6b'),              // P1: 左上
    createPlayer(2,COLS-2,ROWS-2,'#4da6ff')     // P2: 右下
  ];
  players[1].isCPU = document.getElementById('cpuToggle').checked;
  updateMessage('');
}

/**
 * ボールの発射: プレイヤーの現在位置にボールを配置し、向いている方向へ移動開始
 * 制限事項:
 * - 発射間隔(interval)のクールダウン中は発射不可
 * - 同時配置数の上限(デフォルト3個 + maxBallsアイテム効果)を超えたら発射不可
 * - 死亡中は発射不可
 */
function placeBall(player){
  if(!player.alive) return; // 死亡中は何もしない
  
  const now = performance.now()/1000;
  // 発射間隔チェック: 前回発射からの経過時間が足りなければ発射できない
  if(now - player.lastFire < player.kuroStats.interval) return;
  
  // 同時配置数の上限チェック(アイテム効果を加算)
  const maxBallsLimit = 3 + player.items.maxBalls;
  if(balls.filter(b=>b.owner===player.id).length >= maxBallsLimit) return;
  
  // ボールの移動方向を決定(プレイヤーの向きを使用、向きが未設定なら下方向)
  let dx = player.dir.x, dy = player.dir.y;
  if(dx===0 && dy===0) dy = 1; // デフォルトは下向き
  const ball = {
    id: Math.random().toString(36).slice(2,10),
    fx: player.x + 0.5, fy: player.y + 0.5,
    dir:{x:dx,y:dy},
    speed: Math.max(0, Math.min(2, player.kuroStats.speed)),
    fuse: Math.max(2, Math.min(5, player.kuroStats.stage)),
    owner: player.id,
    placedAt: now,
    moving:true, stopped:false
  };
  balls.push(ball);
  player.lastFire = now;
  beep(440,0.05); // 発射音
}

/**
 * 爆発のプレビューとスケジューリング
 * 手順:
 * 1. 爆発範囲を計算(十字型、所有者のrangeアイテムを加算)
 * 2. 0.6秒間プレビュー表示(黄色い点滅エフェクト)
 * 3. 中心から外側へ順次爆発(0.12秒間隔で段階的に広がる)
 * 壁や箱で爆風が遮られるため、各方向に対して個別に範囲判定を行う。
 */
function schedulePreviewAndExplosion(ball){
  const cx = Math.floor(ball.fx + 0.0001);
  const cy = Math.floor(ball.fy + 0.0001);
  const cells = [{x:cx,y:cy}]; // 中心セル
  
  // 所有者のrangeアイテム効果を取得
  const owner = players.find(p=>p.id===ball.owner);
  const maxRange = 6 + (owner ? owner.items.range : 0);
  
  // 上下左右四方向に爆風を伸ばす
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  for(const d of dirs){
    for(let r=1;r<=maxRange;r++){
      const nx = cx + d.x*r, ny = cy + d.y*r;
      if(!inBounds(nx,ny)) break;    // フィールド外で停止
      if(cellAt(nx,ny)===1) break;    // 壁で停止
      cells.push({x:nx,y:ny,r:r});    // rは中心からの距離(時間差爆発用)
      if(cellAt(nx,ny)===2) break;    // 箱で停止(箱も爆風に含まれる)
    }
  }
  
  // 0.6秒間のプレビューを追加
  const previewDuration = 0.6;
  previews.push({cells, until: performance.now()/1000 + previewDuration, ballId:ball.id, origin:{x:cx,y:cy}});
  
  // プレビュー終了後に爆発を実行
  setTimeout(()=>{
    triggerExplosionCell(cx,cy); // 中心をまず爆発
    
    // 距離別にグルーピングして時間差爆発を実現
    const grouped = {};
    for(const c of cells){ if('r' in c){ grouped[c.r] = grouped[c.r] || []; grouped[c.r].push(c); } }
    const delays = Object.keys(grouped).map(k=>parseInt(k)).sort((a,b)=>a-b);
    
    // 各距離のセルを120ms間隔で順次爆発(中心から外側へ波状に広がる演出)
    delays.forEach((r, idx)=>{
      setTimeout(()=>{
        for(const cell of grouped[r]) triggerExplosionCell(cell.x, cell.y);
      }, 120*(idx+1));
    });
    
    previews = previews.filter(p=>p.ballId !== ball.id); // プレビューを削除
    beep(120,0.12); // 爆発音
  }, previewDuration*1000);
}

/**
 * 爆発セルのトリガー: 指定座標で爆発を発生させる
 * 処理内容:
 * 1. 爆発エフェクトを追加(0.45秒間表示)
 * 2. 箱があれば破壊し、30%の確率でアイテムをドロップ
 * 3. その位置にいるプレイヤーを死亡処理
 * 4. その位置にあるボールを誘爆(連鎖反応)
 */
function triggerExplosionCell(x,y){
  // 爆発エフェクトを登録(0.45秒間表示)
  explosions.push({x,y,life:0.45});
  
  // 箱の破壊処理とアイテムドロップ
  if(inBounds(x,y) && map[y][x]===2){
    map[y][x] = 0; // 箱を通行可能に変更
    // 30%の確率でアイテムをドロップ
    if(Math.random() < 0.3){
      const itemTypes = ['maxBalls', 'range', 'speed'];
      const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      items.push({x, y, type});
    }
  }
  
  // プレイヤーの死亡判定: 爆発位置にいるプレイヤーを死亡させる
  for(const p of players){
    if(!p.alive) continue;
    if(Math.floor(p.x + 0.0001)===x && Math.floor(p.y + 0.0001)===y) p.alive=false;
  }
  
  // 連鎖反応: 爆発位置にあるボールを誘爆させる
  // 無限ループ防止のため、既にプレビューが登録済みのボールはスキップ
  for(let i=balls.length-1;i>=0;i--){
    const k = balls[i];
    const kx = Math.floor(k.fx + 0.0001), ky = Math.floor(k.fy + 0.0001);
    if(kx===x && ky===y){
      balls.splice(i,1);
      if(!previews.some(p=>p.ballId===k.id)){
        schedulePreviewAndExplosion(k);
      }
    }
  }
}

/**
 * ボールの更新処理
 * - 移動中のボールを指定方向に移動させる
 * - 壁や箱に衡突した場合：
 *   - 残り導火線≤２秒なら即座に爆発
 *   - それ以外はその位置で停止
 * - 導火線が尽きたら爆発
 */
function updateBalls(dt){
  const now = performance.now()/1000;
  for(let i=balls.length-1;i>=0;i--){
    const k = balls[i];
    
    // 移動中かつ停止していないボールを移動
    if(k.moving && !k.stopped){
      const move = k.speed * dt;
      const newFx = k.fx + k.dir.x * move;
      const newFy = k.fy + k.dir.y * move;
      const nextX = Math.floor(newFx + 0.0001);
      const nextY = Math.floor(newFy + 0.0001);
      
      // 移動先が障害物かチェック
      if(!inBounds(nextX,nextY) || cellAt(nextX,nextY)===1 || cellAt(nextX,nextY)===2){
        const elapsed = now - k.placedAt;
        const rem = Math.max(0, k.fuse - elapsed);
        // 残り時間が2秒以下なら即座に爆発
        if(rem <= 2.0){
          schedulePreviewAndExplosion(k);
          balls.splice(i,1);
          continue;
        } else {
          // それ以外は現在位置で停止(中心に配置)
          k.moving = false; k.stopped = true;
          const currentX = Math.floor(k.fx + 0.0001);
          const currentY = Math.floor(k.fy + 0.0001);
          k.fx = currentX + 0.5;
          k.fy = currentY + 0.5;
        }
      } else {
        // 通行可能なら移動
        k.fx = newFx;
        k.fy = newFy;
      }
    }
    
    // 導火線タイマーチェック: 時間切れで爆発
    const elapsedTotal = now - k.placedAt;
    if(elapsedTotal >= k.fuse){
      schedulePreviewAndExplosion(k);
      balls.splice(i,1);
    }
  }
}

// 爆発プレビューの更新: 表示時間が過ぎたプレビューを削除
function updatePreviews(){
  const now = performance.now()/1000;
  previews = previews.filter(p=>p.until > now);
}

// 爆発エフェクトの更新: 残り時間を減らし、0になったら削除
function updateExplosions(dt){
  for(let i=explosions.length-1;i>=0;i--){
    explosions[i].life -= dt;
    if(explosions[i].life <= 0) explosions.splice(i,1);
  }
}

/**
 * キー入力から移動方向を計算
 * 仕様:
 * - 斜め移動なし
 * - 複数キー同時押し時の優先順位: 左 > 右 > 下 > 上
 * @param {Object} mapping - 方向ごとのキーマッピング
 * @returns {Object} {dx, dy} - 移動方向ベクトル
 */
function computeMoveDirectionFromKeys(mapping){
  if(mapping.left && keys[mapping.left]) return {dx:-1, dy:0};
  if(mapping.right && keys[mapping.right]) return {dx:1, dy:0};
  if(mapping.down && keys[mapping.down]) return {dx:0, dy:1};
  if(mapping.up && keys[mapping.up]) return {dx:0, dy:-1};
  return {dx:0, dy:0}; // 入力なし
}

/**
 * 移動開始の試行: 指定方向への移動を開始
 * 手順:
 * 1. 現在位置をグリッドにスナップ(ズレ補正)
 * 2. 移動先タイルが通行可能かチェック(壁・箱・ボールがあれば移動不可)
 * 3. OKなら移動状態に設定し、1タイル分の移動をスケジュール
 */
function tryStartMove(player, dx, dy){
  if(!player.alive) return;    // 死亡中は移動不可
  if(player.moving) return;     // 移動中は新規移動を受け付けない
  if(dx===0 && dy===0) return;  // 方向が指定されていない
  
  // 現在位置をグリッドにスナップ(浮動小数点誤差や中途停止のズレ補正)
  player.x = Math.round(player.x);
  player.y = Math.round(player.y);
  const alignedX = player.x;
  const alignedY = player.y;

  // 移動先のタイル座標を計算
  const nxCell = Math.floor(alignedX + dx + 0.0001);
  const nyCell = Math.floor(alignedY + dy + 0.0001);
  
  // 移動先の通行可能性チェック
  if(!inBounds(nxCell, nyCell)) return;  // フィールド外
  if(cellAt(nxCell, nyCell)!==0) return;  // 壁または箱
  if(balls.some(k=>Math.floor(k.fx+0.0001)===nxCell && Math.floor(k.fy+0.0001)===nyCell)) return; // ボールがある

  // 移動開始: 正確に1タイル分の移動を設定
  player.moving = true;
  player.pendingTarget = {x: alignedX + dx, y: alignedY + dy};
  player.moveProgress = 0;
  player.dir = {x:dx, y:dy}; // 向きを更新(ボール発射方向に影響)
}

/**
 * 移動の中途停止: 現在の補間位置で移動を中断
 * 人間プレイヤー用の機能(キーを離したらその場で止まる)
 * AIは危険回避時にも使用する。
 */
function stopMoveAtCurrentPosition(player){
  if(!player.moving || !player.pendingTarget) return;
  
  // 現在の進捗率を取得
  const t = Math.min(1, Math.max(0, player.moveProgress));
  // 補間位置を計算
  player.x = player.x + (player.pendingTarget.x - player.x) * t;
  player.y = player.y + (player.pendingTarget.y - player.y) * t;
  
  // 両軸を最寄りのグリッド線にスナップ(位置ズレ防止)
  player.x = Math.round(player.x);
  player.y = Math.round(player.y);
  
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
function updatePlayers(dt){
  // 各プレイヤーのキーマッピング
  const p1map = {left:'arrowleft', right:'arrowright', up:'arrowup', down:'arrowdown'};
  const p2map = {left:'a', right:'d', up:'w', down:'s'};
  
  // P1の入力処理(キーボード)
  if(players[0].alive){
    const d1 = computeMoveDirectionFromKeys(p1map);
    tryStartMove(players[0], d1.dx, d1.dy);
    if(keys[keybinds.p1fire]){ placeBall(players[0]); keys[keybinds.p1fire]=false; }
  }
  
  // P2の入力処理(CPUまたはキーボード)
  if(players[1].isCPU){
    runAI(players[1], dt);
  } else {
    const d2 = computeMoveDirectionFromKeys(p2map);
    tryStartMove(players[1], d2.dx, d2.dy);
    if(keys[keybinds.p2fire]){ placeBall(players[1]); keys[keybinds.p2fire]=false; }
  }
  
  // 全プレイヤーの移動処理とアイテム取得
  for(const p of players){
    if(!p.alive) continue; // 死亡中はスキップ
    
    if(p.moving && p.pendingTarget){
      // CPUの場合、移動中に移動先が危険になったら中途停止
      // (爆発が開始されたらそこに突っ込まないように)
      if(p.isCPU){
        const danger = dangerCellsFromBalls();
        const tx = Math.floor(p.pendingTarget.x + 0.0001);
        const ty = Math.floor(p.pendingTarget.y + 0.0001);
        if(danger.has(`${tx},${ty}`)){
          stopMoveAtCurrentPosition(p);
          continue;
        }
      }
      
      // 移動進捗を進める(speedアイテムで20%ずつ加速)
      const baseSpeed = Math.max(0.5, p.speedTilesPerSec);
      const speed = baseSpeed * (1 + p.items.speed * 0.2);
      p.moveProgress += dt * speed;
      
      // 移動完了
      if(p.moveProgress >= 1){
        p.x = p.pendingTarget.x;
        p.y = p.pendingTarget.y;
        p.moving = false;
        p.pendingTarget = null;
        p.moveProgress = 0;
      }
    }
    
    // 人間プレイヤーのみ: キー入力がなくなったら中途停止
    if(p.moving && !p.isCPU){
      const d = p.id===1
        ? computeMoveDirectionFromKeys(p1map)
        : computeMoveDirectionFromKeys(p2map);
      if(d.dx === 0 && d.dy === 0) stopMoveAtCurrentPosition(p);
    }
    
    // アイテム収集判定: 同じタイルにいるアイテムを取得
    for(let i=items.length-1;i>=0;i--){
      const item = items[i];
      if(Math.floor(p.x + 0.0001) === item.x && Math.floor(p.y + 0.0001) === item.y){
        p.items[item.type]++;
        items.splice(i,1);
      }
    }
  }
}

/**
 * AIルーチン(P2用)
 * 行動原理:
 * 1. 危険判定: 現在位置が爆発範囲または爆発中のタイルかどうか
 * 2. 行動タイミング:
 *    - 危険な位置にいる場合: タイマー無視して即座に行動(緊急逃避)
 *    - 安全な場合: 0.4-1.6秒のランダム間隔で行動
 * 3. 移動先選択:
 *    - 安全な移動先(危険エリア外)を優先
 *    - 安全な場所がなければ、通行可能な場所を選択(フォールバック)
 * 4. 攻撃判定:
 *    - 安全な位置にいるときのみボールを発射
 *    - 通常行動25%の確率で発射
 *    - P1と同じ縦または横列にいる場合40%の確率で狙い撃ち
 */
function runAI(p, dt){
  if(!p.alive) return; // 死亡中は何もしない
  
  // 現在の危険エリアを計算
  const danger = dangerCellsFromBalls();
  const cx = Math.floor(p.x + 0.0001);
  const cy = Math.floor(p.y + 0.0001);
  const currentUnsafe = danger.has(`${cx},${cy}`); // 現在位置が危険か
  
  // 行動タイマーを減らす
  p._ai.timer -= dt;
  // 危険な場合はタイマー無視して即座に行動
  const shouldAct = p._ai.timer <= 0 || currentUnsafe;
  
  if(shouldAct){
    // 移動候補(上下左右)
    const choices = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    
    // 通行可能性チェック関数(壁・箱・ボールがないか)
    const passable = (nx,ny)=> inBounds(nx,ny) && cellAt(nx,ny)===0 && !ballExists(nx,ny);
    
    // 安全な移動先：通行可能かつ危険エリア外
    const safeMoves = choices.filter(c=>{
      const nx = cx + c.x, ny = cy + c.y;
      return passable(nx,ny) && !danger.has(`${nx},${ny}`);
    });
    
    // フォールバック用：危険でも通行可能な場所
    const fallbackMoves = choices.filter(c=>{
      const nx = cx + c.x, ny = cy + c.y;
      return passable(nx,ny);
    });
    
    // 優先度順に移動先を選択
    let pick = null;
    if(currentUnsafe && safeMoves.length>0){
      // 現在危険な場合は安全地を優先
      pick = safeMoves[Math.floor(Math.random()*safeMoves.length)];
    } else if(safeMoves.length>0){
      // 安全な移動先があればそちらを選ぶ
      pick = safeMoves[Math.floor(Math.random()*safeMoves.length)];
    } else if(fallbackMoves.length>0){
      // 安全地がなければ、通行可能な場所を選ぶ(追い詰められた場合)
      pick = fallbackMoves[Math.floor(Math.random()*fallbackMoves.length)];
    }
    
    if(pick) tryStartMove(p, pick.x, pick.y);
    
    // 次の行動タイミングを設定
    // 危険時は0.05秒後、安全時は0.4-1.6秒後
    p._ai.timer = currentUnsafe ? 0.05 : (0.4 + Math.random()*1.2);
    
    // 安全な場所にいるときのみ、25%の確率でボール発射
    if(!currentUnsafe && Math.random() < 0.25) placeBall(p);
  }
  
  // 特別攻撃ロジック: P1と同じ縦または横列にいる場合、40%の確率で狙い撃ち
  const target = players[0];
  if(target.alive && (target.x===p.x || target.y===p.y) && Math.random() < 0.4 && !currentUnsafe) {
    placeBall(p);
  }
}

/**
 * 勝敗判定
 * 生存者が1人以下になったらゲーム終了
 * - 1人生き残っていればそのプレイヤーの勝利
 * - 0人なら引き分け
 * 1.2秒後にゲームをリセット
 */
function checkWin(){
  const alive = players.filter(p=>p.alive);
  if(alive.length <= 1){
    const msg = alive.length===1 ? `Player ${alive[0].id} の勝ち！` : '引き分け';
    updateMessage(msg + ' リセットします...');
    setTimeout(()=>resetGame(), 1200);
  }
}

// メッセージ表示を更新
function updateMessage(msg){ const el=document.getElementById('message'); if(el) el.textContent = msg; }

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
function render(){
  // 画面をクリア
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  
  // マップの描画(タイル、壁、箱)
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const px = x*TILE, py = y*TILE;
      ctx.fillStyle = '#cdefff'; ctx.fillRect(px,py,TILE,TILE); // タイル背景
      if(map[y][x]===1){ // 壁
        ctx.fillStyle='#3a6b86'; roundRect(px+6,py+6,TILE-12,TILE-12,6,true,false);
      }
      else if(map[y][x]===2){ // 破壊可能な箱
        ctx.fillStyle='#d4a373'; roundRect(px+8,py+8,TILE-16,TILE-16,4,true,false);
      }
      ctx.strokeStyle='rgba(0,0,0,0.06)'; ctx.strokeRect(px,py,TILE,TILE); // グリッド線
    }
  }
  for(const p of previews){
    const alpha = Math.max(0, (p.until - performance.now()/1000) / 0.6);
    ctx.fillStyle = `rgba(255,200,0,${0.28*alpha})`;
    for(const c of p.cells){ if(inBounds(c.x,c.y)) ctx.fillRect(c.x*TILE+6, c.y*TILE+6, TILE-12, TILE-12); }
  }
  for(const k of balls){
    const px = k.fx * TILE, py = k.fy * TILE;
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px,py,TILE*0.18,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('●', px, py);
    const elapsed = performance.now()/1000 - k.placedAt;
    const rem = Math.max(0, k.fuse - elapsed);
    const barW = TILE*0.9 * (rem / k.fuse);
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fillRect(px - TILE*0.45, py + TILE*0.25, barW, 4);
  }
  for(const e of explosions){
    const alpha = Math.max(0, e.life / 0.45);
    ctx.fillStyle = `rgba(255,120,0,${0.7*alpha})`;
    ctx.fillRect(e.x*TILE+6, e.y*TILE+6, TILE-12, TILE-12);
  }
  // Draw items
  for(const item of items){
    const px = item.x * TILE, py = item.y * TILE;
    // Draw different shapes/colors for item types
    if(item.type === 'maxBalls'){
      ctx.fillStyle = '#ff9999'; ctx.beginPath(); ctx.arc(px+TILE*0.5, py+TILE*0.5, TILE*0.2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+B', px+TILE*0.5, py+TILE*0.5);
    } else if(item.type === 'range'){
      ctx.fillStyle = '#99ff99'; ctx.beginPath(); ctx.moveTo(px+TILE*0.5, py+TILE*0.3); ctx.lineTo(px+TILE*0.7, py+TILE*0.7); ctx.lineTo(px+TILE*0.3, py+TILE*0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+R', px+TILE*0.5, py+TILE*0.5);
    } else if(item.type === 'speed'){
      ctx.fillStyle = '#9999ff'; ctx.beginPath(); ctx.moveTo(px+TILE*0.3, py+TILE*0.3); ctx.lineTo(px+TILE*0.7, py+TILE*0.5); ctx.lineTo(px+TILE*0.3, py+TILE*0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+S', px+TILE*0.5, py+TILE*0.5);
    }
  }
  for(const p of players){
    const cx = (p.x + (p.moving && p.pendingTarget ? (p.pendingTarget.x - p.x) * p.moveProgress : 0) + 0.5) * TILE;
    const cy = (p.y + (p.moving && p.pendingTarget ? (p.pendingTarget.y - p.y) * p.moveProgress : 0) + 0.5) * TILE;
    if(p.alive){
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(cx,cy,TILE*0.28,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.id===1?'A':'B', cx, cy);
    } else {
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx,cy,18,8,Math.PI/4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.fillText('X', cx-6, cy+6);
    }
  }
  // Draw item UI
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#000'; ctx.font = '14px sans-serif';
  ctx.fillText(`P1: B:${players[0].items.maxBalls} R:${players[0].items.range} S:${players[0].items.speed}`, 10, 10);
  ctx.fillText(`P2: B:${players[1].items.maxBalls} R:${players[1].items.range} S:${players[1].items.speed}`, CANVAS_W-250, 10);
  
  const msgEl = document.getElementById('message');
  if(msgEl) msgEl.textContent = `${players[0].alive? 'P1:生':'P1:死'} ・ ${players[1].alive? 'P2:生':'P2:死'}`;
}

// 角丸矩形の描画ヘルパー
function roundRect(x,y,w,h,r,fill,stroke){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

/**
 * キーボード入力の処理
 * - 全てのキーを小文字化してkeysオブジェクトに記録
 * - 矢印キーとスペースキーのデフォルト動作(スクロール)を無効化
 */
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  keys[k]=true;
  // 矢印キーとスペースのデフォルト動作(スクロール)を防止
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){
    e.preventDefault();
  }
});
window.addEventListener('keyup', e=>{ const k = e.key.toLowerCase(); keys[k]=false; });

/**
 * キャンバスクリック: P1の向きを設定
 * クリック位置がプレイヤーから見てどの方向かを計算し、向きを更新
 * (ボール発射方向に影響)
 */
canvas.addEventListener('click', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const p = players[0];
  if(!p) return;
  const px = (p.x + 0.5)*TILE, py = (p.y + 0.5)*TILE;
  const dx = mx - px, dy = my - py;
  // 水平距離と垂直距離を比較して、大きい方を優先
  if(Math.abs(dx) > Math.abs(dy)) p.dir = {x: dx>0?1:-1, y:0};
  else p.dir = {x:0, y: dy>0?1:-1};
});

/**
 * UIイベントのバインディング
 * - リセットボタン: ゲームを再開始
 * - CPUトグル: P2をCPU制御に切り替え
 * - キー設定適用ボタン: カスタムキーバインドを適用
 */
document.getElementById('resetBtn').addEventListener('click', ()=> resetGame());
document.getElementById('cpuToggle').addEventListener('change', (e)=>{ players[1].isCPU = e.target.checked; });
document.getElementById('applyKeys').addEventListener('click', ()=>{
  const p1 = document.getElementById('p1fire').value.trim().toLowerCase();
  const p2 = document.getElementById('p2fire').value.trim().toLowerCase();
  const norm = (v)=> v==='space' ? ' ' : v; // "space"文字列をスペース文字に変換
  if(p1) keybinds.p1fire = norm(p1);
  if(p2) keybinds.p2fire = norm(p2);
});

/**
 * メイン更新処理: 全ゲーム要素を毎フレーム更新
 * @param {number} dt - デルタタイム(秒)
 */
function update(dt){
  updatePlayers(dt);   // プレイヤーの移動と入力処理
  updateBalls(dt);     // ボールの移動と導火線処理
  updatePreviews();    // 爆発プレビューの更新
  updateExplosions(dt);// 爆発エフェクトの更新
  checkWin();          // 勝敗判定
}

/**
 * メインループ: requestAnimationFrameで呼ばれる
 * @param {number} ts - タイムスタンプ(ミリ秒)
 * デルタタイムを計算し、60ms以上はクランプ(フレームレート急下時の異常動作防止)
 */
function loop(ts){
  const dt = Math.min(0.06, (ts - lastTime)/1000); // 最大60msに制限
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// ゲーム開始
resetGame();
requestAnimationFrame(loop);

// デバッグ用: コンソールからゲーム状態にアクセス可能
window._magicball = { players, balls: balls, map };
