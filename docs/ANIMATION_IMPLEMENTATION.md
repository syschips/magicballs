# アニメーション処理の改善：GIF → PNG スプライトシート化

## 概要

キャラクター（プレイヤー）とボールのアニメーション GIF を Canvas で正しく再生するために、以下の方針で実装を進めています：

1. **現在の状態**：GIF ファイルを Image オブジェクトで読み込み、Canvas に描画
   - ❌ 問題：Canvas は GIF アニメーションをサポートしない（フレーム 0 のみ表示）

2. **段階的改善戦略**：
   - **フェーズ 1（完了）**：新しいアニメーション管理モジュール `spriteAnimator.js` を実装
   - **フェーズ 2（計画中）**：GIF → PNG スプライトシート変換ツール使用
   - **フェーズ 3（計画中）**：段階的に GIF を置き換え

---

## 実装構成

### ファイル構成

```
src/
  ├─ renderer.js (修正完了)
  │   ├─ spriteAnimator.js からアニメーション情報を取得
  │   └─ エラーハンドリング強化
  ├─ spriteAnimator.js (新規実装)
  │   ├─ スプライト画像ロード・キャッシング
  │   ├─ アニメーションフレーム計算
  │   └─ メタデータ解析
  
data/
  └─ spriteSheet.json (新規)
      └─ 各スプライトのメタデータ（GIF/PNG対応）

imgs/
  ├─ *.gif (既存、アニメーション未実装状態)
  └─ *.png (将来：PNG スプライトシート)

convert_gif_to_spritesheet.py (新規)
  └─ GIF → PNG スプライトシート変換ツール
```

---

## GIF → PNG スプライトシート変換手順

### 前提条件

- Python 3.7 以上
- Pillow ライブラリ

```bash
pip install Pillow
```

### 変換方法

#### 1. 単一ファイルの変換テスト

```bash
cd プロジェクトルート
python convert_gif_to_spritesheet.py --input ./imgs --output ./imgs --metadata ./data/spriteSheet.json
```

**実行結果：**
- `imgs/` に PNG スプライトシート生成（例：`k-00.png`）
- `data/spriteSheet.json` に フレーム情報を追記

#### 2. 環境に応じたカスタム実行

```bash
# 別のフォルダを指定する場合
python convert_gif_to_spritesheet.py \
  --input /path/to/gifs \
  --output /path/to/output \
  --metadata /path/to/metadata.json
```

### スクリプト出力例

```
============================================================
🎬 GIF → PNG スプライトシート変換ツール
============================================================
入力フォルダ: ./imgs
出力フォルダ: ./imgs
メタデータ: ./data/spriteSheet.json
============================================================

📦 GIF ファイル検出: 11 個

🔄 k-00 を処理中...
  ✓ 4 フレーム抽出
  ✓ スプライトシート生成: ./imgs/k-00.png
    サイズ: 128x32 (4フレーム)

🔄 k-01 を処理中...
...

✅ 変換完了: 11/11 ファイル

============================================================
✅ 処理完了！

次のステップ：
1. PNG スプライトシートと HTML に期待どおりに表示されるか確認
2. 問題があれば、別のGIFから試しながら調整
3. アニメーション周期が合わない場合は、frameDuration を調整
============================================================
```

---

## spriteSheet.json の構造

### GIF ファイル（現在）

```json
{
  "k-00": {
    "type": "gif",
    "width": 32,
    "height": 32,
    "description": "プレイヤー待機・上向き"
  }
}
```

### PNG スプライトシート化後

```json
{
  "k-00": {
    "type": "spritesheet",
    "width": 32,
    "height": 32,
    "frameCount": 4,
    "frameWidth": 32,
    "frameHeight": 32,
    "frameDuration": 0.1,
    "frameData": [
      { "x": 0, "y": 0, "width": 32, "height": 32 },
      { "x": 32, "y": 0, "width": 32, "height": 32 },
      { "x": 64, "y": 0, "width": 32, "height": 32 },
      { "x": 96, "y": 0, "width": 32, "height": 32 }
    ]
  }
}
```

---

## 実装の詳細

### spriteAnimator.js の機能

