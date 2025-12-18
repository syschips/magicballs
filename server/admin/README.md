# MagicBall バックオフィス

システムログの閲覧・検索を行うための管理画面です。

## アクセス方法

```
http://your-domain/server/admin/
```

## ログイン

- **ユーザー名**: データベースユーザー名（`config.php` の `db_user`）
- **パスワード**: データベースパスワード（`config.php` の `db_pass`）

**注意**: セキュリティ上、データベースの認証情報は厳重に管理してください。

## 機能

### 1. ログ一覧表示
- リアルタイムでシステムログを表示
- 50件ごとのページネーション
- 自動更新（統計情報は30秒ごと）

### 2. 検索・フィルター
以下の条件でログを検索できます：
- **ログレベル**: ERROR, WARNING, INFO, DEBUG
- **カテゴリ**: GAME_RESULT, AUTH, ROOM, ERROR, ACCESS など
- **プレイヤーID**: 特定のプレイヤーに関連するログ
- **ルームID**: 特定のルームに関連するログ
- **キーワード**: メッセージ内のキーワード検索

### 3. 統計情報
- 24時間以内のエラー数
- 24時間以内の警告数
- 総ログ数

### 4. ログ詳細表示
各ログの詳細情報を確認できます：
- ログID
- ログレベル
- カテゴリ
- メッセージ
- コンテキスト（API名など）
- プレイヤーID
- ルームID
- IPアドレス
- 追加データ（JSON形式）
- 日時

## ログの種類

### カテゴリ別

| カテゴリ | 説明 | 例 |
|---------|------|-----|
| GAME_RESULT | ゲーム結果 | 勝者、スコア、レート変動 |
| AUTH | 認証関連 | ログイン、登録、ログアウト |
| ROOM | ルーム操作 | 作成、参加、退出、開始 |
| ERROR | エラー | システムエラー、例外 |
| ACCESS | API アクセス | リクエスト、レスポンス |
| HOST_MIGRATION | ホスト引き継ぎ | 旧ホスト、新ホスト |
| ADMIN_AUTH | 管理者認証 | バックオフィスログイン |

### ログレベル別

| レベル | 説明 | 用途 |
|-------|------|------|
| INFO | 情報 | 通常の操作ログ |
| WARNING | 警告 | 認証失敗など |
| ERROR | エラー | システムエラー、例外 |
| DEBUG | デバッグ | 開発用の詳細情報 |

## データ保持期間

- ログは **30日間** 保持されます
- 30日を超えたログは自動的に削除されます

## セキュリティ

### 推奨事項
1. 本番環境では専用の管理者アカウントを作成
2. 強力なパスワードを設定
3. HTTPS 接続を使用
4. admin ディレクトリへのアクセスを IP 制限

### .htaccess による IP 制限例

```apache
# server/admin/.htaccess
Order Deny,Allow
Deny from all
Allow from 192.168.1.100  # 許可するIPアドレス
```

## トラブルシューティング

### ログインできない
- ゲームの既存ユーザーアカウントを使用していることを確認
- データベース接続を確認
- セッションが有効になっていることを確認

### ログが表示されない
- database/schema.sql の system_logs テーブルが作成されていることを確認
- logger.php が正しく動作していることを確認
- PHPのエラーログを確認

### 検索が遅い
- system_logs テーブルにインデックスが正しく設定されていることを確認
- 古いログを定期的に削除（自動削除が有効）
- データベースのパフォーマンスチューニングを検討

## API エンドポイント

バックオフィスは以下のAPIを使用しています：

### GET /server/admin/api/logs.php
- **action=list**: ログ一覧取得
- **action=stats**: 統計情報取得
- **action=categories**: カテゴリ一覧取得

### パラメータ（action=list）
- `page`: ページ番号（デフォルト: 1）
- `limit`: 1ページあたりの件数（デフォルト: 50）
- `level`: ログレベルフィルター
- `category`: カテゴリフィルター
- `player_id`: プレイヤーIDフィルター
- `room_id`: ルームIDフィルター
- `keyword`: キーワード検索

## カスタマイズ

### 保持期間の変更
logger.php の `cleanOldLogs()` メソッドを編集：

```php
// 30日 → 90日に変更
$query = "DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)";
```

### ページあたりの件数変更
dashboard.php の `logsPerPage` を編集：

```javascript
const logsPerPage = 100; // デフォルト: 50
```

### 自動更新間隔の変更
dashboard.php の `setInterval` を編集：

```javascript
// 30秒 → 60秒に変更
setInterval(loadStats, 60000);
```

## 開発者向け

### ログの追加方法

```php
require_once 'api/config/logger.php';

$logger = new Logger();

// エラーログ
$logger->logError('エラーメッセージ', 'context/api.php', $exception);

// 情報ログ
$logger->log('CUSTOM_CATEGORY', 'メッセージ', ['key' => 'value']);

// ゲーム結果
$logger->logGameResult([
    'room_id' => 'room123',
    'winner_id' => 1,
    'duration' => 180,
    'player_count' => 4,
    'rate_changes' => [...]
]);
```

### データベーススキーマ

```sql
CREATE TABLE system_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    log_level ENUM('INFO', 'WARNING', 'ERROR', 'DEBUG'),
    category VARCHAR(50),
    message TEXT,
    context VARCHAR(255),
    player_id INT,
    room_id VARCHAR(32),
    ip_address VARCHAR(45),
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- インデックス
    INDEX idx_level_created (log_level, created_at DESC),
    INDEX idx_category_created (category, created_at DESC),
    INDEX idx_player (player_id),
    INDEX idx_room (room_id),
    INDEX idx_created (created_at DESC)
);
```

## ライセンス

MagicBall プロジェクトに準拠
