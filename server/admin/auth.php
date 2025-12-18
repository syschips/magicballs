<?php
/**
 * バックオフィス 認証処理
 */
session_start();

require_once '../api/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit();
}

$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

if (empty($username) || empty($password)) {
    $_SESSION['login_error'] = 'ユーザー名とパスワードを入力してください';
    header('Location: index.php');
    exit();
}

try {
    // データベース設定ファイルを読み込み
    $configPath = __DIR__ . '/../api/config/config.php';
    if (!file_exists($configPath)) {
        throw new Exception('設定ファイルが見つかりません');
    }
    $config = require $configPath;
    
    // データベース認証情報と照合
    $db_username = $config['db_user'] ?? '';
    $db_password = $config['db_pass'] ?? '';
    
    if ($username === $db_username && $password === $db_password) {
        // 認証成功
        $database = new Database();
        $db = $database->getConnection();
        
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_username'] = $username;
        $_SESSION['admin_display_name'] = 'Database Administrator';
        
        // ログイン記録
        $logQuery = "INSERT INTO system_logs (log_level, category, message, context, ip_address) 
                     VALUES ('INFO', 'ADMIN_AUTH', 'Admin login successful (DB user)', 'admin/auth.php', :ip)";
        $logStmt = $db->prepare($logQuery);
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $logStmt->bindParam(':ip', $ip);
        $logStmt->execute();
        
        header('Location: dashboard.php');
        exit();
    } else {
        // 認証失敗
        $_SESSION['login_error'] = 'ユーザー名またはパスワードが正しくありません';
        
        // 失敗を記録
        try {
            $database = new Database();
            $db = $database->getConnection();
            $logQuery = "INSERT INTO system_logs (log_level, category, message, context, ip_address) 
                         VALUES ('WARNING', 'ADMIN_AUTH', 'Admin login failed (invalid DB credentials)', 'admin/auth.php', :ip)";
            $logStmt = $db->prepare($logQuery);
            $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
            $logStmt->bindParam(':ip', $ip);
            $logStmt->execute();
        } catch (Exception $e) {
            // ログ記録失敗は無視
        }
        
        header('Location: index.php');
        exit();
    }
} catch (Exception $e) {
    $_SESSION['login_error'] = 'システムエラーが発生しました';
    error_log('Admin auth error: ' . $e->getMessage());
    header('Location: index.php');
    exit();
}
