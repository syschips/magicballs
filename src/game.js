/* MagicBall 18x12
 - Field: 18x12 tiles
 - Tile size: 48px (canvas 864x576)
 - No diagonal movement. Priority when multiple keys pressed: Left > Right > Down > Up
 - Two players, optional CPU for Player2
 - Ball: placed, moves straight in player's facing direction; if hits wall/box and remaining fuse <=2s -> explode; otherwise stop
 - Ball stats: speed (0-2 tiles/sec), interval (0.1-1s), stage (2-5s fuse)
 - Explosion: cross-shaped, preview 0.6s then sequential center->outward (0.12s steps)
 - Chain reaction: explosion triggers other Balls in affected tiles
 - Player death: if in tile when explosion occurs
*/

const COLS = 18, ROWS = 12, TILE = 48;
const CANVAS_W = COLS * TILE, CANVAS_H = ROWS * TILE;

const canvas = document.getElementById('game');
canvas.width = CANVAS_W; canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

let audioCtx = null;
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
function beep(freq, time=0.06){ try{ ensureAudio(); const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=0.06; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + time);}catch(e){} }

let map = [];
let balls = [];
let previews = [];
let explosions = [];
let players = [];
let keys = {};
let keybinds = {p1fire:'m', p2fire:'f'};
let lastTime = performance.now();

// Utility
function inBounds(x,y){ return x>=0 && y>=0 && x<COLS && y<ROWS; }
function cellAt(x,y){ if(!inBounds(x,y)) return 1; return map[y][x]; }

// Map init (walls + boxes)
function initMap(){
  map = new Array(ROWS).fill(0).map(()=>new Array(COLS).fill(0));
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      if(y===0||y===ROWS-1||x===0||x===COLS-1) map[y][x]=1;
      else map[y][x]=0;
    }
  }
  // Add destroyable boxes (value=2) in a grid pattern
  for(let y=2;y<ROWS-1;y+=2){
    for(let x=2;x<COLS-1;x+=2){
      map[y][x]=2;
    }
  }
  // Add random destroyable boxes
  for(let y=1;y<ROWS-1;y++){
    for(let x=1;x<COLS-1;x++){
      if(map[y][x]!==0) continue;
      if((x<=2 && y<=2) || (x>=COLS-3 && y>=ROWS-3)) continue;
      if(Math.random() < 0.55) map[y][x] = 2;
    }
  }
}

// Player factory
function createPlayer(id,x,y,color){
  return {
    id, x, y, color,
    moving:false, pendingTarget:null, moveProgress:0,
    dir:{x:0,y:1},
    speedTilesPerSec:5, // 1 tile / 0.2s => 5 tiles/sec
    alive:true,
    kuroStats:{speed:1.0, interval:0.6, stage:3.0},
    lastFire:-999,
    isCPU:false,
    _ai:{timer:0,dir:{x:0,y:0}}
  };
}

// Reset
function resetGame(){
  initMap();
  balls=[]; previews=[]; explosions=[];
  players = [
    createPlayer(1,1,1,'#ff6b6b'),
    createPlayer(2,COLS-2,ROWS-2,'#4da6ff')
  ];
  players[1].isCPU = document.getElementById('cpuToggle').checked;
  updateMessage('');
}

// Place Ball: at player's tile, move in facing dir
function placeBall(player){
  if(!player.alive) return;
  const now = performance.now()/1000;
  if(now - player.lastFire < player.kuroStats.interval) return;
  let dx = player.dir.x, dy = player.dir.y;
  if(dx===0 && dy===0) dy = 1;
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
  beep(440,0.05);
}

// Preview & schedule explosion
function schedulePreviewAndExplosion(ball){
  const cx = Math.floor(ball.fx + 0.0001);
  const cy = Math.floor(ball.fy + 0.0001);
  const cells = [{x:cx,y:cy}];
  const maxRange = 6;
  const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  for(const d of dirs){
    for(let r=1;r<=maxRange;r++){
      const nx = cx + d.x*r, ny = cy + d.y*r;
      if(!inBounds(nx,ny)) break;
      if(cellAt(nx,ny)===1) break;
      cells.push({x:nx,y:ny,r:r});
      if(cellAt(nx,ny)===2) break;
    }
  }
  const previewDuration = 0.6;
  previews.push({cells, until: performance.now()/1000 + previewDuration, ballId:ball.id, origin:{x:cx,y:cy}});
  setTimeout(()=>{
    triggerExplosionCell(cx,cy);
    const grouped = {};
    for(const c of cells){ if('r' in c){ grouped[c.r] = grouped[c.r] || []; grouped[c.r].push(c); } }
    const delays = Object.keys(grouped).map(k=>parseInt(k)).sort((a,b)=>a-b);
    delays.forEach((r, idx)=>{
      setTimeout(()=>{
        for(const cell of grouped[r]) triggerExplosionCell(cell.x, cell.y);
      }, 120*(idx+1));
    });
    previews = previews.filter(p=>p.ballId !== ball.id);
    beep(120,0.12);
  }, previewDuration*1000);
}

