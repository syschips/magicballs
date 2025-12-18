<?php
/**
 * ルームクリーンアップAPI
 * 
 * 安全な削除基準：
 * 1. 参加者が0人のルーム
 * 2. waiting状態で、全員のlast_seen_atが10分以上前
 * 3. finished状態で、30分以上放置
 * 
 * 注意：playing中のルームは削除しない
 * 
 * @endpoint POST /api/rooms/cleanup.php
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property int deleted 削除したルーム数
 *   @property string message メッセージ
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // 1. 参加者が0人のルームを削除
        $query1 = "DELETE FROM game_rooms WHERE current_players = 0";
        $stmt1 = $db->prepare($query1);
        $stmt1->execute();
        $deleted1 = $stmt1->rowCount();
        
        // 2. waiting状態で、全員が10分以上非アクティブなルームを削除
        // (最後のlast_seen_atが10分以上前)
        $query2 = "DELETE gr FROM game_rooms gr
                   WHERE gr.status = 'waiting'
                   AND gr.room_id NOT IN (
                       SELECT DISTINCT rp.room_id 
                       FROM room_participants rp
                       WHERE rp.last_seen_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                   )";
        $stmt2 = $db->prepare($query2);
        $stmt2->execute();
        $deleted2 = $stmt2->rowCount();
        
        // 3. finished状態で30分以上放置されたルームを削除
        $query3 = "DELETE FROM game_rooms 
                   WHERE status = 'finished' 
                   AND finished_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)";
        $stmt3 = $db->prepare($query3);
        $stmt3->execute();
        $deleted3 = $stmt3->rowCount();
        
        $total = $deleted1 + $deleted2 + $deleted3;
        
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "deleted" => $total,
            "details" => [
                "empty_rooms" => $deleted1,
                "inactive_waiting_rooms" => $deleted2,
                "old_finished_rooms" => $deleted3
            ],
            "message" => "{$total}個のルームを削除しました"
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server error"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
}
?>
