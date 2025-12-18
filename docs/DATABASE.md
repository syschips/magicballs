# MagicBall - データベース構成

## データベース概要

- **データベース名**: magicball
- **文字コード**: utf8mb4
- **照合順序**: utf8mb4_unicode_ci
- **エンジン**: InnoDB

## テーブル一覧

| テーブル名 | 説明 | 主要カラム数 |
|-----------|------|------------|
| players | プレイヤー情報 | 8 |
| game_rooms | ゲームルーム | 10 |
| room_participants | ルーム参加者 | 16 |
| game_history | ゲーム履歴 | 6 |
| rate_history | レート履歴 | 7 |
| game_state | ゲーム状態 | 4 |
| room_messages | チャットメッセージ | 6 |
| system_logs | システムログ | 10 |

## テーブル詳細

### 1. players（プレイヤー情報）

プレイヤーアカウントの基本情報を保存。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| player_id | INT | NO | PRI | AUTO_INCREMENT | プレイヤーID（主キー） |
| username | VARCHAR(50) | NO | UNI | - | ユーザー名（ユニーク） |
| password_hash | VARCHAR(255) | NO | - | - | パスワードハッシュ（bcrypt） |
| display_name | VARCHAR(50) | NO | - | - | 表示名 |
| current_rate | INT | NO | IDX | 1500 | 現在のレート |
| total_games | INT | NO | - | 0 | 総ゲーム数 |
| total_wins | INT | NO | - | 0 | 総勝利数 |
| created_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 更新日時 |

**インデックス**:
- PRIMARY KEY: player_id
- UNIQUE KEY: username
- INDEX: current_rate (DESC)

**用途**:
- ログイン認証
- レーティング管理
- ランキング表示

---

### 2. game_rooms（ゲームルーム）

ゲームルームの情報を管理。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| room_id | VARCHAR(32) | NO | PRI | - | ルームID（主キー） |
| room_name | VARCHAR(100) | YES | - | - | ルーム名 |
| max_players | INT | NO | - | 6 | 最大プレイヤー数 |
| current_players | INT | NO | - | 0 | 現在のプレイヤー数 |
| host_player_id | INT | NO | FK, IDX | - | ホストのプレイヤーID |
| game_time | INT | NO | - | 180 | ゲーム時間（秒） |
| status | ENUM | NO | IDX | 'waiting' | ステータス（waiting/playing/finished） |
| created_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 作成日時 |
| started_at | TIMESTAMP | YES | - | NULL | 開始日時 |
| finished_at | TIMESTAMP | YES | - | NULL | 終了日時 |

**インデックス**:
- PRIMARY KEY: room_id
- INDEX: status
- INDEX: host_player_id
- FOREIGN KEY: host_player_id → players(player_id)

**用途**:
- ルーム一覧表示
- ルーム状態管理
- ホスト管理

---

### 3. room_participants（ルーム参加者）

各ルームの参加プレイヤー情報を保存。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| id | INT | NO | PRI | AUTO_INCREMENT | ID（主キー） |
| room_id | VARCHAR(32) | NO | FK | - | ルームID |
| player_id | INT | NO | FK | - | プレイヤーID |
| player_number | INT | NO | - | - | プレイヤー番号（0-5） |
| ball_type | ENUM | NO | - | 'kuro' | ボールタイプ（kuro/shiro/kiiro） |
| is_cpu | BOOLEAN | NO | - | FALSE | CPU判定 |
| is_ready | BOOLEAN | NO | - | FALSE | 準備完了フラグ |
| rate_before | INT | YES | - | NULL | ゲーム前レート |
| rate_after | INT | YES | - | NULL | ゲーム後レート |
| result | ENUM | YES | - | NULL | 結果（win/lose/draw） |
| score | INT | NO | - | 0 | スコア |
| joined_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 参加日時 |
| last_seen_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 最終確認日時 |
| webrtc_offer | TEXT | YES | - | NULL | WebRTC Offer（未使用） |
| webrtc_answer | TEXT | YES | - | NULL | WebRTC Answer（未使用） |
| webrtc_candidates | TEXT | YES | - | NULL | WebRTC ICE Candidates（未使用） |

**インデックス**:
- PRIMARY KEY: id
- UNIQUE KEY: (room_id, player_number)
- FOREIGN KEY: room_id → game_rooms(room_id)
- FOREIGN KEY: player_id → players(player_id)

**用途**:
- 参加者リスト表示
- 準備状態管理
- ゲーム結果記録
- ホスト引き継ぎ（joined_at順）