function triggerExplosionCell(x,y){
  explosions.push({x,y,life:0.45});
  if(inBounds(x,y) && map[y][x]===2) map[y][x] = 0;
  for(const p of players){ if(p.alive && p.x===x && p.y===y) p.alive=false; }
  for(let i=balls.length-1;i>=0;i--){
    const k = balls[i];
    const kx = Math.floor(k.fx + 0.0001), ky = Math.floor(k.fy + 0.0001);
    if(kx===x && ky===y){
      if(!previews.some(p=>p.ballId===k.id)){
        previews.push({cells:[{x:kx,y:ky}], until:performance.now()/1000});
        triggerExplosionCell(kx,ky);
      }
      balls.splice(i,1);
    }
  }
}

function updateBalls(dt){
  const now = performance.now()/1000;
  for(let i=balls.length-1;i>=0;i--){
    const k = balls[i];
    if(k.moving && !k.stopped){
      const move = k.speed * dt;
      const newFx = k.fx + k.dir.x * move;
      const newFy = k.fy + k.dir.y * move;
      const nextX = Math.floor(newFx + 0.0001);
      const nextY = Math.floor(newFy + 0.0001);
      
      // Check if next tile is blocked
      if(!inBounds(nextX,nextY) || cellAt(nextX,nextY)===1 || cellAt(nextX,nextY)===2){
        const elapsed = now - k.placedAt;
        const rem = Math.max(0, k.fuse - elapsed);
        if(rem <= 2.0){
          schedulePreviewAndExplosion(k);
          balls.splice(i,1);
          continue;
        } else {
          k.moving = false; k.stopped = true;
          // Keep ball in current tile (center it)
          const currentX = Math.floor(k.fx + 0.0001);
          const currentY = Math.floor(k.fy + 0.0001);
          k.fx = currentX + 0.5;
          k.fy = currentY + 0.5;
        }
      } else {
        // Move ball only if next tile is free
        k.fx = newFx;
        k.fy = newFy;
      }
    }
    const elapsedTotal = now - k.placedAt;
    if(elapsedTotal >= k.fuse){
      schedulePreviewAndExplosion(k);
      balls.splice(i,1);
    }
  }
}


function updatePreviews(){
  const now = performance.now()/1000;
  previews = previews.filter(p=>p.until > now);
}

function updateExplosions(dt){
  for(let i=explosions.length-1;i>=0;i--){
    explosions[i].life -= dt;
    if(explosions[i].life <= 0) explosions.splice(i,1);
  }
}

// Movement: no diagonal. priority left > right > down > up
function computeMoveDirectionFromKeys(mapping){
  if(mapping.left && keys[mapping.left]) return {dx:-1, dy:0};
  if(mapping.right && keys[mapping.right]) return {dx:1, dy:0};
  if(mapping.down && keys[mapping.down]) return {dx:0, dy:1};
  if(mapping.up && keys[mapping.up]) return {dx:0, dy:-1};
  return {dx:0, dy:0};
}

function tryStartMove(player, dx, dy){
  if(!player.alive) return;
  if(player.moving) return;
  if(dx===0 && dy===0) return;
  const nx = player.x + dx, ny = player.y + dy;
  if(!inBounds(nx,ny)) return;
  if(cellAt(nx,ny)!==0) return;
  if(balls.some(k=>Math.floor(k.fx+0.0001)===nx && Math.floor(k.fy+0.0001)===ny)) return;
  player.moving = true;
  player.pendingTarget = {x:nx, y:ny};
  player.moveProgress = 0;
  player.dir = {x:dx, y:dy};
}

