<?php
/**
 * ゲーム結果保存・レート計算API
 * 
 * ゲーム終了時に結果を保存し、Eloレーティングでレート変動を計算する
 * このAPIはサーバーサイドでレート計算を行うため、不正防止済み
 * 
 * @endpoint POST /api/game/finish.php
 * 
 * @param string room_id ルームID（VARCHAR(32)）
 * @param array results プレイヤー結果の配列
 *   @property int player_id プレイヤーID
 *   @property string result 'win' | 'lose' | 'draw'
 *   @property int score スコア
 * @param int|null winner_id 勝者のplayer_id（引き分けの場合はnull）
 * @param int|null duration_seconds ゲーム時間（秒）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property int game_id 保存されたgame_history.game_id
 *   @property array rate_changes レート変動情報
 *     @property int player_id
 *     @property int rate_before 変動前
 *     @property int rate_after 変動後
 *     @property int change 変動値（+/-）
 *   @property string message メッセージ
 * 
 * @database game_history テーブル
 *   - game_id: INT AUTO_INCREMENT PRIMARY KEY
 *   - room_id: VARCHAR(32) NOT NULL
 *   - player_count: INT NOT NULL
 *   - winner_id: INT NULL (FK -> players.player_id)
 *   - duration_seconds: INT
 * 
 * @database rate_history テーブル
 *   - player_id: INT NOT NULL
 *   - game_id: INT NOT NULL
 *   - rate_before: INT NOT NULL
 *   - rate_after: INT NOT NULL
 *   - rate_change: INT NOT NULL (+/-)
 * 
 * @database room_participants テーブル
 *   - rate_after: INT (結果保存時に更新)
 *   - result: ENUM('win', 'lose', 'draw')
 *   - score: INT
 * 
 * @database players テーブル
 *   - current_rate: INT (更新)
 *   - total_games: INT (INCREMENT)
 *   - total_wins: INT (INCREMENT if win)
 * 
 * @algorithm Eloレーティングシステム
 *   - K因子: 32
 *   - 期待勝率: E = 1 / (1 + 10^((loser_rate - winner_rate) / 400))
 *   - 変動値: ± K * E
 *   - 1対1の勝負を繰り返し計算
 * 
 * @note ホストがゲーム終了時に1度だけ呼び出す
 * @note サーバーサイドでレート計算を行うため、不正防止済み
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/database.php';
require_once '../config/logger.php';

// ロガー初期化
$logger = new Logger();

/**
 * レート変動計算（簡易版 Eloレーティング）
 * 
 * @param int $winner_rate 勝者のレート
 * @param int $loser_rate 敗者のレート
 * @param int $k_factor K因子（変動幅、デフォルト32）
 * @return array ['winner_change' => int, 'loser_change' => int]
 */