---

### 4. game_history（ゲーム履歴）

完了したゲームの履歴を保存。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| game_id | INT | NO | PRI | AUTO_INCREMENT | ゲームID（主キー） |
| room_id | VARCHAR(32) | NO | FK | - | ルームID |
| player_count | INT | NO | - | - | プレイヤー数 |
| winner_id | INT | YES | FK | NULL | 勝者ID |
| duration_seconds | INT | YES | - | NULL | ゲーム時間（秒） |
| finished_at | TIMESTAMP | NO | IDX | CURRENT_TIMESTAMP | 終了日時 |

**インデックス**:
- PRIMARY KEY: game_id
- INDEX: finished_at (DESC)
- FOREIGN KEY: room_id → game_rooms(room_id)
- FOREIGN KEY: winner_id → players(player_id)

**用途**:
- ゲーム履歴の記録
- 統計情報の生成

---

### 5. rate_history（レート履歴）

プレイヤーのレート変動履歴を保存。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| id | INT | NO | PRI | AUTO_INCREMENT | ID（主キー） |
| player_id | INT | NO | FK | - | プレイヤーID |
| game_id | INT | NO | FK | - | ゲームID |
| rate_before | INT | NO | - | - | 変動前レート |
| rate_after | INT | NO | - | - | 変動後レート |
| rate_change | INT | NO | - | - | レート変動量 |
| recorded_at | TIMESTAMP | NO | IDX | CURRENT_TIMESTAMP | 記録日時 |

**インデックス**:
- PRIMARY KEY: id
- INDEX: (player_id, recorded_at DESC)
- FOREIGN KEY: player_id → players(player_id)
- FOREIGN KEY: game_id → game_history(game_id)

**用途**:
- レート変動履歴の記録
- プレイヤーの成長グラフ表示

---

### 6. game_state（ゲーム状態）

リアルタイムゲーム状態の同期用（現在は使用頻度低）。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| room_id | VARCHAR(32) | NO | PK, FK | - | ルームID |
| player_id | INT | NO | PK, FK | - | プレイヤーID |
| state_data | TEXT | NO | - | - | 状態データ（JSON） |
| updated_at | TIMESTAMP | NO | - | CURRENT_TIMESTAMP | 更新日時 |

**インデックス**:
- PRIMARY KEY: (room_id, player_id)
- FOREIGN KEY: room_id → game_rooms(room_id)
- FOREIGN KEY: player_id → players(player_id)

**用途**:
- ゲーム状態のバックアップ
- 再接続時の状態復元

---

### 7. room_messages（チャットメッセージ）

ルーム内のチャットメッセージを保存。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| message_id | INT | NO | PRI | AUTO_INCREMENT | メッセージID（主キー） |
| room_id | VARCHAR(32) | NO | FK, IDX | - | ルームID |
| player_id | INT | YES | FK | NULL | プレイヤーID（NULL=システム） |
| message_text | TEXT | NO | - | - | メッセージ本文 |
| is_system | BOOLEAN | NO | - | FALSE | システムメッセージフラグ |
| sent_at | TIMESTAMP | NO | IDX | CURRENT_TIMESTAMP | 送信日時 |

**インデックス**:
- PRIMARY KEY: message_id
- INDEX: (room_id, sent_at DESC)
- FOREIGN KEY: room_id → game_rooms(room_id)
- FOREIGN KEY: player_id → players(player_id) ON DELETE SET NULL

**用途**:
- チャット履歴の保存
- メッセージ取得（ポーリング）

---

### 8. system_logs（システムログ）

システム全体のログを保存（バックオフィスで閲覧）。

| カラム名 | 型 | NULL | キー | デフォルト | 説明 |
|---------|---|------|-----|-----------|------|
| log_id | BIGINT | NO | PRI | AUTO_INCREMENT | ログID（主キー） |
| log_level | ENUM | NO | IDX | 'INFO' | ログレベル（INFO/WARNING/ERROR/DEBUG） |
| category | VARCHAR(50) | NO | IDX | - | カテゴリ（GAME_RESULT, AUTH, ROOMなど） |
| message | TEXT | NO | - | - | メッセージ |
| context | VARCHAR(255) | YES | - | NULL | コンテキスト（API名など） |
| player_id | INT | YES | FK, IDX | NULL | 関連プレイヤーID |
| room_id | VARCHAR(32) | YES | IDX | NULL | 関連ルームID |
| ip_address | VARCHAR(45) | YES | - | NULL | IPアドレス |
| data | JSON | YES | - | NULL | 追加データ（JSON） |
| created_at | TIMESTAMP | NO | IDX | CURRENT_TIMESTAMP | 作成日時 |