function updatePlayers(dt){
  const p1map = {left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown'};
  const p2map = {left:'a', right:'d', up:'w', down:'s'};
  if(players[0].alive){
    const d1 = computeMoveDirectionFromKeys(p1map);
    tryStartMove(players[0], d1.dx, d1.dy);
    if(keys[keybinds.p1fire]){ placeBall(players[0]); keys[keybinds.p1fire]=false; }
  }
  if(players[1].isCPU){
    runAI(players[1], dt);
  } else {
    const d2 = computeMoveDirectionFromKeys(p2map);
    tryStartMove(players[1], d2.dx, d2.dy);
    if(keys[keybinds.p2fire]){ placeBall(players[1]); keys[keybinds.p2fire]=false; }
  }
  for(const p of players){
    if(!p.alive) continue;
    if(p.moving && p.pendingTarget){
      const speed = Math.max(0.5, p.speedTilesPerSec);
      p.moveProgress += dt * speed;
      if(p.moveProgress >= 1){
        p.x = p.pendingTarget.x;
        p.y = p.pendingTarget.y;
        p.moving = false;
        p.pendingTarget = null;
        p.moveProgress = 0;
      }
    }
  }
}

// Basic AI for P2
function runAI(p, dt){
  if(!p.alive) return;
  p._ai.timer -= dt;
  if(p._ai.timer <= 0){
    const choices = [{x:0,y:0},{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    const c = choices[Math.floor(Math.random()*choices.length)];
    tryStartMove(p, c.x, c.y);
    p._ai.timer = 0.4 + Math.random()*1.2;
    if(Math.random() < 0.25) placeBall(p);
  }
  const target = players[0];
  if(target.alive && (target.x===p.x || target.y===p.y) && Math.random() < 0.4) placeBall(p);
}

function checkWin(){
  const alive = players.filter(p=>p.alive);
  if(alive.length <= 1){
    const msg = alive.length===1 ? `Player ${alive[0].id} の勝ち！` : '引き分け';
    updateMessage(msg + ' リセットします...');
    setTimeout(()=>resetGame(), 1200);
  }
}

function updateMessage(msg){ const el=document.getElementById('message'); if(el) el.textContent = msg; }

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#eaf6ff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const px = x*TILE, py = y*TILE;
      ctx.fillStyle = '#cdefff'; ctx.fillRect(px,py,TILE,TILE);
      if(map[y][x]===1){ ctx.fillStyle='#3a6b86'; roundRect(px+6,py+6,TILE-12,TILE-12,6,true,false); }
      else if(map[y][x]===2){ ctx.fillStyle='#d4a373'; roundRect(px+8,py+8,TILE-16,TILE-16,4,true,false); }
      ctx.strokeStyle='rgba(0,0,0,0.06)'; ctx.strokeRect(px,py,TILE,TILE);
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
    ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.fillText('●', px-6, py+6);
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
  for(const p of players){
    const cx = (p.x + (p.moving && p.pendingTarget ? (p.pendingTarget.x - p.x) * p.moveProgress : 0) + 0.5) * TILE;
    const cy = (p.y + (p.moving && p.pendingTarget ? (p.pendingTarget.y - p.y) * p.moveProgress : 0) + 0.5) * TILE;
    if(p.alive){
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(cx,cy,TILE*0.28,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='16px sans-serif'; ctx.fillText(p.id===1?'A':'B', cx-6, cy+6);
    } else {
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx,cy,18,8,Math.PI/4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.fillText('X', cx-6, cy+6);
    }
  }
  const msgEl = document.getElementById('message');
  if(msgEl) msgEl.textContent = `${players[0].alive? 'P1:生':'P1:死'} ・ ${players[1].alive? 'P2:生':'P2:死'}`;
}

function roundRect(x,y,w,h,r,fill,stroke){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

// Input
window.addEventListener('keydown', e=>{ const k = e.key.toLowerCase(); keys[k]=true; });
window.addEventListener('keyup', e=>{ const k = e.key.toLowerCase(); keys[k]=false; });

// Click to set P1 facing
canvas.addEventListener('click', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const p = players[0];
  if(!p) return;
  const px = (p.x + 0.5)*TILE, py = (p.y + 0.5)*TILE;
  const dx = mx - px, dy = my - py;
  if(Math.abs(dx) > Math.abs(dy)) p.dir = {x: dx>0?1:-1, y:0};
  else p.dir = {x:0, y: dy>0?1:-1};
});

// UI bindings
document.getElementById('resetBtn').addEventListener('click', ()=> resetGame());
document.getElementById('cpuToggle').addEventListener('change', (e)=>{ players[1].isCPU = e.target.checked; });
document.getElementById('applyKeys').addEventListener('click', ()=>{
  const p1 = document.getElementById('p1fire').value.trim().toLowerCase();
  const p2 = document.getElementById('p2fire').value.trim().toLowerCase();
  if(p1) keybinds.p1fire = p1; if(p2) keybinds.p2fire = p2;
});

// Update functions
function update(dt){
  updatePlayers(dt);
  updateBalls(dt);
  updatePreviews();
  updateExplosions(dt);
  checkWin();
}

function loop(ts){
  const dt = Math.min(0.06, (ts - lastTime)/1000);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// Start
resetGame();
requestAnimationFrame(loop);

function updatePreviews(){ const now = performance.now()/1000; previews = previews.filter(p=>p.until > now); }
function updateExplosions(dt){ for(let i=explosions.length-1;i>=0;i--){ explosions[i].life -= dt; if(explosions[i].life <= 0) explosions.splice(i,1); } }
function checkWin(){ const alive = players.filter(p=>p.alive); if(alive.length <= 1){ const msg = alive.length===1 ? `Player ${alive[0].id} の勝ち！` : '引き分け'; updateMessage(msg + ' リセットします...'); setTimeout(()=>resetGame(), 1200); } }

// For debug in console
window._magicball = { players, balls: balls, map };
