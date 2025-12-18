<?php
/**
 * 準備完了状態更新API
 * 
 * プレイヤーの準備完了状態を更新し、全員準備完了時にゲームを開始する
 * 
 * @endpoint POST /api/rooms/ready.php
 * 
 * @param string room_id ルームID（VARCHAR(32)）
 * @param int player_id プレイヤーID
 * @param bool is_ready 準備完了状態
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property bool all_ready 全員準備完了かどうか
 *   @property string message メッセージ
 * 
 * @database room_participants テーブル
 *   - room_id: VARCHAR(32) NOT NULL
 *   - player_id: INT NOT NULL
 *   - is_ready: BOOLEAN DEFAULT FALSE
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 *   - status: ENUM('waiting', 'playing', 'finished')
 *   - started_at: TIMESTAMP NULL
 * 
 * @note 全員がis_ready=trueになると、game_rooms.statusを'playing'に更新
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once '../config/database.php';

// OPTIONSリクエストへの対応
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// POSTメソッドのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);

// JSONデコードエラーチェック
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
    exit();
}

$room_id = isset($data['room_id']) ? $data['room_id'] : '';
$player_id = isset($data['player_id']) ? (int)$data['player_id'] : 0;
$is_ready = isset($data['is_ready']) ? (bool)$data['is_ready'] : false;

if (empty($room_id) || $player_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
    exit();
}

try {
    $database = new Database();
    $db = $database->getConnection();
    
    // トランザクション開始
    $db->beginTransaction();
    
    // 準備状態を更新
    $stmt = $db->prepare("
        UPDATE room_participants 
        SET is_ready = :is_ready 
        WHERE room_id = :room_id AND player_id = :player_id
    ");
    $ready_value = $is_ready ? 1 : 0;
    $stmt->bindParam(':is_ready', $ready_value);
    $stmt->bindParam(':room_id', $room_id);
    $stmt->bindParam(':player_id', $player_id);
    $stmt->execute();
    
    // 全員（人間プレイヤーのみ、CPUを除く）が準備完了かチェック
    $stmt = $db->prepare("
        SELECT COUNT(*) as total,
               SUM(CASE WHEN is_ready = 1 THEN 1 ELSE 0 END) as ready_count
        FROM room_participants
        WHERE room_id = :room_id AND is_cpu = 0
    ");
    $stmt->bindParam(':room_id', $room_id);
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $all_ready = ($result['total'] > 0 && $result['total'] == $result['ready_count']);
    
    // 全員準備完了なら、ルームのステータスを'playing'に変更
    if ($all_ready) {
        $stmt = $db->prepare("
            UPDATE game_rooms 
            SET status = 'playing', started_at = NOW()
            WHERE room_id = :room_id AND status = 'waiting'
        ");
        $stmt->bindParam(':room_id', $room_id);
        $stmt->execute();
    }
    
    // トランザクションをコミット
    $db->commit();
    
    echo json_encode([
        'success' => true, 
        'message' => 'Ready status updated',
        'all_ready' => $all_ready
    ]);
    
} catch (PDOException $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
?>
