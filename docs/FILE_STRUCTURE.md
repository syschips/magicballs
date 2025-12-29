# MagicBall - ファイル構成と役割

## プロジェクト構造

```
Magicball/
├── index.html              # メインHTMLファイル（エントリーポイント）
├── index-nocache.html      # キャッシュ無効版HTML（開発用）
├── css/
│   └── style.css          # メインスタイルシート
├── imgs/                  # 画像アセット（スプライト）
│   ├── k-00.gif ~ k-07.gif  # キャラクタースプライト（8方向）
│   └── b-00.gif ~ b-02.gif  # ボールスプライト（3種類）
├── src/                   # フロントエンドJavaScriptソースコード
├── server/                # バックエンドPHPコード
├── docs/                  # プロジェクトドキュメント
└── 指示/                  # 開発指示・メモ（削除可能）
```

## フロントエンド（src/）

### コアゲームロジック

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **main.js** | ゲームメインループ | ゲーム初期化、メインループ、グローバル関数の公開 |
| **state.js** | ゲーム状態管理 | ゲームモード、プレイヤー情報、時間管理 |
| **player.js** | プレイヤー制御 | プレイヤーの移動、衡突判定 |
| **ball.js** | ボール制御 | ボールの動き、速度、加速度の計算 |
| **map.js** | マップ管理 | マップデータ、障害物、境界線の定義 |

### AI・制御

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **ai.js** | AI制御 | CPU プレイヤーの思考ルーチン、行動決定 |
| **input.js** | 入力処理 | マウス・タッチ入力の処理、入力イベント管理 |


### レンダリング・エフェクト

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **renderer.js** | 描画処理 | Canvas への描画、マップ・プレイヤー・UIの描画、スプライト管理 |
| **particle.js** | パーティクルシステム | パーティクルエフェクトの生成・更新・描画 |

### 画像アセット（imgs/）

| ファイル | 役割 | 備考 |
|---------|------|------|
| **k-00.gif ~ k-07.gif** | キャラクタースプライト | k-00～k-03: アイドル（上下左右）<br>k-04～k-07: 移動（上下左右） |
| **b-00.gif ~ b-02.gif** | ボールスプライト | b-00: 黒ボール<br>b-01: 白ボール<br>b-02: 黄色ボール |

**注**: `?debug=on` URLパラメータで画像を無効化し、シンプルな図形で描画できます。

### UI・通信

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **ui.js** | UI管理 | 画面遷移、通知、ローディング、フォーム処理 |
| **uiAuth.js** | 認証画面 | ログイン・登録フォーム、ボールタイプ選択 |
| **uiGameStart.js** | ゲーム開始フロー | WebRTC接続確立、ゲーム開始処理 |
| **uiWaitingRoom.js** | 待機ルーム画面 | 参加者リスト、準備状態管理 |
| **chat.js** | チャット機能 | チャットメッセージの送受信、表示管理 |
| **api.js** | API通信 | REST API 呼び出し、認証・ルーム・ゲームAPI |
| **webrtc.js** | WebRTC管理 | P2P接続、DataChannel管理、シグナリング |
| **notifications.js** | 通知システム | 成功・エラー・情報通知の表示管理 |

### ユーティリティ

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **constants.js** | 定数定義 | ゲーム定数、設定値、タイミング定数 || **config.js** | 設定管理 | タイミング設定、ボールタイプ設定 || **utils.js** | ユーティリティ関数 | 汎用関数、ヘルパー関数 |
| **errorHandler.js** | エラーハンドリング | 統一されたエラー処理、エラーログ記録 |

## バックエンド（server/）

### API エンドポイント（server/api/）

#### 認証（auth/）
| ファイル | エンドポイント | 役割 |
|---------|--------------|------|
| **login.php** | POST /api/auth/login.php | ユーザーログイン |
| **register.php** | POST /api/auth/register.php | 新規ユーザー登録 |

