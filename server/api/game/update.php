<?php
/**
 * ゲーム状態更新API
 * 
 * プレイヤーの入力やゲーム状態をサーバーに保存する
 * ホストがゲームループで定期的に送信
 * 
 * @endpoint POST /api/game/update.php
 * 
 * @param string room_id ルームID（VARCHAR(32)）
 * @param int player_id プレイヤーID
 * @param object state_data ゲーム状態データ（JSONオブジェクト）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property string message メッセージ
 * 
 * @database game_state テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 *   - state_json: TEXT NOT NULL (JSON文字列)
 *   - updated_at: TIMESTAMP
 * 
 * @note ホストのみが状態を更新できる
 * @note game_stateテーブルにはroom_idごとに1レコードのみ保存（REPLACE INTO使用）
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
$room_id = isset($data['room_id']) ? $data['room_id'] : '';
$player_id = isset($data['player_id']) ? (int)$data['player_id'] : 0;
$state_data = isset($data['state_data']) ? $data['state_data'] : null;

if (empty($room_id) || $player_id <= 0 || !$state_data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
    exit();
}

try {
    $database = new Database();
    $db = $database->getConnection();
    
    // ゲーム状態を更新
    $stmt = $db->prepare("
        INSERT INTO game_state (room_id, player_id, state_data, updated_at)
        VALUES (:room_id, :player_id, :state_data, NOW())
        ON DUPLICATE KEY UPDATE 
            state_data = VALUES(state_data),
            updated_at = NOW()
    ");
    $state_json = json_encode($state_data);
    $stmt->bindParam(':room_id', $room_id);
    $stmt->bindParam(':player_id', $player_id, PDO::PARAM_INT);
    $stmt->bindParam(':state_data', $state_json);
    $stmt->execute();
    
    echo json_encode(['success' => true, 'message' => 'State updated']);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
