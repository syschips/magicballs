<?php
/**
 * ルーム一覧取得API
 * 
 * 参加可能なルームの一覧を取得する
 * 
 * @endpoint GET /api/rooms/list.php
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property array rooms ルーム一覧
 *     @property string room_id ルームID（VARCHAR(32)）
 *     @property string room_name ルーム名
 *     @property int max_players 最大プレイヤー数
 *     @property int current_players 現在のプレイヤー数
 *     @property string status ルーム状態 ('waiting', 'playing', 'finished')
 *     @property int game_time ゲーム時間（秒）
 *     @property string created_at 作成日時
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 *   - room_name: VARCHAR(100)
 *   - max_players: INT
 *   - current_players: INT
 *   - status: ENUM('waiting', 'playing', 'finished')
 *   - game_time: INT DEFAULT 180
 * 
 * @note status='waiting'のルームのみ返す（最大50件）
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        $query = "SELECT room_id, room_name, max_players, current_players, status, game_time, game_mode, created_at 
                  FROM game_rooms 
                  WHERE status = 'waiting' 
                  ORDER BY created_at DESC 
                  LIMIT 50";
        $stmt = $db->prepare($query);
        $stmt->execute();
        
        $rooms = [];
        while ($row = $stmt->fetch()) {
            $rooms[] = [
                "room_id" => $row['room_id'],
                "room_name" => $row['room_name'],
                "max_players" => (int)$row['max_players'],
                "current_players" => (int)$row['current_players'],
                "status" => $row['status'],
                "game_time" => (int)$row['game_time'],
                "game_mode" => $row['game_mode'],
                "created_at" => $row['created_at']
            ];
        }
        
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "rooms" => $rooms,
            "count" => count($rooms)
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server error"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "GETメソッドのみ許可されています"]);
}
