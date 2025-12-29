# MagicBall - インストール方法

## 必要環境

### サーバー要件
- **Webサーバー**: Apache 2.4+ または Nginx 1.18+
- **PHP**: 7.4 以上（8.0+ 推奨）
- **MySQL**: 5.7 以上（8.0+ 推奨）
- **拡張モジュール**:
  - php-pdo
  - php-mysql
  - php-json
  - php-mbstring

### クライアント要件
- **ブラウザ**:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+
- **JavaScript**: 有効化必須
- **WebRTC**: 対応ブラウザ必須

## インストール手順

### 1. ファイルのダウンロード・配置

#### 方法A: Gitクローン
```bash
git clone https://github.com/your-repo/magicball.git
cd magicball
```

#### 方法B: ZIPダウンロード
1. プロジェクトのZIPファイルをダウンロード
2. Webサーバーのドキュメントルートに解凍

```bash
# 例: Apacheの場合
unzip magicball.zip -d /var/www/html/magicball
cd /var/www/html/magicball
```

### 2. ディレクトリ権限の設定

Webサーバーがログファイルを書き込めるよう権限を設定：

```bash
# server/logs ディレクトリの作成と権限設定
mkdir -p server/logs
chmod 755 server/logs

# server/api/config ディレクトリの権限設定（config.phpが作成される）
chmod 755 server/api/config
```

### 3. データベースの準備

#### MySQLにログイン
```bash
mysql -u root -p
```

#### データベースとユーザーの作成（推奨）
```sql
-- データベース作成
CREATE DATABASE magicball CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 専用ユーザー作成（本番環境推奨）
CREATE USER 'magicball_user'@'localhost' IDENTIFIED BY '強力なパスワード';

-- 権限付与
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX 
ON magicball.* TO 'magicball_user'@'localhost';

-- 権限の反映
FLUSH PRIVILEGES;

-- 終了
EXIT;
```

### 4. Webインストーラーの実行

ブラウザで以下のURLにアクセス：

```
http://your-domain/server/install.php
```

#### ステップ1: データベース接続設定
以下の情報を入力：
- **ホスト**: `localhost` （通常はlocalhost）
- **データベース名**: `magicball`
- **ユーザー名**: `magicball_user` （またはroot）
- **パスワード**: データベースユーザーのパスワード

「接続テスト」をクリックして接続を確認。

#### ステップ2: データベース初期化
「データベースを初期化」をクリック。

以下が自動的に実行されます：
- テーブル作成（8テーブル）
- インデックス作成
- サンプルデータ挿入（テストユーザー）

### 5. セキュリティ設定

#### install.phpの削除（重要）
```bash
# インストール完了後、必ず削除
rm server/install.php
```

#### config.phpのパーミッション設定
```bash
chmod 600 server/api/config/config.php
```

#### .htaccessの設定（Apache使用時）

**ルートディレクトリ（.htaccess）**:
```apache
# エラーページのカスタマイズ
ErrorDocument 404 /404.html
ErrorDocument 500 /500.html

# セキュリティヘッダー
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"
</IfModule>
```

**server/api/config/.htaccess**（設定ファイル保護）:
```apache
# config.phpへの直接アクセスを拒否
<Files "config.php">
    Require all denied
</Files>
```

**server/admin/.htaccess**（管理画面のIP制限 - オプション）:
```apache
# 特定IPのみアクセス許可
Order Deny,Allow
Deny from all
Allow from 192.168.1.100
Allow from 203.0.113.0/24
```

### 6. 動作確認

#### ゲーム画面へアクセス
```
http://your-domain/index.html
```

#### テストユーザーでログイン
- **ユーザー名**: `guest1`
- **パスワード**: `test123`

#### バックオフィスへアクセス
```
http://your-domain/server/admin/
```

同じテストユーザーでログイン可能。

## Nginx 設定例

**nginx.conf**（または site available設定）:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html/magicball;
    index index.html;

    # PHP処理
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.0-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # 設定ファイルへのアクセス拒否
    location ~ ^/server/api/config/config\.php$ {
        deny all;
    }

    # install.phpへのアクセス拒否（削除後）
    location ~ ^/server/install\.php$ {
        deny all;
    }

    # セキュリティヘッダー
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # ログ設定
    access_log /var/log/nginx/magicball_access.log;
    error_log /var/log/nginx/magicball_error.log;
}
```

設定反映：
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Apache 設定例

**httpd.conf** または **VirtualHost設定**:
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/html/magicball
    
    <Directory /var/www/html/magicball>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        DirectoryIndex index.html
    </Directory>
    
    # PHP設定
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/var/run/php/php8.0-fpm.sock|fcgi://localhost"
    </FilesMatch>
    
    # ログ設定
    ErrorLog ${APACHE_LOG_DIR}/magicball_error.log
    CustomLog ${APACHE_LOG_DIR}/magicball_access.log combined
</VirtualHost>
```

設定反映：
```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 定期メンテナンス設定

### Cron設定（古いルームの自動削除）

```bash
# Crontab編集
crontab -e

# 以下を追加（毎時0分に実行）
0 * * * * curl -X POST http://localhost/server/api/rooms/cleanup.php

# または、直接PHPで実行
0 * * * * /usr/bin/php /var/www/html/magicball/server/api/rooms/cleanup.php
```

### データベースバックアップ

```bash
# 毎日午前3時にバックアップ
0 3 * * * mysqldump -u magicball_user -p'password' magicball | gzip > /backup/magicball_$(date +\%Y\%m\%d).sql.gz

