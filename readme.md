# MagicBall 

最大6人対戦のオンラインボールゲーム

## 概要

MagicBall は、WebRTCを使用したP2P通信により、最大6人で対戦できるブラウザベースのゲームです。直感的なマウス/タッチ操作で楽しめます。

## 主な機能

-  **最大6人対戦**: オンラインマルチプレイ対応（2-6人）
-  **WebRTC P2P通信**: P2P同期
-  **レーティングシステム**: Eloレーティングベース
-  **チャット機能**: ゲーム中のコミュニケーション
-  **AI対戦**: CPU相手のプレイ
-  **ゲームモード**: クラシック（レート変動あり） / パーティ（レート変動なし・残機3）
-  **ホスト自動引き継ぎ**: ホスト切断時の自動移行
-  **バックオフィス**: システムログの管理画面

## クイックスタート

### 必要環境

- Webサーバー（Apache / Nginx）
- PHP 7.4+
- MySQL 5.7+
- モダンブラウザ（Chrome 90+ / Firefox 88+ / Safari 14+）

### インストール

1. ファイルをWebサーバーに配置
2. ブラウザで `http://your-domain/server/install.php` にアクセス
3. データベース情報を入力して初期化
4. `server/install.php` を削除
5. `http://your-domain/index.html` でゲーム開始

詳細は [インストール方法](docs/INSTALLATION.md) を参照してください。

## ドキュメント

プロジェクトの詳細なドキュメントは `docs/` ディレクトリにあります：

| ドキュメント | 内容 |
|------------|------|
| **[FEATURES.md](docs/FEATURES.md)** | 実装されている全機能の一覧 |
| **[FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md)** | ファイル構成と各ファイルの役割 |
| **[DATABASE.md](docs/DATABASE.md)** | データベース構成とテーブル定義 |
| **[INSTALLATION.md](docs/INSTALLATION.md)** | インストール手順と環境設定 |
| **[server/admin/README.md](server/admin/README.md)** | バックオフィスの使い方 |

## 技術スタック

### フロントエンド
- Vanilla JavaScript
- HTML5 Canvas
- WebRTC DataChannel

### バックエンド
- PHP 7.4+
- MySQL 5.7+
- REST API

### 主要ライブラリ技術
- PDO（データベース接続）
- bcrypt（パスワードハッシュ化）
- WebRTC（P2P通信）
- ESLint（コード品質）

## プロジェクト構造

```
project-root/
 index.html                 # ゲームのメインHTML
 css/
    style.css               # スタイルシート
 data/
    spriteSheet.json        # PNGスプライトシートのメタデータ
 imgs/                     # PNGスプライトシートやアセット
 logs/                     # アプリケーションログ
 src/                      # フロントエンドJS
    main.js                 # ゲームループ
    ui.js                   # UI管理
    api.js                  # API通信
    player.js               # プレイヤー制御
    ai.js                   # AI制御
    ...                     # その他モジュール
 server/                   # バックエンドPHP
    api/                    # REST API
    admin/                  # バックオフィス
    database/               # スキーマ定義
    install.php             # インストーラー
 docs/                     # ドキュメント一式
 convert_gif_to_spritesheet.py # GIF→PNG変換スクリプト（再生成用）
```

詳細は [ファイル構成](docs/FILE_STRUCTURE.md) を参照してください。

## 開発

### デバッグモード

ゲーム開発時に使用できるデバッグ機能：

```bash
# スプライトをオフにしてシンプルな図形で表示（デバッグ用）
http://your-domain/index.html?debug=on
```

**デバッグモードの機能**：
- キャラクター・ボールをシンプルな円や図形で表示
- GIF/PNG画像の読み込みエラー時のトラブルシューティングに便利
- レンダリングパフォーマンスの確認

### コード品質

```bash
# ESLintでコードチェック
npx eslint src/

# 自動修正
npx eslint src/ --fix
```

### データベースマイグレーション

```bash
# スキーマ適用
mysql -u root -p magicball < server/database/schema.sql

# バックアップ
mysqldump -u root -p magicball > backup.sql
```

## デプロイ

本番環境へのデプロイ時の注意点：

1. **セキュリティ**
   - `server/install.php` を削除
   - `server/api/config/config.php` のパーミッションを 600 に設定
   - HTTPS を有効化
   - 管理画面へのIP制限

2. **パフォーマンス**
   - PHP OPcache を有効化
   - データベースのインデックス確認
   - 定期的な古いルームの削除（Cron設定）

3. **バックアップ**
   - データベースの定期バックアップ
   - ファイルのバックアップ

詳細は [インストール方法](docs/INSTALLATION.md) を参照してください。

## テストユーザー

開発テスト用のユーザーアカウント：

| ユーザー名 | パスワード |
|----------|----------|
| guest1   | test123  |
| guest2   | test123  |
| guest3   | test123  |
| guest4   | test123  |

**注意**: 本番環境では必ず削除してください。

バックオフィス

システムログを閲覧検索できる管理画面：

- **URL**: `http://your-domain/server/admin/`
- **ログイン**: DB接続ユーザー（ `db_user` / `db_pass`）を使用
- **機能**: ログ検索、統計表示、詳細表示

詳細は [バックオフィスREADME](server/admin/README.md) を参照してください。

## トラブルシューティング

### データベース接続エラー
- MySQLサービスが起動しているか確認
- `server/api/config/config.php` の認証情報を確認

### WebRTC接続エラー
- ブラウザがWebRTCに対応しているか確認
- HTTPSを使用（推奨）
- ファイアウォール設定を確認

### ゲームが開始されない
- ブラウザのコンソールログを確認
- 全プレイヤーが準備完了しているか確認

### 画像が表示されない
- `data/spriteSheet.json` と `imgs/` 配下のPNGスプライトシートが配置されているか確認
- デバッグモードで確認: `http://your-domain/index.html?debug=on`
- ブラウザのコンソールでエラーを確認

詳細は [インストール方法](docs/INSTALLATION.md) のトラブルシューティングセクションを参照してください。

## ライセンス

プロジェクト固有のライセンスを適用してください。

## 貢献

バグ報告や機能提案は Issue で受け付けています。

---

**ドキュメント更新日**: 2025年12月30日