**インデックス**:
- PRIMARY KEY: log_id
- INDEX: (log_level, created_at DESC)
- INDEX: (category, created_at DESC)
- INDEX: player_id
- INDEX: room_id
- INDEX: created_at (DESC)
- FOREIGN KEY: player_id → players(player_id) ON DELETE SET NULL

**用途**:
- システムログの記録
- バックオフィスでのログ閲覧
- エラー追跡・デバッグ
- 30日後に自動削除

## ER図（関係図）

```
players
  ├─ (1) host_player_id → (N) game_rooms
  ├─ (1) player_id → (N) room_participants
  ├─ (1) player_id → (N) game_history (winner_id)
  ├─ (1) player_id → (N) rate_history
  ├─ (1) player_id → (N) game_state
  ├─ (1) player_id → (N) room_messages
  └─ (1) player_id → (N) system_logs

game_rooms
  ├─ (1) room_id → (N) room_participants
  ├─ (1) room_id → (N) game_history
  ├─ (1) room_id → (N) game_state
  └─ (1) room_id → (N) room_messages

game_history
  └─ (1) game_id → (N) rate_history
```

## データ保持期間

| テーブル | 保持期間 | 削除方法 |
|---------|---------|---------|
| players | 永続 | 手動削除のみ |
| game_rooms | ゲーム終了後自動削除 | cleanup.php |
| room_participants | ルーム削除時にカスケード削除 | CASCADE |
| game_history | 永続 | 手動削除のみ |
| rate_history | 永続 | 手動削除のみ |
| game_state | ルーム削除時にカスケード削除 | CASCADE |
| room_messages | ルーム削除時にカスケード削除 | CASCADE |
| system_logs | 30日間 | 自動削除（logger.php） |

## パフォーマンスチューニング

### 推奨インデックス
すべてのインデックスは schema.sql に定義済み。

### クエリ最適化
1. **ルーム一覧取得**: status と created_at でフィルタリング
2. **ランキング取得**: current_rate の降順インデックス使用
3. **チャット取得**: (room_id, sent_at) の複合インデックス使用
4. **ログ検索**: 各検索条件に対応するインデックスを使用

### 定期メンテナンス
1. **古いルームの削除**: cleanup.php を定期実行（Cron推奨）
2. **古いログの削除**: 自動実行（1%の確率で実行）
3. **統計情報の更新**: ANALYZE TABLE を定期実行

## セキュリティ

### SQLインジェクション対策
- 全クエリでプリペアドステートメント使用
- ユーザー入力の直接埋め込み禁止

### データ保護
- パスワードは bcrypt でハッシュ化（password_hash()）
- 機密情報は暗号化推奨（今後の実装）

### アクセス制御
- データベースユーザーは最小権限のみ付与
- 本番環境では専用DBユーザーを作成

## バックアップ

### 推奨バックアップ方法
```bash
# 全データベースバックアップ
mysqldump -u root -p magicball > backup_$(date +%Y%m%d).sql

# 圧縮バックアップ
mysqldump -u root -p magicball | gzip > backup_$(date +%Y%m%d).sql.gz

# 特定テーブルのみ
mysqldump -u root -p magicball players game_history rate_history > essential_data.sql
```

### バックアップ頻度推奨
- **フルバックアップ**: 毎日
- **差分バックアップ**: 必要に応じて
- **保持期間**: 最低7日分

## リストア

```bash
# バックアップからリストア
mysql -u root -p magicball < backup_20231218.sql

# 圧縮バックアップからリストア
gunzip < backup_20231218.sql.gz | mysql -u root -p magicball
```

## データベースバージョン管理

schema.sql が唯一の正式なスキーマ定義です。変更時は以下の手順を推奨：

1. schema.sql を更新
2. マイグレーションスクリプトを作成（必要に応じて）
3. テスト環境で実行
4. 本番環境に適用

## トラブルシューティング

### 接続エラー
- config.php の認証情報を確認
- MySQL サーバーが起動しているか確認
- ファイアウォール設定を確認

### パフォーマンス問題
- EXPLAIN を使用してクエリ分析
- スロークエリログを有効化
- インデックスの再構築: OPTIMIZE TABLE

### データ不整合
- 外部キー制約違反がないか確認
- トランザクションログを確認
- 必要に応じてロールバック
