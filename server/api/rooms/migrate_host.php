<?php
/**
 * ホスト引き継ぎAPI
 * POST /api/rooms/migrate_host.php
 * ホストが切断した場合、次のプレイヤーにホスト権限を自動引き継ぎ
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/database.php';
require_once '../config/logger.php';

$logger = new Logger();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    if (!empty($data->room_id)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            $db->beginTransaction();
            
            // ルーム情報を取得（FOR UPDATE でロックして競合を防ぐ）
            $room_query = "SELECT room_id, host_player_id, status FROM game_rooms WHERE room_id = :room_id LIMIT 1 FOR UPDATE";
            $room_stmt = $db->prepare($room_query);
            $room_stmt->bindParam(':room_id', $data->room_id);
            $room_stmt->execute();
            $room = $room_stmt->fetch();
            
            if (!$room) {
                throw new Exception("ルームが見つかりません");
            }
            
            // 現在のホストの最終確認時刻をチェック（30秒以内ならホスト健在と判断）
            $check_query = "SELECT last_seen_at FROM room_participants 
                           WHERE room_id = :room_id AND player_id = :host_id";
            $check_stmt = $db->prepare($check_query);
            $check_stmt->bindParam(':room_id', $data->room_id);
            $check_stmt->bindParam(':host_id', $room['host_player_id']);
            $check_stmt->execute();
            $host_data = $check_stmt->fetch();
            
            if ($host_data) {
                $last_seen = strtotime($host_data['last_seen_at']);
                $now = time();
                
                // ホストが30秒以内に応答している場合、引き継ぎ不要
                if ($now - $last_seen < 30) {
                    $db->rollBack();
                    http_response_code(200);
                    echo json_encode([
                        "success" => true,
                        "migrated" => false,
                        "message" => "ホストは正常に応答しています",
                        "host_player_id" => (int)$room['host_player_id']
                    ]);
                    exit();
                }
            }
            
            // 次のホストを選出（参加者から次の人を選ぶ、FOR UPDATE でロック）
            $next_host_query = "SELECT player_id FROM room_participants 
                               WHERE room_id = :room_id 
                               AND player_id != :current_host 
                               AND is_cpu = FALSE
                               ORDER BY joined_at ASC 
                               LIMIT 1 FOR UPDATE";
            $next_host_stmt = $db->prepare($next_host_query);
            $next_host_stmt->bindParam(':room_id', $data->room_id);
            $next_host_stmt->bindParam(':current_host', $room['host_player_id']);
            $next_host_stmt->execute();
            $next_host = $next_host_stmt->fetch();
            
            if (!$next_host) {
                // 他に参加者がいない場合、ルームを削除
                $delete_room = "DELETE FROM game_rooms WHERE room_id = :room_id";
                $delete_stmt = $db->prepare($delete_room);
                $delete_stmt->bindParam(':room_id', $data->room_id);
                $delete_stmt->execute();
                
                $db->commit();
                http_response_code(200);
                echo json_encode([
                    "success" => true,
                    "migrated" => false,
                    "room_closed" => true,
                    "message" => "他に参加者がいないため、ルームを閉鎖しました"
                ]);
                exit();
            }
            
            // ホストを引き継ぎ
            $update_query = "UPDATE game_rooms SET host_player_id = :new_host WHERE room_id = :room_id";
            $update_stmt = $db->prepare($update_query);
            $update_stmt->bindParam(':new_host', $next_host['player_id']);
            $update_stmt->bindParam(':room_id', $data->room_id);
            $update_stmt->execute();
            
            // 旧ホストを参加者リストから削除
            $remove_old_host = "DELETE FROM room_participants 
                               WHERE room_id = :room_id AND player_id = :old_host";
            $remove_stmt = $db->prepare($remove_old_host);
            $remove_stmt->bindParam(':room_id', $data->room_id);
            $remove_stmt->bindParam(':old_host', $room['host_player_id']);
            $remove_stmt->execute();
            
            // 現在のプレイヤー数を更新
            $count_query = "SELECT COUNT(*) as cnt FROM room_participants WHERE room_id = :room_id";
            $count_stmt = $db->prepare($count_query);
            $count_stmt->bindParam(':room_id', $data->room_id);
            $count_stmt->execute();
            $count = $count_stmt->fetch()['cnt'];
            
            $update_count = "UPDATE game_rooms SET current_players = :count WHERE room_id = :room_id";
            $update_count_stmt = $db->prepare($update_count);
            $update_count_stmt->bindParam(':count', $count);
            $update_count_stmt->bindParam(':room_id', $data->room_id);
            $update_count_stmt->execute();
            
            $db->commit();
            
            // ホスト引き継ぎをログに記録
            $logger->logHostMigration(
                $data->room_id,
                $room['host_player_id'],
                $next_host['player_id']
            );
            
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "migrated" => true,
                "message" => "ホストを引き継ぎました",
                "old_host_id" => (int)$room['host_player_id'],
                "host_player_id" => (int)$next_host['player_id']
            ]);
            
        } catch (Exception $e) {
            $db->rollBack();
            $logger->logError('Host migration error', 'rooms/migrate_host.php', $e);
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