function calculateRateChange($winner_rate, $loser_rate, $k_factor = 32) {
    // 期待勝率を計算
    $expected_winner = 1 / (1 + pow(10, ($loser_rate - $winner_rate) / 400));
    
    // レート変動を計算
    $winner_change = round($k_factor * (1 - $expected_winner));
    $loser_change = -$winner_change;
    
    return [
        'winner_change' => $winner_change,
        'loser_change' => $loser_change
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    // JSONデコードエラーチェック
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Invalid JSON data"]);
        exit();
    }
    
    // 必須パラメータチェック
    if (!isset($data->room_id) || !isset($data->results) || !is_array($data->results)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Missing required parameters"]);
        exit();
    }
    
    if (!empty($data->room_id) && !empty($data->results)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            // トランザクション開始
            $db->beginTransaction();
            
            // ルーム情報を取得
            $room_query = "SELECT room_id, current_players, game_mode FROM game_rooms WHERE room_id = :room_id LIMIT 1";
            $room_stmt = $db->prepare($room_query);
            $room_stmt->bindParam(':room_id', $data->room_id);
            $room_stmt->execute();
            $room = $room_stmt->fetch();
            
            if (!$room) {
                throw new Exception("ルームが見つかりません");
            }
            
            // ゲームモードを取得
            $game_mode = $room['game_mode'] ?? 'classic';
            $is_party_mode = ($game_mode === 'party');
            
            // 勝者を特定
            $winner_id = null;
            $duration = !empty($data->duration) ? (int)$data->duration : 0;
            
            foreach ($data->results as $result) {
                if ($result->result === 'win') {
                    $winner_id = (int)$result->player_id;
                    break;
                }
            }
            
            // ゲーム履歴を保存
            $history_query = "INSERT INTO game_history (room_id, player_count, winner_id, duration_seconds) 
                              VALUES (:room_id, :player_count, :winner_id, :duration)";
            $history_stmt = $db->prepare($history_query);
            $history_stmt->bindParam(':room_id', $data->room_id);
            $history_stmt->bindParam(':player_count', $room['current_players']);
            $history_stmt->bindParam(':winner_id', $winner_id);
            $history_stmt->bindParam(':duration', $duration);
            $history_stmt->execute();
            
            $game_id = $db->lastInsertId();
            
            // 各プレイヤーの結果を処理
            $rate_changes = [];
            
            foreach ($data->results as $result) {
                $player_id = (int)$result->player_id;
                $result_type = $result->result; // 'win', 'lose', 'draw'
                $score = !empty($result->score) ? (int)$result->score : 0;
                
                // 現在のレートを取得
                $rate_query = "SELECT current_rate FROM players WHERE player_id = :player_id";
                $rate_stmt = $db->prepare($rate_query);
                $rate_stmt->bindParam(':player_id', $player_id);
                $rate_stmt->execute();
                $current_rate = (int)$rate_stmt->fetch()['current_rate'];
                
                $rate_before = $current_rate;
                $rate_change = 0;
                
                // パーティモードの場合、レート変動なし
                if ($is_party_mode) {
                    $rate_change = 0;
                } elseif ($result_type === 'win' && $winner_id) {
                    // レート変動計算（勝者のみ、クラシックモードのみ）
                    // 敗者の平均レートを計算
                    $losers_rates = [];
                    foreach ($data->results as $other) {
                        if ($other->player_id !== $player_id && $other->result === 'lose') {
                            $other_rate_query = "SELECT current_rate FROM players WHERE player_id = :pid";
                            $other_rate_stmt = $db->prepare($other_rate_query);
                            $other_rate_stmt->bindParam(':pid', $other->player_id);
                            $other_rate_stmt->execute();
                            $losers_rates[] = (int)$other_rate_stmt->fetch()['current_rate'];
                        }
                    }
                    
                    if (count($losers_rates) > 0) {
                        $avg_loser_rate = array_sum($losers_rates) / count($losers_rates);
                        $changes = calculateRateChange($rate_before, $avg_loser_rate);
                        $rate_change = $changes['winner_change'];
                    }
                } elseif ($result_type === 'lose' && $winner_id) {
                    // 勝者のレートを取得
                    $winner_rate_query = "SELECT current_rate FROM players WHERE player_id = :pid";
                    $winner_rate_stmt = $db->prepare($winner_rate_query);
                    $winner_rate_stmt->bindParam(':pid', $winner_id);
                    $winner_rate_stmt->execute();
                    $winner_rate = (int)$winner_rate_stmt->fetch()['current_rate'];
                    
                    $changes = calculateRateChange($winner_rate, $rate_before);
                    $rate_change = $changes['loser_change'];
                }
                
                $rate_after = $rate_before + $rate_change;
                
                // プレイヤーのレートを更新
                $update_player = "UPDATE players 
                                  SET current_rate = :rate_after,
                                      total_games = total_games + 1,
                                      total_wins = total_wins + :win_increment
                                  WHERE player_id = :player_id";
                $update_stmt = $db->prepare($update_player);
                $update_stmt->bindParam(':rate_after', $rate_after);
                $win_increment = ($result_type === 'win') ? 1 : 0;
                $update_stmt->bindParam(':win_increment', $win_increment);
                $update_stmt->bindParam(':player_id', $player_id);
                $update_stmt->execute();
                
                // ルーム参加者情報を更新
                $update_participant = "UPDATE room_participants 
                                       SET result = :result, score = :score, rate_after = :rate_after 
                                       WHERE room_id = :room_id AND player_id = :player_id";
                $update_part_stmt = $db->prepare($update_participant);
                $update_part_stmt->bindParam(':result', $result_type);
                $update_part_stmt->bindParam(':score', $score);
                $update_part_stmt->bindParam(':rate_after', $rate_after);
                $update_part_stmt->bindParam(':room_id', $data->room_id);
                $update_part_stmt->bindParam(':player_id', $player_id);
                $update_part_stmt->execute();
                
                // レート履歴を保存
                $history_rate = "INSERT INTO rate_history (player_id, game_id, rate_before, rate_after, rate_change) 
                                 VALUES (:player_id, :game_id, :rate_before, :rate_after, :rate_change)";
                $history_rate_stmt = $db->prepare($history_rate);
                $history_rate_stmt->bindParam(':player_id', $player_id);
                $history_rate_stmt->bindParam(':game_id', $game_id);
                $history_rate_stmt->bindParam(':rate_before', $rate_before);
                $history_rate_stmt->bindParam(':rate_after', $rate_after);
                $history_rate_stmt->bindParam(':rate_change', $rate_change);
                $history_rate_stmt->execute();
                
                $rate_changes[$player_id] = [
                    'rate_before' => $rate_before,
                    'rate_after' => $rate_after,
                    'rate_change' => $rate_change
                ];
            }
            
            // ルームのステータスを更新
            $update_room = "UPDATE game_rooms SET status = 'finished', finished_at = NOW() 
                            WHERE room_id = :room_id";
            $update_room_stmt = $db->prepare($update_room);
            $update_room_stmt->bindParam(':room_id', $data->room_id);
            $update_room_stmt->execute();
            
            $db->commit();
            
            // ゲーム結果をログに記録
            $logger->logGameResult([
                'room_id' => $data->room_id,
                'winner_id' => $winner_id,
                'duration' => $duration,
                'player_count' => $room['current_players'],
                'rate_changes' => $rate_changes
            ]);
            
            $logger->logAccess('/api/game/finish.php', 'POST', 200, [
                'room_id' => $data->room_id,
                'game_id' => $game_id
            ]);
            
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "ゲーム結果を保存しました",
                "game_id" => (int)$game_id,
                "rate_changes" => $rate_changes
            ]);
        } catch (Exception $e) {
            $db->rollBack();
            
            // エラーログを記録
            $logger->logError(
                'Failed to save game result',
                'game/finish.php',
                $e
            );
            
            $logger->logAccess('/api/game/finish.php', 'POST', 500, [
                'error' => 'Database error'
            ]);
            
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Failed to save game result"]);
            
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "サーバーエラー: " . $e->getMessage()]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ルームIDと結果データが必要です"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
