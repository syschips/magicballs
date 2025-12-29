/**
 * スプライトアニメーション管理システム
 * GIF → PNG スプライトシート対応
 * 
 * 責務：
 * - スプライト画像のロード・キャッシング
 * - アニメーションフレームの計算・切り替え
 * - メタデータの解析
 * - エラーハンドリング
 * 
 * インターフェース：
 * - getAnimatedSprite(spritePath, timestamp) → { img, sx, sy, sw, sh }
 * - preloadSprites(spriteList) → Promise
 * - getSpriteSize(spritePath) → { width, height }
 */

// スプライトメタデータ管理
const SPRITE_METADATA = {
  // GIF動作中はここに動的に追加される
  // 例：
  // 'k-00': { type: 'spritesheet', cols: 4, rows: 1, frameWidth: 32, frameHeight: 32, frameCount: 4, frameDuration: 0.1 }
  // 'k-00': { type: 'static', width: 32, height: 32 }
};

// スプライトキャッシュ（Image オブジェクト）
const SPRITE_IMAGE_CACHE = new Map();

// スプライト情報キャッシュ
const SPRITE_INFO_CACHE = new Map();

// メタデータの遅延ロードフラグ
let metadataLoaded = false;

/**
 * メタデータJSONを読み込み
 */
export async function loadSpriteMetadata() {
  if (metadataLoaded) return;
  
  try {
    // 複数のパターンを試す
    const pathsToTry = [
      '/data/spriteSheet.json',           // ルートからの絶対パス
      './data/spriteSheet.json',           // 相対パス
      '../data/spriteSheet.json'           // 一階層上
    ];
    
    let data = null;
    let lastError = null;
    
    for (const path of pathsToTry) {
      try {
        console.log('[spriteAnimator] Attempting to load metadata from:', path);
        const response = await fetch(path);
        
        if (response.ok) {
          data = await response.json();
          console.log('[spriteAnimator] Successfully loaded metadata from:', path);
          break;
        } else {
          console.log('[spriteAnimator] Failed to load from', path, '- status:', response.status);
          lastError = new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        console.log('[spriteAnimator] Error loading from', path, ':', err.message);
        lastError = err;
      }
    }
    
    if (data) {
      Object.assign(SPRITE_METADATA, data);
      console.log('[spriteAnimator] Metadata loaded successfully:', Object.keys(SPRITE_METADATA).length, 'sprites');
      console.log('[spriteAnimator] Metadata keys:', Object.keys(SPRITE_METADATA));
    } else {
      console.warn('[spriteAnimator] Failed to load metadata from all paths. Last error:', lastError?.message);
      console.log('[spriteAnimator] Using default metadata');
      initializeDefaultMetadata();
    }
    
    metadataLoaded = true;
  } catch (err) {
    console.warn('[spriteAnimator] Error in loadSpriteMetadata:', err.message, 'Stack:', err.stack);
    initializeDefaultMetadata();
    metadataLoaded = true;
  }
}

/**
 * デフォルトメタデータを初期化（GIF完全アニメーション化まで）
 */
function initializeDefaultMetadata() {
  // 各GIFについて、フレーム数とフレーム時間を指定
  // これはGIFの実際のアニメーション情報をもとに編集されます
  
  // プレイヤー：待機時
  SPRITE_METADATA['k-00'] = {
    type: 'gif',
    width: 32,
    height: 32,
    // GIF自体がアニメーションするので、Canvasでは静的に扱う
    // 完全置き換え時にframeDataが追加される
  };
  SPRITE_METADATA['k-01'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['k-02'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['k-03'] = { type: 'gif', width: 32, height: 32 };
  
  // プレイヤー：移動時
  SPRITE_METADATA['k-04'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['k-05'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['k-06'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['k-07'] = { type: 'gif', width: 32, height: 32 };
  
  // ボール
  SPRITE_METADATA['b-00'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['b-01'] = { type: 'gif', width: 32, height: 32 };
  SPRITE_METADATA['b-02'] = { type: 'gif', width: 32, height: 32 };
}

/**
 * スプライト画像をロード（キャッシュ使用）
 */
function loadSpriteImage(spritePath) {
  if (!spritePath) return null;
  
  if (SPRITE_IMAGE_CACHE.has(spritePath)) {
    return SPRITE_IMAGE_CACHE.get(spritePath);
  }
  
  const img = new Image();
  img.src = spritePath;
  
  SPRITE_IMAGE_CACHE.set(spritePath, img);
  return img;
}

/**
 * スプライト画像の読み込み完了判定
 */
export function spriteIsReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

/**
 * スプライト情報を取得（メタデータ + 画像）
 */
function getSpriteInfo(spriteId) {
  if (SPRITE_INFO_CACHE.has(spriteId)) {
    return SPRITE_INFO_CACHE.get(spriteId);
  }
  
  const metadata = SPRITE_METADATA[spriteId];
  if (!metadata) return null;
  
  const info = {
    id: spriteId,
    metadata: metadata,
    image: null,
    // ↓ PNG スプライトシート対応時に追加
    // frames: [...], frameCount: N, frameDuration: D
  };
  
  SPRITE_INFO_CACHE.set(spriteId, info);
  return info;
}

/**
 * アニメーション付きスプライトを取得
 * 
 * @param {string} spritePath - スプライトファイルパス (e.g., '../imgs/k-00.gif')
 * @param {number} timestamp - 現在時刻（秒）
 * @returns {Object} { img, sx, sy, sw, sh } or null if not ready
 * 
 * 戻り値フォーマット：
 * - img: Image オブジェクト
 * - sx, sy: スプライトシート内のソース座標（PNG時に有効）
 * - sw, sh: ソースサイズ（PNG時に有効）
 */
export function getAnimatedSprite(spritePath, timestamp = performance.now() / 1000) {
  if (!spritePath) return null;
  
  // スプライトIDを抽出（パスから）
  const spriteId = extractSpriteId(spritePath);
  const spriteInfo = getSpriteInfo(spriteId);
  
  if (!spriteInfo) {
    console.warn('[spriteAnimator] No metadata for sprite:', spriteId);
    return null;
  }
  
  // 画像をロード（未ロード時）
  if (!spriteInfo.image) {
    spriteInfo.image = loadSpriteImage(spritePath);
  }
  
  if (!spriteIsReady(spriteInfo.image)) {
    return null; // 画像がまだロード中
  }
  
  const metadata = spriteInfo.metadata;
  
  // PNG スプライトシート対応（frameData が存在する場合）
  if (metadata.type === 'spritesheet' && metadata.frameData) {
    return calculateSpriteSheetFrame(spriteInfo, timestamp);
  }
  
  // GIF 処理（現在）：そのままImage を返す
  if (metadata.type === 'gif') {
    return {
      img: spriteInfo.image,
      sx: 0,
      sy: 0,
      sw: spriteInfo.image.naturalWidth,
      sh: spriteInfo.image.naturalHeight,
      isAnimated: true // アニメーション処理中であることを示す
    };
  }
  
  // スタティック画像
  return {
    img: spriteInfo.image,
    sx: 0,
    sy: 0,
    sw: spriteInfo.image.naturalWidth,
    sh: spriteInfo.image.naturalHeight,
    isAnimated: false
  };
}

/**
 * スプライトシートからフレームを計算
 */
function calculateSpriteSheetFrame(spriteInfo, timestamp) {
  const metadata = spriteInfo.metadata;
  const frameData = metadata.frameData;
  
  if (!frameData || !Array.isArray(frameData) || frameData.length === 0) {
    return {
      img: spriteInfo.image,
      sx: 0,
      sy: 0,
      sw: metadata.frameWidth || spriteInfo.image.naturalWidth,
      sh: metadata.frameHeight || spriteInfo.image.naturalHeight,
      isAnimated: false
    };
  }
  
  // フレームを計算
  const frameDuration = metadata.frameDuration || 0.1;
  const frameCount = frameData.length;
  const cycleTime = frameDuration * frameCount;
  const timeInCycle = timestamp % cycleTime;
  const frameIndex = Math.floor(timeInCycle / frameDuration);
  const frame = frameData[Math.min(frameIndex, frameCount - 1)];
  
  return {
    img: spriteInfo.image,
    sx: frame.x,
    sy: frame.y,
    sw: frame.width,
    sh: frame.height,
    isAnimated: true
  };
}

/**
 * パスからスプライトIDを抽出
 */
function extractSpriteId(spritePath) {
  // '../imgs/k-00.gif' -> 'k-00'
  const match = spritePath.match(/([kb]-\d{2})/);
  return match ? match[1] : 'unknown';
}

/**
 * スプライトサイズを取得
 */
export function getSpriteSize(spritePath) {
  const spriteId = extractSpriteId(spritePath);
  const spriteInfo = getSpriteInfo(spriteId);
  
  if (!spriteInfo) return null;
  
  const metadata = spriteInfo.metadata;
  return {
    width: metadata.width || 32,
    height: metadata.height || 32
  };
}

/**
 * 複数スプライトを事前ロード（Promise）
 */
export async function preloadSprites(spritePathList) {
  // メタデータ確認
  if (!metadataLoaded) {
    await loadSpriteMetadata();
  }
  
  const promises = spritePathList.map(path => {
    return new Promise((resolve) => {
      const img = loadSpriteImage(path);
      
      const checkLoad = () => {
        if (spriteIsReady(img)) {
          resolve(path);
        } else {
          setTimeout(checkLoad, 50);
        }
      };
      
      // タイムアウト設定（5秒）
      setTimeout(() => {
        console.warn('[spriteAnimator] Sprite load timeout:', path);
        resolve(path); // タイムアウト時も続行
      }, 5000);
      
      checkLoad();
    });
  });
  
  return Promise.all(promises);
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearSpriteCache() {
  SPRITE_IMAGE_CACHE.clear();
  SPRITE_INFO_CACHE.clear();
  metadataLoaded = false;
}

/**
 * 初期化処理：起動時に自動実行
 */
export async function initSpriteAnimator() {
  console.log('[spriteAnimator] initSpriteAnimator called');
  try {
    await loadSpriteMetadata();
    console.log('[spriteAnimator] Initialized successfully');
  } catch (err) {
    console.warn('[spriteAnimator] Initialization error:', err.message);
  }
}
