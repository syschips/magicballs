<?php
/**
 * バックオフィス ログアウト処理
 */
session_start();

require_once '../api/config/database.php';

// ログアウト記録
if (isset($_SESSION['admin_user_id'])) {
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        $logQuery = "INSERT INTO system_logs (log_level, category, message, context, player_id, ip_address) 
                     VALUES ('INFO', 'ADMIN_AUTH', 'Admin logout', 'admin/logout.php', :player_id, :ip)";
        $logStmt = $db->prepare($logQuery);
        $logStmt->bindParam(':player_id', $_SESSION['admin_user_id']);
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $logStmt->bindParam(':ip', $ip);
        $logStmt->execute();
    } catch (Exception $e) {
        error_log('Logout log error: ' . $e->getMessage());
    }
}

// セッションを破棄
session_destroy();

header('Location: index.php');
exit();
