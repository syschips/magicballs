<?php
/**
 * ランキング取得API
 * 
 * レート順にプレイヤーランキングを取得する
 * 
 * @endpoint GET /api/ranking/top.php
 * 
 * @param int|null limit 取得件数（デフォルト: 50）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property array ranking ランキング一覧
 *     @property int rank 順位
 *     @property int player_id プレイヤーID
 *     @property string username ログイン名
 *     @property string display_name 表示名
 *     @property int current_rate 現在のレート
 *     @property int total_games 総試合数
 *     @property int total_wins 総勝利数
 *     @property float win_rate 勝率（%）
 * 
 * @database players テーブル
 *   - player_id: INT PRIMARY KEY
 *   - username: VARCHAR(50) UNIQUE
 *   - display_name: VARCHAR(50) NOT NULL
 *   - current_rate: INT DEFAULT 1500
 *   - total_games: INT DEFAULT 0
 *   - total_wins: INT DEFAULT 0
 * 
 * @note total_games > 0 のプレイヤーのみ表示
 * @note current_rate DESC, total_wins DESC でソート
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $database = new Database();
        $db = $database->getConnection();
        
        $limit = !empty($_GET['limit']) ? (int)$_GET['limit'] : 50;
        
        $query = "SELECT player_id, username, display_name, current_rate, total_games, total_wins,
                         CASE WHEN total_games > 0 
                              THEN ROUND((total_wins / total_games) * 100, 1) 
                              ELSE 0 
                         END as win_rate
                  FROM players 
                  WHERE total_games > 0
                  ORDER BY current_rate DESC, total_wins DESC 
                  LIMIT :limit";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        $ranking = [];
        $rank = 1;
        
        while ($row = $stmt->fetch()) {
            $ranking[] = [
                "rank" => $rank++,
                "player_id" => (int)$row['player_id'],
                "username" => $row['username'],
                "display_name" => $row['display_name'],
                "current_rate" => (int)$row['current_rate'],
                "total_games" => (int)$row['total_games'],
                "total_wins" => (int)$row['total_wins'],
                "win_rate" => (float)$row['win_rate']
            ];
        }
        
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "ranking" => $ranking,
            "count" => count($ranking)
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server error"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "GETメソッドのみ許可されています"]);
}