#### ルーム管理（rooms/）
| ファイル | エンドポイント | 役割 |
|---------|--------------|------|
| **create.php** | POST /api/rooms/create.php | ルーム作成 |
| **list.php** | GET /api/rooms/list.php | ルーム一覧取得 |
| **join.php** | POST /api/rooms/join.php | ルーム参加 |
| **leave.php** | POST /api/rooms/leave.php | ルーム退出 |
| **ready.php** | POST /api/rooms/ready.php | 準備状態切り替え |
| **reset.php** | POST /api/rooms/reset.php | ルームリセット |
| **cleanup.php** | POST /api/rooms/cleanup.php | 古いルーム削除 |
| **migrate_host.php** | POST /api/rooms/migrate_host.php | ホスト引き継ぎ |

#### ゲーム管理（game/）
| ファイル | エンドポイント | 役割 |
|---------|--------------|------|
| **state.php** | GET /api/game/state.php | ゲーム状態取得 |
| **update.php** | POST /api/game/update.php | ゲーム状態更新 |
| **finish.php** | POST /api/game/finish.php | ゲーム終了処理 |

#### チャット（chat/）
| ファイル | エンドポイント | 役割 |
|---------|--------------|------|
| **send.php** | POST /api/chat/send.php | メッセージ送信 |
| **fetch.php** | GET /api/chat/fetch.php | メッセージ取得 |

#### ランキング（ranking/）
| ファイル | エンドポイント | 役割 |
|---------|--------------|------|
| **top.php** | GET /api/ranking/top.php | トップランキング取得 |

### 設定・ユーティリティ（server/api/config/）

| ファイル | 役割 | 主な機能 |
|---------|------|---------|
| **database.php** | データベース接続 | PDO接続管理、エラーハンドリング |
| **logger.php** | ログ記録 | システムログのDB保存、ログレベル管理 |
| **config.php** | 設定ファイル | DB接続情報（自動生成、Git管理外） |
| **config.sample.php** | 設定サンプル | config.php のテンプレート |

### データベース（server/database/）

| ファイル | 役割 |
|---------|------|
| **schema.sql** | データベーススキーマ定義（テーブル構造、インデックス） |

### バックオフィス（server/admin/）

| ファイル | 役割 |
|---------|------|
| **index.php** | ログイン画面 |
| **auth.php** | 認証処理 |
| **dashboard.php** | ログビューアー（メイン画面） |
| **logout.php** | ログアウト処理 |
| **api/logs.php** | ログ取得API |
| **README.md** | バックオフィスドキュメント |

### その他（server/）

| ファイル | 役割 |
|---------|------|
| **install.php** | インストーラー（DB初期化） |

## ドキュメント（docs/）

| ファイル | 内容 |
|---------|------|
| **FEATURES.md** | 実装機能一覧 |
| **FILE_STRUCTURE.md** | このファイル（ファイル構成） |
| **DATABASE.md** | データベース構成 |
| **INSTALLATION.md** | インストール方法 |

## 設定ファイル

| ファイル | 役割 |
|---------|------|
| **.eslintrc.json** | ESLint設定（コード品質チェック） |
| **.gitignore** | Git管理対象外ファイル指定 |

## 削除可能なファイル（開発履歴・メモ）

以下は開発中に作成された説明ファイルで、本番環境では不要：

```
指示/
├── AI_SYNC_AND_UI_FIXES.md
├── COMPREHENSIVE_ONLINE_SUPPORT.md
├── ONLINE_PLAYER_CONTROL_FIX_COMPLETED.md
└── ONLINE_PLAYER_CONTROL_ISSUE.md

ルート/
├── CODE_QUALITY_REPORT.md
├── CODE_REVIEW_UI.md
├── ESLINT_GUIDE.md
├── IMPLEMENTATION_SUMMARY.md
├── REFACTORING_COMPLETED.md
└── REFACTORING_PLAN.md

server/
├── LOGGING.md
├── README.md（古いREADME）
├── README_NEW.md（古いREADME）
└── SETUP.md（古いセットアップガイド）
```

