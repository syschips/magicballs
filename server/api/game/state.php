<?php
/**
 * ゲーム状態同期API
 * 
 * 現在のゲーム状態、ルーム情報、参加者一覧を取得する
 * 待機画面でのポーリングに使用
 * 
 * @endpoint GET /api/game/state.php
 * 
 * @param string room_id ルームID（VARCHAR(32) GETパラメータ）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property object room ルーム情報
 *     @property string room_id ルームID
 *     @property string room_name ルーム名
 *     @property string status 状態 ('waiting', 'playing', 'finished')
 *     @property int current_players 現在のプレイヤー数
 *     @property int max_players 最大プレイヤー数
 *     @property int game_time ゲーム時間
 *   @property array participants 参加者一覧
 *     @property int player_id プレイヤーID
 *     @property string display_name 表示名
 *     @property string ball_type ボールタイプ
 *     @property bool is_ready 準備完了フラグ
 *   @property object|null game_state ゲーム状態（playing時のみ）
 * 
 * @database game_rooms テーブル
 *   - room_id: VARCHAR(32) PRIMARY KEY
 * 
 * @database room_participants テーブル
 *   - room_id: VARCHAR(32) NOT NULL
 *   - player_id: INT NOT NULL
 *   - ball_type: ENUM('kuro', 'shiro', 'kiiro')
 *   - is_ready: BOOLEAN
 * 
 * @database players テーブル
 *   - player_id: INT PRIMARY KEY
 *   - display_name: VARCHAR(50) NOT NULL
 * 
 * @note 待機画面で100msごとにポーリングされる
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

require_once '../config/database.php';

// OPTIONSリクエストへの対応
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// GETメソッドのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

$room_id = isset($_GET['room_id']) ? $_GET['room_id'] : '';

if (empty($room_id)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'room_id is required']);
    exit();
}

try {
    $database = new Database();
    $db = $database->getConnection();
    
    // ルーム情報取得
    $stmt = $db->prepare("
        SELECT * FROM game_rooms 
        WHERE room_id = :room_id
    ");
    $stmt->bindParam(':room_id', $room_id);
    $stmt->execute();
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$room) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Room not found']);
        exit();
    }
    
    // 参加者情報取得
    $stmt = $db->prepare("
        SELECT rp.player_id, p.display_name, rp.ball_type, rp.is_ready
        FROM room_participants rp
        JOIN players p ON rp.player_id = p.player_id
        WHERE rp.room_id = :room_id
        ORDER BY rp.joined_at
    ");
    $stmt->bindParam(':room_id', $room_id);
    $stmt->execute();
    $participants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // ゲーム状態取得（全プレイヤーの状態）
    $game_state = null;
    if ($room['status'] === 'playing') {
        $stmt = $db->prepare("
            SELECT player_id, state_data, updated_at 
            FROM game_state 
            WHERE room_id = :room_id
        ");
        $stmt->bindParam(':room_id', $room_id);
        $stmt->execute();
        $state_rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if ($state_rows) {
            $game_state = [];
            foreach ($state_rows as $row) {
                $game_state[$row['player_id']] = json_decode($row['state_data'], true);
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'room' => [
            'room_id' => $room['room_id'],
            'room_name' => $room['room_name'],
            'status' => $room['status'],
            'current_players' => $room['current_players'],
            'max_players' => $room['max_players'],
            'game_time' => $room['game_time'],
            'host_player_id' => $room['host_player_id']
        ],
        'participants' => $participants,
        'game_state' => $game_state
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>
