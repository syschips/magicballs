<?php
/**
 * ルーム参加API
 * 
 * 既存のルームにプレイヤーを参加させる
 * 
 * @endpoint POST /api/rooms/join.php
 * 
 * @param string room_id ルームID（VARCHAR(32) 16進数文字列）
 * @param int player_id プレイヤーID
 * @param string ball_type ボールタイプ（'kuro', 'shiro', 'kiiro'）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property string room_id ルームID
 *   @property int player_number 割り当てられたプレイヤー番号
 *   @property string message メッセージ
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 *   - max_players: INT
 *   - current_players: INT
 *   - status: ENUM('waiting', 'playing', 'finished')
 * 
 * @database room_participants テーブル
 *   - room_id: VARCHAR(32) NOT NULL
 *   - player_id: INT NOT NULL
 *   - player_number: INT NOT NULL
 *   - ball_type: ENUM('kuro', 'shiro', 'kiiro')
 *   - rate_before: INT (参加時のレート)
 * 
 * @note ルームが満員、またはstatus='playing'の場合は参加できない
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
            
            // ルームの存在と状態を確認（ロック取得）
            $room_query = "SELECT room_id, max_players, current_players, status 
                           FROM game_rooms WHERE room_id = :room_id LIMIT 1 FOR UPDATE";
            $room_stmt = $db->prepare($room_query);
            $room_stmt->bindParam(':room_id', $data->room_id);
            $room_stmt->execute();
            
            if ($room_stmt->rowCount() === 0) {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "ルームが見つかりません"]);
                exit();
            }
            
            $room = $room_stmt->fetch();
            
            if ($room['status'] !== 'waiting') {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "このルームはプレイ中または終了しています"]);
                exit();
            }
            
            if ($room['current_players'] >= $room['max_players']) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "ルームが満員です"]);
                exit();
            }
            
            // 既にこのプレイヤーが参加しているかチェック
            $check_query = "SELECT player_number FROM room_participants 
                           WHERE room_id = :room_id AND player_id = :player_id LIMIT 1";
            $check_stmt = $db->prepare($check_query);
            $check_stmt->bindParam(':room_id', $data->room_id);
            $check_stmt->bindParam(':player_id', $data->player_id);
            $check_stmt->execute();
            
            if ($check_stmt->rowCount() > 0) {
                // 既に参加済みの場合は、そのプレイヤー番号を返す
                $existing = $check_stmt->fetch();
                $db->commit();
                http_response_code(200);
                echo json_encode([
                    "success" => true,
                    "message" => "既に参加済みです",
                    "player_number" => $existing['player_number']
                ]);
                exit();
            }
            
            // 次のプレイヤー番号を取得
            $player_number = $room['current_players'] + 1;
            
            // ボールタイプの取得（デフォルト: kuro）
            $ball_type = !empty($data->ball_type) ? $data->ball_type : 'kuro';
            
            // 参加者として追加
            $participant_query = "INSERT INTO room_participants 
                                  (room_id, player_id, player_number, ball_type, rate_before) 
                                  SELECT :room_id, :player_id, :player_number, :ball_type, current_rate 
                                  FROM players WHERE player_id = :player_id2";
            $participant_stmt = $db->prepare($participant_query);
            $participant_stmt->bindParam(':room_id', $data->room_id);
            $participant_stmt->bindParam(':player_id', $data->player_id);
            $participant_stmt->bindParam(':player_number', $player_number);
            $participant_stmt->bindParam(':ball_type', $ball_type);
            $participant_stmt->bindParam(':player_id2', $data->player_id);
            
            if ($participant_stmt->execute()) {
                // ルームの参加者数を更新
                $update_query = "UPDATE game_rooms SET current_players = current_players + 1 
                                 WHERE room_id = :room_id";
                $update_stmt = $db->prepare($update_query);
                $update_stmt->bindParam(':room_id', $data->room_id);
                $update_stmt->execute();
                
                // トランザクションコミット
                $db->commit();
                
                http_response_code(200);
                echo json_encode([
                    "success" => true,
                    "message" => "ルーム参加成功",
                    "player_number" => $player_number
                ]);
            } else {
                // トランザクションロールバック
                $db->rollBack();
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "参加に失敗しました"]);
            }
        } catch (Exception $e) {
            // トランザクションロールバック
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode([
                "success" => false, 
                "message" => "サーバーエラー: " . $e->getMessage(),
                "error_detail" => $e->getMessage()
            ]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ルームIDとプレイヤーIDが必要です"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