## データフロー

### 1. ゲーム起動フロー
```
index.html
  → src/main.js（Canvas初期化、グローバル関数登録）
  → src/ui.js（initUI実行）
  → src/uiAuth.js（認証画面表示）
```

### 2. 認証フロー
```
src/uiAuth.js（ログインフォーム）
  → src/api.js（PlayerSession.login呼び出し）
  → server/api/auth/login.php
  → server/api/config/database.php（DB接続）
  → server/api/config/logger.php（ログ記録）
  ← 成功時
  → src/uiAuth.js（キャラクター選択画面表示）
```

### 3. ゲーム開始フロー
```
src/uiAuth.js（ボールタイプ選択）
  → src/ui.js（ルーム選択画面表示、ルーム一覧取得）
  → server/api/rooms/list.php
  → src/ui.js（ルーム作成 or 参加）
  → server/api/rooms/create.php or join.php
  → src/uiWaitingRoom.js（待機ルーム画面、ポーリング開始）
  → server/api/rooms/state.php（定期ポーリング）
  → src/uiWaitingRoom.js（全員準備完了検知）
  → src/uiGameStart.js（checkAndStartGame実行）
  → src/webrtc.js（WebRTC接続確立）
  → src/uiGameStart.js（接続確認後、ゲーム開始ブロードキャスト）
  → window._magicballStartGame（main.jsのstartGame関数）
  → src/main.js（カウントダウン → resetGame → continueGameStart）
```

### 4. ゲーム中フロー
```
src/main.js（メインループ: requestAnimationFrame）
  ├→ src/input.js（キーボード・マウス入力処理）
  ├→ src/player.js（プレイヤー位置更新）
  ├→ src/ball.js（ボール移動・衝突判定）
  ├→ src/ai.js（CPU思考ルーチン実行）
  ├→ src/utils.js（パワーアップ更新）
  ├→ src/particle.js（パーティクル更新）
  ├→ src/webrtc.js（ホスト: スナップショット送信、非ホスト: スナップショット受信適用）
  └→ src/renderer.js（Canvas描画）
      ├→ src/map.js（マップ描画）
      └→ src/particle.js（パーティクル描画）
```

## 依存関係

### フロントエンド主要依存
```
main.js
  ├─ state.js
  ├─ player.js
  │   ├─ ball.js
  │   └─ map.js
  ├─ ai.js
  ├─ renderer.js
  │   ├─ particle.js
  │   └─ map.js
  ├─ input.js
  ├─ webrtc.js
  └─ ui.js
      ├─ uiAuth.js
      ├─ uiGameStart.js
      ├─ uiWaitingRoom.js
      ├─ api.js
      ├─ chat.js
      ├─ notifications.js
      └─ errorHandler.js
```

### バックエンド主要依存
```
各API（*.php）
  ├─ config/database.php
  └─ config/logger.php
      └─ config/database.php
```

## コーディング規約

### JavaScript
- **スタイル**: ESLint推奨ルール準拠
- **命名規則**: camelCase（関数・変数）、UPPER_SNAKE_CASE（定数）
- **JSDoc**: 全関数に型注釈とドキュメント

### PHP
- **スタイル**: PSR-12準拠推奨
- **エラーハンドリング**: try-catch使用、ログ記録必須
- **SQL**: プリペアドステートメント使用必須

## デプロイ時の注意

### 必須の削除・除外
1. **server/install.php** - セキュリティリスクのため削除
2. **開発用ドキュメント** - 上記「削除可能なファイル」参照
3. **server/api/config/config.php** - Git管理しない（.gitignoreに追加）

### 必須の設定
1. **config.php** のパーミッション: 600（所有者のみ読み書き）
2. **server/logs/** のパーミッション: 700（所有者のみアクセス）
3. **データベース認証情報** の安全な管理
