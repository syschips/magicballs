<?php
/**
 * チャットメッセージ送信API
 * 
 * プレイヤーまたはシステムからのメッセージを保存
 * NGワード検出時は「（禁止ワードにより削除）」を付加
 * 
 * @endpoint POST /api/chat/send.php
 * @param string room_id ルームID
 * @param int player_id プレイヤーID（システムメッセージの場合はnull）
 * @param string message_text メッセージ本文（TEXT型、サーバー側は無制限）
 * @param bool is_system システムメッセージかどうか
 * @param bool is_blocked NGワード検出フラグ（クライアント側で判定）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property int message_id 送信したメッセージID
 *   @property string message メッセージ
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    if (!isset($data->room_id) || !isset($data->message_text)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "room_id and message_text are required"]);
        exit;
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        $room_id = $data->room_id;
        $player_id = $data->player_id ?? null;
        $message_text = $data->message_text;
        $is_system = $data->is_system ?? false;
        $is_blocked = $data->is_blocked ?? false;
        
        // NGワード検出時はサーバー側にマーカーを付加
        if ($is_blocked && !$is_system) {
            $message_text .= "（禁止ワードにより削除）";
        }
        
        // メッセージを保存
        $query = "INSERT INTO room_messages (room_id, player_id, message_text, is_system) 
                  VALUES (:room_id, :player_id, :message_text, :is_system)";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':room_id', $room_id);
        $stmt->bindParam(':player_id', $player_id, $player_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(':message_text', $message_text);
        $stmt->bindParam(':is_system', $is_system, PDO::PARAM_BOOL);
        
        if ($stmt->execute()) {
            $message_id = $db->lastInsertId();
            
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message_id" => $message_id,
                "message" => "Message sent successfully"
            ]);
        } else {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Failed to save message"]);
        }
    } catch (PDOException $e) {
        error_log("Chat send error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
}
?>