```javascript
// 初期化（起動時に自動実行）
await initSpriteAnimator();

// アニメーション付きスプライト取得
const spriteData = getAnimatedSprite('../imgs/k-00.gif', timestamp);
// 戻り値: { img, sx, sy, sw, sh, isAnimated }

// スプライトサイズ取得
const size = getSpriteSize('../imgs/k-00.gif');
// 戻り値: { width: 32, height: 32 }

// 複数スプライト事前ロード
await preloadSprites([
  '../imgs/k-00.gif',
  '../imgs/b-00.gif',
  ...
]);
```

### 描画処理の安全化

renderer.js では、以下の対策で画像読み込みエラーをゲームロジックに波及させません：

```javascript
function renderBalls(ctx) {
  // ...
  const spriteData = getAnimatedSpriteFrame(spritePath, now);
  
  if (spriteData && spriteData.img) {
    try {
      // PNG スプライトシート対応
      if (spriteData.sx !== undefined) {
        ctx.drawImage(
          spriteData.img,
          spriteData.sx, spriteData.sy, spriteData.sw, spriteData.sh,
          destX, destY, drawW, drawH
        );
      } else {
        // GIF 等の通常描画
        ctx.drawImage(spriteData.img, destX, destY, drawW, drawH);
      }
    } catch (err) {
      console.warn('[renderBalls] Error drawing sprite:', err.message);
      // フォールバック描画に自動切り替え
    }
  } else {
    // スプライト未ロード時のフォールバック描画
  }
}
```

---

## 段階的置き換えの流れ

### Step 1: 現在（GIF 動作確認）

✅ `spriteAnimator.js` と `renderer.js` の統合が完了  
✅ GIF はそのまま動作（アニメーション未実装）  
⚠️ ゲーム起動時に console.log で確認

```bash
# ブラウザコンソールで確認
[spriteAnimator] Metadata loaded: 11 sprites
[renderer] spriteAnimator initialized
```

### Step 2: 1 つ の GIF をテスト変換

```bash
# 例：k-00.gif だけを変換テスト
python convert_gif_to_spritesheet.py
```

その後、ブラウザで動作確認：
- 起動時のエラーがないか
- プレイヤーキャラクターがアニメーション表示されるか
- ゲーム中の処理が安定しているか

### Step 3: 全 GIF を変換

問題がなければ、全ファイルを変換：

```bash
python convert_gif_to_spritesheet.py --input ./imgs --output ./imgs
```

### Step 4: サーバ配置前の確認

1. ローカルで全機能動作確認
2. ネットワークテスト（複数クライアント）
3. 本番環境へのデプロイ前チェック

---

## フレーム時間の調整

GIF のアニメーション周期が Python 変換後に合わない場合、`spriteSheet.json` の `frameDuration` を手動調整できます：

```json
{
  "k-00": {
    "type": "spritesheet",
    "frameDuration": 0.15  // デフォルト 0.1 秒から 0.15 秒に変更
  }
}
```

一般的な値：
- `0.05`：非常に高速（50ms/フレーム）
- `0.1`：通常速度（100ms/フレーム）
- `0.2`：遅い（200ms/フレーム）

---

## トラブルシューティング

### Q: 変換スクリプトが「PILがインストールされていない」と出る

```bash
pip install Pillow --upgrade
```

### Q: 変換後の PNG が表示されない

1. `spriteSheet.json` が正しく更新されているか確認
2. ブラウザのキャッシュをクリア（Ctrl+Shift+Delete）
3. コンソール（F12）でエラーを確認

### Q: アニメーション周期が原作 GIF と異なる

上記「フレーム時間の調整」を参照。または、GIF の各フレーム時間を確認：

```python
from PIL import Image
gif = Image.open('imgs/k-00.gif')
for i in range(gif.n_frames):
    gif.seek(i)
    print(f"Frame {i}: {gif.info.get('duration', 100)}ms")
```

### Q: ゲームがエラーで止まる

- コンソール（F12）でエラーメッセージを確認
- `spriteAnimator.js` のエラーハンドリングが動作しているか確認
- 既存の GIF（変換前）での動作確認

---

## 今後の拡張

- [ ] WebP スプライトシート対応
- [ ] 複数行配置（矩形スプライトシート）対応
- [ ] 動的フレームレート調整 UI
- [ ] オンラインゲーム時の CDN 最適化

