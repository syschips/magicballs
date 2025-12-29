
<?php
/**
 * WebRTCシグナリングAPI
 * 
 * WebRTC接続確立に必要なOffer/Answer/ICE Candidateを交換
 * 
 * @endpoint POST /api/rooms/signaling.php - シグナリングデータを送信
 * @endpoint GET /api/rooms/signaling.php - 自分宛のシグナリングデータを取得
 * 
 * POST パラメータ:
 *   @param string room_id ルームID
 *   @param int player_id プレイヤーID
 *   @param string type シグナリングタイプ ('offer', 'answer', 'candidate')
 *   @param object data シグナリングデータ（JSON）
 * 
 * GET パラメータ:
 *   @param string room_id ルームID
 *   @param int player_id プレイヤーID
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property string message メッセージ
 *   @property array signals シグナリングデータ配列（GETの場合）
 * 
 * @note シグナリングはルーム参加者間でのみ交換される
 * @note データは5分で自動削除される想定（TTL実装推奨）
 */

require_once '../config/logger.php';
require_once '../config/database.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// OPTIONSリクエストへの対応
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/**
 * POSTメソッド: シグナリングデータを送信
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $room_id = isset($data['room_id']) ? $data['room_id'] : '';
    $player_id = isset($data['player_id']) ? (int)$data['player_id'] : 0;
    $type = isset($data['type']) ? $data['type'] : '';
    $signal_data = isset($data['data']) ? $data['data'] : null;
    
    if (empty($room_id) || $player_id <= 0 || empty($type) || !$signal_data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        exit();
    }
    
    // typeのバリデーション
    if (!in_array($type, ['offer', 'answer', 'candidate'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid signal type']);
        exit();
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // プレイヤーがルームに参加しているか確認
        $check_query = "SELECT player_id FROM room_participants 
                        WHERE room_id = :room_id AND player_id = :player_id";
        $check_stmt = $db->prepare($check_query);
        $check_stmt->bindParam(':room_id', $room_id);
        $check_stmt->bindParam(':player_id', $player_id);
        $check_stmt->execute();
        
        if ($check_stmt->rowCount() === 0) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Player not in room']);
            exit();
        }
        
        // シグナリングデータを保存
        $signal_json = json_encode($signal_data);
        
        if ($type === 'offer') {
            $update_query = "UPDATE room_participants 
                            SET webrtc_offer = :signal_data 
                            WHERE room_id = :room_id AND player_id = :player_id";
        } elseif ($type === 'answer') {
            $update_query = "UPDATE room_participants 
                            SET webrtc_answer = :signal_data 
                            WHERE room_id = :room_id AND player_id = :player_id";
        } else { // candidate
            // ICE Candidateは複数追加される可能性があるので、プレイヤーごとに配列として保存
            // 形式: { "playerId": [candidate1, candidate2, ...] }
            $get_query = "SELECT webrtc_candidates FROM room_participants 
                         WHERE room_id = :room_id AND player_id = :player_id";
            $get_stmt = $db->prepare($get_query);
            $get_stmt->bindParam(':room_id', $room_id);
            $get_stmt->bindParam(':player_id', $player_id);
            $get_stmt->execute();
            
            $current = $get_stmt->fetch(PDO::FETCH_ASSOC);
            $candidatesObj = $current['webrtc_candidates'] ? json_decode($current['webrtc_candidates'], true) : [];
            
            // このプレイヤーの候補配列を初期化（なければ空配列）
            if (!isset($candidatesObj[$player_id])) {
              $candidatesObj[$player_id] = [];
            }
            // 新しい候補を追加
            $candidatesObj[$player_id][] = $signal_data;
            
            $signal_json = json_encode($candidatesObj);
            
            $update_query = "UPDATE room_participants 
                            SET webrtc_candidates = :signal_data 
                            WHERE room_id = :room_id AND player_id = :player_id";
        }
        
        $update_stmt = $db->prepare($update_query);
        $update_stmt->bindParam(':signal_data', $signal_json);
        $update_stmt->bindParam(':room_id', $room_id);
        $update_stmt->bindParam(':player_id', $player_id);
        $update_stmt->execute();
        
        echo json_encode([
            'success' => true, 
            'message' => 'Signal data stored',
            'type' => $type
        ]);
        
    } catch (Exception $e) {
        $logger = new Logger();
        $logger->logError('signaling.php: エラー', '', $e);
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'message' => 'Server error'
        ]);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    /**
     * GETメソッド: 他のプレイヤーからのシグナリングデータを取得
     */
    $room_id = isset($_GET['room_id']) ? $_GET['room_id'] : '';
    $player_id = isset($_GET['player_id']) ? (int)$_GET['player_id'] : 0;
    
    if (empty($room_id) || $player_id <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        exit();
    }
    
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        // ルーム内の他の参加者のシグナリングデータを取得
        $query = "SELECT player_id, webrtc_offer, webrtc_answer, webrtc_candidates 
                  FROM room_participants 
                  WHERE room_id = :room_id AND player_id != :player_id";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':room_id', $room_id);
        $stmt->bindParam(':player_id', $player_id);
        $stmt->execute();
        
        $signals = [];
        $sendersToClear = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $candidatesObj = $row['webrtc_candidates'] ? json_decode($row['webrtc_candidates'], true) : [];
            
            // このプレイヤーからの候補を取得
            $myCandidates = isset($candidatesObj[$row['player_id']]) ? $candidatesObj[$row['player_id']] : [];
            
            $signal = [
                'player_id' => (int)$row['player_id'],
                'offer' => $row['webrtc_offer'] ? json_decode($row['webrtc_offer'], true) : null,
                'answer' => $row['webrtc_answer'] ? json_decode($row['webrtc_answer'], true) : null,
                'candidates' => $myCandidates
            ];
            
            // nullではないデータのみ含める
            if ($signal['offer'] || $signal['answer'] || !empty($signal['candidates'])) {
                $signals[] = $signal;
                $sendersToClear[] = (int)$row['player_id'];
            }
        }

        // 取得後にシグナルをクリアして重複配信を防ぐ
        if (!empty($sendersToClear)) {
            $inPlaceholders = implode(',', array_fill(0, count($sendersToClear), '?'));
            $clearQuery = "UPDATE room_participants 
                           SET webrtc_offer = NULL, webrtc_answer = NULL, webrtc_candidates = NULL 
                           WHERE room_id = ? AND player_id IN ($inPlaceholders)";
            $clearStmt = $db->prepare($clearQuery);
            $clearStmt->bindValue(1, $room_id);
            $idx = 2;
            foreach ($sendersToClear as $pid) {
                $clearStmt->bindValue($idx, $pid, PDO::PARAM_INT);
                $idx++;
            }
            $clearStmt->execute();
        }
        
        echo json_encode([
            'success' => true,
            'signals' => $signals
        ]);
        
    } catch (Exception $e) {
        $logger = new Logger();
        $logger->logError('signaling.php: エラー', '', $e);
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'message' => 'Server error'
        ]);
    }

} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}
?>
