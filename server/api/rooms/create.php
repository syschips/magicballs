<?php
/**
 * ルーム作成API
 * 
 * 新しいゲームルームを作成し、作成者を自動的に参加させる
 * 
 * @endpoint POST /api/rooms/create.php
 * 
 * @param int player_id ホストプレイヤーID
 * @param string|null room_name ルーム名（省略時は"Room XXXXXXXX"）
 * @param int|null max_players 最大プレイヤー数（デフォルト: 6）
 * @param int|null game_time ゲーム時間（秒、デフォルト: 180）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property string room_id 作成されたルームID（VARCHAR(32) 16進数）
 *   @property string room_name ルーム名
 *   @property int max_players 最大プレイヤー数
 *   @property string message メッセージ
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY (bin2hex(random_bytes(16))で生成)
 *   - room_name: VARCHAR(100)
 *   - max_players: INT DEFAULT 4
 *   - current_players: INT DEFAULT 0
 *   - host_player_id: INT NOT NULL (FK -> players.player_id)
 *   - game_time: INT DEFAULT 180
 *   - status: ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting'
 * 
 * @database room_participants テーブル
 *   - room_id: VARCHAR(32) NOT NULL (FK -> game_rooms.room_id)
 *   - player_id: INT NOT NULL (FK -> players.player_id)
 *   - player_number: INT NOT NULL
 *   - ball_type: ENUM('kuro', 'shiro', 'kiiro') DEFAULT 'kuro'
 *   - is_ready: BOOLEAN DEFAULT FALSE
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
    
    if (!empty($data->player_id)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            // ルームIDを生成
            $room_id = bin2hex(random_bytes(16));
            $room_name = !empty($data->room_name) ? $data->room_name : "Room " . substr($room_id, 0, 8);
            $max_players = !empty($data->max_players) ? (int)$data->max_players : 6;
            
            // ゲーム時間を取得（デフォルト180秒）
            $game_time = !empty($data->game_time) ? (int)$data->game_time : 180;
            
            // ルーム作成（作成者をホストとして設定）
            $query = "INSERT INTO game_rooms (room_id, room_name, max_players, current_players, host_player_id, game_time, status) 
                      VALUES (:room_id, :room_name, :max_players, 1, :host_player_id, :game_time, 'waiting')";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':room_id', $room_id);
            $stmt->bindParam(':room_name', $room_name);
            $stmt->bindParam(':max_players', $max_players);
            $stmt->bindParam(':host_player_id', $data->player_id);
            $stmt->bindParam(':game_time', $game_time);
            
            if ($stmt->execute()) {
                // 作成者を参加者として追加
                $participant_query = "INSERT INTO room_participants 
                                      (room_id, player_id, player_number, ball_type, rate_before) 
                                      SELECT :room_id, :player_id, 1, 'kuro', current_rate 
                                      FROM players WHERE player_id = :player_id2";
                $participant_stmt = $db->prepare($participant_query);
                $participant_stmt->bindParam(':room_id', $room_id);
                $participant_stmt->bindParam(':player_id', $data->player_id);
                $participant_stmt->bindParam(':player_id2', $data->player_id);
                $participant_stmt->execute();
                
                // ルーム作成をログに記録
                $logger->logRoom('create', $room_id, $data->player_id, [
                    'room_name' => $room_name,
                    'max_players' => $max_players,
                    'game_time' => $game_time
                ]);
                
                http_response_code(201);
                echo json_encode([
                    "success" => true,
                    "message" => "ルーム作成成功",
                    "room" => [
                        "room_id" => $room_id,
                        "room_name" => $room_name,
                        "max_players" => $max_players,
                        "current_players" => 1,
                        "status" => "waiting"
                    ]
                ]);
            } else {
                $logger->logError('Failed to create room', 'rooms/create.php');
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "ルーム作成に失敗しました"]);
            }
        } catch (Exception $e) {
            $logger->logError('Room creation error', 'rooms/create.php', $e);
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Server error"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "プレイヤーIDが必要です"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
