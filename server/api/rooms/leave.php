<?php
/**
 * ルーム退出API
 * 
 * プレイヤーをルームから退出させ、ルームが空になった場合は削除する
 * 
 * @endpoint POST /api/rooms/leave.php
 * 
 * @param string room_id ルームID（VARCHAR(32)）
 * @param int player_id プレイヤーID
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property string message メッセージ
 * 
 * @database room_participants テーブル
 *   - room_id: VARCHAR(32) NOT NULL
 *   - player_id: INT NOT NULL
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 *   - current_players: INT
 * 
 * @note 参加者が0人になったルームは自動的に削除される
 * @note ブラウザ閉じる/更新時にbeforeunloadイベントから呼ばれる
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    // JSONデコードエラーチェック
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Invalid JSON data"]);
        exit();
    }
    
    if (!empty($data->room_id) && !empty($data->player_id)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            // トランザクション開始
            $db->beginTransaction();
            
            // 退出するプレイヤーがホストかどうかを確認
            $host_check_query = "SELECT host_player_id FROM game_rooms WHERE room_id = :room_id";
            $host_check_stmt = $db->prepare($host_check_query);
            $host_check_stmt->bindParam(':room_id', $data->room_id);
            $host_check_stmt->execute();
            $room = $host_check_stmt->fetch(PDO::FETCH_ASSOC);
            
            $is_host_leaving = ($room && $room['host_player_id'] == $data->player_id);
            
            // 参加者から削除
            $delete_query = "DELETE FROM room_participants 
                             WHERE room_id = :room_id AND player_id = :player_id";
            $delete_stmt = $db->prepare($delete_query);
            $delete_stmt->bindParam(':room_id', $data->room_id);
            $delete_stmt->bindParam(':player_id', $data->player_id);
            $delete_stmt->execute();
            
            if ($delete_stmt->rowCount() > 0) {
                // ホストが退出した場合、次のプレイヤーをホストに昇格
                if ($is_host_leaving) {
                    // 残っている最初の人間プレイヤー（CPU以外）を新ホストに
                    $new_host_query = "SELECT player_id FROM room_participants 
                                       WHERE room_id = :room_id AND is_cpu = 0 
                                       ORDER BY joined_at ASC LIMIT 1";
                    $new_host_stmt = $db->prepare($new_host_query);
                    $new_host_stmt->bindParam(':room_id', $data->room_id);
                    $new_host_stmt->execute();
                    $new_host = $new_host_stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($new_host) {
                        // 新ホストを設定
                        $update_host_query = "UPDATE game_rooms 
                                              SET host_player_id = :new_host_id 
                                              WHERE room_id = :room_id";
                        $update_host_stmt = $db->prepare($update_host_query);
                        $update_host_stmt->bindParam(':new_host_id', $new_host['player_id']);
                        $update_host_stmt->bindParam(':room_id', $data->room_id);
                        $update_host_stmt->execute();
                        
                        // 新ホストの準備完了状態をリセット（ホストには準備完了の概念がない）
                        $reset_ready_query = "UPDATE room_participants 
                                              SET is_ready = 0 
                                              WHERE room_id = :room_id AND player_id = :new_host_id";
                        $reset_ready_stmt = $db->prepare($reset_ready_query);
                        $reset_ready_stmt->bindParam(':room_id', $data->room_id);
                        $reset_ready_stmt->bindParam(':new_host_id', $new_host['player_id']);
                        $reset_ready_stmt->execute();
                    }
                }
                // ルームの参加者数を減らす
                $update_query = "UPDATE game_rooms 
                                 SET current_players = (
                                     SELECT COUNT(*) FROM room_participants 
                                     WHERE room_id = :room_id
                                 )
                                 WHERE room_id = :room_id2";
                $update_stmt = $db->prepare($update_query);
                $update_stmt->bindParam(':room_id', $data->room_id);
                $update_stmt->bindParam(':room_id2', $data->room_id);
                $update_stmt->execute();
                
                // 参加者が0人になったらルームを削除
                $check_query = "SELECT current_players FROM game_rooms WHERE room_id = :room_id";
                $check_stmt = $db->prepare($check_query);
                $check_stmt->bindParam(':room_id', $data->room_id);
                $check_stmt->execute();
                $room = $check_stmt->fetch();
                
                if ($room && $room['current_players'] == 0) {
                    $delete_room_query = "DELETE FROM game_rooms WHERE room_id = :room_id";
                    $delete_room_stmt = $db->prepare($delete_room_query);
                    $delete_room_stmt->bindParam(':room_id', $data->room_id);
                    $delete_room_stmt->execute();
                }
                
                // トランザクションコミット
                $db->commit();
                
                http_response_code(200);
                echo json_encode([
                    "success" => true,
                    "message" => "ルームから退出しました"
                ]);
            } else {
                // トランザクションロールバック
                $db->rollBack();
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "参加者が見つかりません"]);
            }
        } catch (Exception $e) {
            // トランザクションロールバック
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Server error"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ルームIDとプレイヤーIDが必要です"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
