<?php
/**
 * プレイヤー認証API
 * 
 * ユーザー名とパスワードで認証を行い、プレイヤー情報を返す
 * 
 * @endpoint POST /api/auth/login.php
 * 
 * @param string username ログイン名（players.username）
 * @param string password パスワード（平文）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property object player プレイヤー情報
 *     @property int player_id プレイヤーID
 *     @property string username ログイン名
 *     @property string display_name 表示名
 *     @property int current_rate 現在のレート
 *   @property string message エラーメッセージ
 * 
 * @database players テーブル
 *   - player_id: INT (PK)
 *   - username: VARCHAR(50) UNIQUE
 *   - display_name: VARCHAR(50)
 *   - password_hash: VARCHAR(255)
 *   - current_rate: INT DEFAULT 1500
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
    
    if (!empty($data->username) && !empty($data->password)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            $query = "SELECT player_id, username, display_name, password_hash, current_rate, total_games, total_wins 
                      FROM players WHERE username = :username LIMIT 1";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':username', $data->username);
            $stmt->execute();
            
            if ($stmt->rowCount() > 0) {
                $row = $stmt->fetch();
                
                // パスワード検証
                if (password_verify($data->password, $row['password_hash'])) {
                    // セッショントークンを生成（実運用ではJWTなどを使用）
                    $token = bin2hex(random_bytes(32));
                    
                    // ログイン成功をログに記録
                    $logger->logAuth('login', $row['player_id'], true, 'User: ' . $data->username);
                    
                    http_response_code(200);
                    echo json_encode([
                        "success" => true,
                        "message" => "ログイン成功",
                        "token" => $token,
                        "player" => [
                            "player_id" => (int)$row['player_id'],
                            "username" => $row['username'],
                            "display_name" => $row['display_name'],
                            "current_rate" => (int)$row['current_rate'],
                            "total_games" => (int)$row['total_games'],
                            "total_wins" => (int)$row['total_wins'],
                            "win_rate" => $row['total_games'] > 0 ? round(($row['total_wins'] / $row['total_games']) * 100, 1) : 0
                        ]
                    ]);
                } else {
                    $logger->logAuth('login', null, false, 'Invalid password for user: ' . $data->username);
                    http_response_code(401);
                    echo json_encode(["success" => false, "message" => "パスワードが正しくありません"]);
                }
            } else {
                $logger->logAuth('login', null, false, 'User not found: ' . $data->username);
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "ユーザーが見つかりません"]);
            }
        } catch (Exception $e) {
            $logger->logError('Login error', 'auth/login.php', $e);
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Server error"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "ユーザー名とパスワードを入力してください"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
