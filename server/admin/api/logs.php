<?php
/**
 * バックオフィス ログAPI
 */
session_start();

// 認証チェック
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized"]);
    exit();
}

require_once '../../api/config/database.php';

header("Content-Type: application/json; charset=UTF-8");

$action = $_GET['action'] ?? 'list';

try {
    $database = new Database();
    $db = $database->getConnection();
    
    switch ($action) {
        case 'list':
            // ログ一覧取得
            $page = max(1, intval($_GET['page'] ?? 1));
            $limit = min(100, max(10, intval($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;
            
            // フィルター条件
            $whereClauses = [];
            $params = [];
            
            if (!empty($_GET['level'])) {
                $whereClauses[] = "log_level = :level";
                $params[':level'] = $_GET['level'];
            }
            
            if (!empty($_GET['category'])) {
                $whereClauses[] = "category = :category";
                $params[':category'] = $_GET['category'];
            }
            
            if (!empty($_GET['player_id'])) {
                $whereClauses[] = "player_id = :player_id";
                $params[':player_id'] = intval($_GET['player_id']);
            }
            
            if (!empty($_GET['room_id'])) {
                $whereClauses[] = "room_id = :room_id";
                $params[':room_id'] = $_GET['room_id'];
            }
            
            if (!empty($_GET['keyword'])) {
                $whereClauses[] = "(message LIKE :keyword OR context LIKE :keyword)";
                $params[':keyword'] = '%' . $_GET['keyword'] . '%';
            }
            
            $whereSQL = !empty($whereClauses) ? 'WHERE ' . implode(' AND ', $whereClauses) : '';
            
            // 総件数取得
            $countQuery = "SELECT COUNT(*) as total FROM system_logs $whereSQL";
            $countStmt = $db->prepare($countQuery);
            foreach ($params as $key => $value) {
                $countStmt->bindValue($key, $value);
            }
            $countStmt->execute();
            $totalCount = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
            $totalPages = ceil($totalCount / $limit);
            
            // ログ取得
            $query = "SELECT log_id, log_level, category, message, context, player_id, room_id, 
                            ip_address, data, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
                     FROM system_logs 
                     $whereSQL
                     ORDER BY log_id DESC 
                     LIMIT :limit OFFSET :offset";
            
            $stmt = $db->prepare($query);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                "logs" => $logs,
                "page" => $page,
                "limit" => $limit,
                "total_count" => $totalCount,
                "total_pages" => $totalPages
            ]);
            break;
            
        case 'stats':
            // 統計情報取得
            $stats = [];
            
            // 24時間以内のエラー数
            $errorQuery = "SELECT COUNT(*) as cnt FROM system_logs 
                          WHERE log_level = 'ERROR' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
            $errorStmt = $db->query($errorQuery);
            $stats['error_count'] = $errorStmt->fetch(PDO::FETCH_ASSOC)['cnt'];
            
            // 24時間以内の警告数
            $warningQuery = "SELECT COUNT(*) as cnt FROM system_logs 
                            WHERE log_level = 'WARNING' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
            $warningStmt = $db->query($warningQuery);
            $stats['warning_count'] = $warningStmt->fetch(PDO::FETCH_ASSOC)['cnt'];
            
            // 総ログ数
            $totalQuery = "SELECT COUNT(*) as cnt FROM system_logs";
            $totalStmt = $db->query($totalQuery);
            $stats['total_count'] = $totalStmt->fetch(PDO::FETCH_ASSOC)['cnt'];
            
            echo json_encode($stats);
            break;
            
        case 'categories':
            // カテゴリ一覧取得
            $query = "SELECT DISTINCT category FROM system_logs ORDER BY category";
            $stmt = $db->query($query);
            $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            echo json_encode(["categories" => $categories]);
            break;
            
        default:
            http_response_code(400);
            echo json_encode(["error" => "Invalid action"]);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    error_log('Log API error: ' . $e->getMessage());
    echo json_encode(["error" => "Internal server error"]);
}