# 7日以上前のバックアップを削除
0 4 * * * find /backup -name "magicball_*.sql.gz" -mtime +7 -delete
```

## トラブルシューティング

### データベース接続エラー

**エラー**: "SQLSTATE[HY000] [2002] Connection refused"

**解決策**:
1. MySQLサービスが起動しているか確認
   ```bash
   sudo systemctl status mysql
   ```
2. ホスト名が正しいか確認（localhost または 127.0.0.1）
3. ポート番号を確認（デフォルト: 3306）

### PHP拡張モジュールエラー

**エラー**: "Call to undefined function PDO::__construct()"

**解決策**:
```bash
# Ubuntu/Debian
sudo apt-get install php-pdo php-mysql
sudo systemctl restart apache2

# CentOS/RHEL
sudo yum install php-pdo php-mysql
sudo systemctl restart httpd
```

### パーミッションエラー

**エラー**: "Permission denied" when creating config.php

**解決策**:
```bash
# server/api/config ディレクトリの所有者変更
sudo chown -R www-data:www-data server/api/config

# または Apache ユーザー
sudo chown -R apache:apache server/api/config
```

### WebRTC接続エラー

**症状**: プレイヤー間で接続できない

**解決策**:
1. ブラウザがWebRTCに対応しているか確認
2. HTTPSを使用（推奨）
3. ファイアウォールでUDP通信を許可
4. STUNサーバー設定（必要に応じて）

### 画像が表示されない

**症状**: キャラクターやボールが正しく表示されない

**解決策**:
1. `imgs/` ディレクトリにGIFファイルが存在するか確認
2. ブラウザのコンソールで画像読み込みエラーを確認
3. デバッグモードで動作確認: `http://your-domain/index.html?debug=on`
   - デバッグモードでは画像の代わりにシンプルな図形が表示されます
4. 画像ファイルのパーミッションを確認（644推奨）
   ```bash
   chmod 644 imgs/*.gif
   ```

## HTTPS化（推奨）

### Let's Encrypt（無料SSL証明書）

```bash
# Certbot インストール
sudo apt-get install certbot python3-certbot-apache

# 証明書取得（Apache）
sudo certbot --apache -d your-domain.com

# または Nginx
sudo certbot --nginx -d your-domain.com

# 自動更新設定
sudo certbot renew --dry-run
```

## 本番環境への移行

### 1. サンプルデータの削除
```sql
-- MySQLにログイン
mysql -u root -p magicball

-- サンプルユーザーを削除
DELETE FROM players WHERE username IN ('guest1', 'guest2', 'guest3', 'guest4');
```

### 2. エラー表示の無効化

**php.ini**:
```ini
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log
```

### 3. セキュリティ強化
- [ ] install.php の削除確認
- [ ] config.php のパーミッション確認（600）
- [ ] データベースユーザーの権限最小化
- [ ] HTTPSの有効化
- [ ] 管理画面のIP制限
- [ ] ファイアウォール設定
- [ ] 定期バックアップの設定

### 4. パフォーマンスチューニング

**php.ini**:
```ini
memory_limit = 256M
max_execution_time = 60
upload_max_filesize = 10M
post_max_size = 10M

# OPcache有効化
opcache.enable=1
opcache.memory_consumption=128
opcache.max_accelerated_files=10000
```

**MySQL（my.cnf）**:
```ini
[mysqld]
max_connections = 200
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
query_cache_size = 64M
```

## アップグレード

### 新バージョンへの更新

1. **バックアップ作成**
   ```bash
   # ファイルバックアップ
   tar -czf magicball_backup_$(date +%Y%m%d).tar.gz /var/www/html/magicball
   
   # DBバックアップ
   mysqldump -u root -p magicball > magicball_backup_$(date +%Y%m%d).sql
   ```

2. **新ファイルの配置**
   - config.php を保護
   - 新ファイルで上書き
   - config.php を戻す

3. **データベースマイグレーション**（必要な場合）
   ```bash
   mysql -u root -p magicball < migration_script.sql
   ```

4. **動作確認**
   - ログイン動作
   - ゲーム開始
   - チャット機能
   - バックオフィス

## サポート・ヘルプ

### ログ確認

**Webサーバーログ**:
```bash
# Apache
tail -f /var/log/apache2/error.log

# Nginx
tail -f /var/log/nginx/error.log
```

**PHPエラーログ**:
```bash
tail -f /var/log/php/error.log
```

**アプリケーションログ**:
バックオフィス（http://your-domain/server/admin/）で確認

### よくある質問

**Q: データベースが作成されない**
A: MySQL の権限を確認。CREATE DATABASE 権限が必要。

**Q: ゲームが開始されない**
A: ブラウザのコンソールログを確認。WebRTC接続エラーの可能性。

**Q: チャットが表示されない**
A: server/api/chat/ への書き込み権限を確認。

**Q: レートが更新されない**
A: server/api/game/finish.php のログを確認。

## 次のステップ

- [実装機能一覧](FEATURES.md) - ゲームの機能を確認
- [ファイル構成](FILE_STRUCTURE.md) - コード構造を理解
- [データベース構成](DATABASE.md) - DB設計を確認
- [バックオフィスREADME](../server/admin/README.md) - 管理画面の使い方

インストール完了後、楽しいゲーム体験を！🎱
