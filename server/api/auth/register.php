<?php
/**
 * プレイヤー登録API
 * 
 * 新規プレイヤーアカウントを作成する
 * 
 * @endpoint POST /api/auth/register.php
 * 
 * @param string username ログイン名（一意、50文字以内）
 * @param string password パスワード（平文、bcryptでハッシュ化される）
 * @param string display_name 表示名（50文字以内）
 * 
 * @return object
 *   @property bool success 成功フラグ
 *   @property int player_id 作成されたプレイヤーID
 *   @property string message メッセージ
 * 
 * @database players テーブル
 *   - player_id: INT AUTO_INCREMENT (PK)
 *   - username: VARCHAR(50) NOT NULL UNIQUE
 *   - password_hash: VARCHAR(255) NOT NULL
 *   - display_name: VARCHAR(50) NOT NULL
 *   - current_rate: INT DEFAULT 1500
 *   - total_games: INT DEFAULT 0
 *   - total_wins: INT DEFAULT 0
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
    
    if (!empty($data->username) && !empty($data->password) && !empty($data->display_name)) {
        try {
            $database = new Database();
            $db = $database->getConnection();
            
            // ユーザー名の重複チェック
            $check_query = "SELECT player_id FROM players WHERE username = :username LIMIT 1";
            $check_stmt = $db->prepare($check_query);
            $check_stmt->bindParam(':username', $data->username);
            $check_stmt->execute();
            
            if ($check_stmt->rowCount() > 0) {
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "このユーザー名は既に使用されています"]);
                exit();
            }
            
            // パスワードをハッシュ化
            $password_hash = password_hash($data->password, PASSWORD_DEFAULT);
            
            // プレイヤー登録
            $query = "INSERT INTO players (username, password_hash, display_name, current_rate) 
                      VALUES (:username, :password_hash, :display_name, 1500)";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':username', $data->username);
            $stmt->bindParam(':password_hash', $password_hash);
            $stmt->bindParam(':display_name', $data->display_name);
            
            if ($stmt->execute()) {
                $player_id = $db->lastInsertId();
                
                // 登録成功をログに記録
                $logger->logAuth('register', $player_id, true, 'New user: ' . $data->username);
                
                http_response_code(201);
                echo json_encode([
                    "success" => true,
                    "message" => "登録成功",
                    "player" => [
                        "player_id" => (int)$player_id,
                        "username" => $data->username,
                        "display_name" => $data->display_name,
                        "current_rate" => 1500
                    ]
                ]);
            } else {
                $logger->logError('Registration failed', 'auth/register.php');
                http_response_code(500);
                echo json_encode(["success" => false, "message" => "登録に失敗しました"]);
            }
        } catch (Exception $e) {
            $logger->logError('Registration error', 'auth/register.php', $e);
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Server error"]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "全ての項目を入力してください"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "POSTメソッドのみ許可されています"]);
}
