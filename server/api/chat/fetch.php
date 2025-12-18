<?php
/**
 * チャットメッセージ取得API
 * 
 * 指定ルームの最新メッセージを取得（最大100件）
 * プレイヤー情報も結合して返す
 * 
 * @endpoint GET /api/chat/fetch.php?room_id=xxx&limit=100
 * @param string room_id ルームID
 * @param int limit 取得件数（デフォルト100、最大100）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property array messages メッセージ一覧
 *     @property int message_id メッセージID
 *     @property string room_id ルームID
 *     @property int player_id プレイヤーID（システムメッセージはnull）
 *     @property string display_name 表示名
 *     @property string message_text メッセージ本文
 *     @property bool is_system システムメッセージフラグ
 *     @property string sent_at 送信日時
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!isset($_GET['room_id'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "room_id is required"]);
        exit;
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        $room_id = $_GET['room_id'];
        $limit = min(isset($_GET['limit']) ? intval($_GET['limit']) : 100, 100);
        
        // メッセージ取得（プレイヤー情報結合）
        $query = "SELECT rm.message_id, rm.room_id, rm.player_id, 
                         COALESCE(p.display_name, 'システム') as display_name,
                         rm.message_text, rm.is_system, rm.sent_at
                  FROM room_messages rm
                  LEFT JOIN players p ON rm.player_id = p.player_id
                  WHERE rm.room_id = :room_id
                  ORDER BY rm.sent_at DESC
                  LIMIT :limit";
        
        $stmt = $db->prepare($query);
        $stmt->bindParam(':room_id', $room_id);
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 時系列順に並び替え（古い順）
        $messages = array_reverse($messages);
        
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "messages" => $messages,
            "count" => count($messages)
        ]);
    } catch (PDOException $e) {
        error_log("Chat fetch error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
}
?>
