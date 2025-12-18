<?php
/**
 * ルームリセットAPI
 * POST /api/rooms/reset.php
 * ゲーム終了後、ルームを待機状態に戻して再度プレイ可能にする
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    if (!empty($data->room_id)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            $db->beginTransaction();
            
            // ルーム情報を取得
            $room_query = "SELECT room_id, status FROM game_rooms WHERE room_id = :room_id LIMIT 1";
            $room_stmt = $db->prepare($room_query);
            $room_stmt->bindParam(':room_id', $data->room_id);
            $room_stmt->execute();
            $room = $room_stmt->fetch();
            
            if (!$room) {
                throw new Exception("ルームが見つかりません");
            }
            
            // playing または finished ステータスからのみリセット可能
            if ($room['status'] !== 'finished' && $room['status'] !== 'playing') {
                throw new Exception("ゲームが開始または終了していません");
            }
            
            // ルームステータスを待機に戻す
            $update_room = "UPDATE game_rooms 
                           SET status = 'waiting', 
                               started_at = NULL, 
                               finished_at = NULL 
                           WHERE room_id = :room_id";
            $update_room_stmt = $db->prepare($update_room);
            $update_room_stmt->bindParam(':room_id', $data->room_id);
            $update_room_stmt->execute();
            
            // 参加者の準備状態と結果をリセット
            $reset_participants = "UPDATE room_participants 
                                   SET is_ready = FALSE, 
                                       result = NULL, 
                                       score = 0,
                                       rate_after = NULL
                                   WHERE room_id = :room_id";
            $reset_stmt = $db->prepare($reset_participants);
            $reset_stmt->bindParam(':room_id', $data->room_id);
            $reset_stmt->execute();
            
            // ゲーム状態データを削除
            $delete_state = "DELETE FROM game_state WHERE room_id = :room_id";
            $delete_stmt = $db->prepare($delete_state);
            $delete_stmt->bindParam(':room_id', $data->room_id);
            $delete_stmt->execute();
            
            $db->commit();
            
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "ルームをリセットしました",
                "room_id" => $data->room_id,
                "status" => "waiting"
            ]);
            
        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Server error"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ルームIDが必要です"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
