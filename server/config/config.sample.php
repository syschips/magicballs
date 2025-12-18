<?php
/**
 * データベース設定ファイル（サンプル）
 * このファイルをコピーして config.php を作成し、実際の接続情報を入力してください
 * 
 * コピーコマンド例:
 * Linux/Mac: cp config.sample.php config.php
 * Windows: copy config.sample.php config.php
 * 
 * セキュリティ注意:
 * - config.php は .gitignore に含まれているため Git にコミットされません
 * - ファイルパーミッションを 600 に設定してください（所有者のみ読み書き可能）
 * - データベースユーザーには必要最小限の権限のみを付与してください
 */

return [
    'db_host' => 'localhost',         // データベースサーバーのホスト名
    'db_name' => 'magicball',         // データベース名（英数字とアンダースコアのみ）
    'db_user' => 'root',              // データベースユーザー名
    'db_pass' => '',                  // データベースパスワード（空の場合はパスワードなし）
    'db_charset' => 'utf8mb4'         // 文字セット（utf8mb4推奨）
];
