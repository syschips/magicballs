<?php
/**
 * ログ管理クラス
 * ゲーム結果、エラー、アクセスなどをデータベースに記録
 */

require_once __DIR__ . '/database.php';

class Logger {
    private $db;
    
    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }
    
    /**
     * ゲーム結果をログに記録
     * @param array $data ログデータ
     */
    public function logGameResult($data) {
        $this->writeLog(
            'INFO',
            'GAME_RESULT',
            sprintf('Winner: %s | Duration: %ds | Players: %d', 
                $data['winner_id'] ?? 'N/A',
                $data['duration'] ?? 0,
                $data['player_count'] ?? 0
            ),
            'game/finish.php',
            $data['winner_id'] ?? null,
            $data['room_id'] ?? null,
            [
                'duration' => $data['duration'] ?? 0,
                'player_count' => $data['player_count'] ?? 0,
                'rate_changes' => $data['rate_changes'] ?? []
            ]
        );
    }
    
    /**
     * エラーログを記録
     * @param string $message エラーメッセージ
     * @param string $context コンテキスト（API名など）
     * @param Exception|null $exception 例外オブジェクト
     */
    public function logError($message, $context = '', $exception = null) {
        $logData = ['message' => $message];
        
        if ($exception) {
            $logData['exception'] = get_class($exception);
            $logData['file'] = $exception->getFile();
            $logData['line'] = $exception->getLine();
            $logData['trace'] = $exception->getTraceAsString();
        }
        
        $this->writeLog(
            'ERROR',
            'ERROR',
            $message,
            $context,
            null,
            null,
            $logData
        );
        
        // PHPのエラーログにも記録
        error_log($message);
    }
    
    /**
     * APIアクセスログを記録
     * @param string $endpoint エンドポイント
     * @param string $method HTTPメソッド
     * @param int $responseCode レスポンスコード
     * @param array $data 追加データ
     */
    public function logAccess($endpoint, $method, $responseCode, $data = []) {
        $this->writeLog(
            'INFO',
            'ACCESS',
            sprintf('%s %s | Response: %d', $method, $endpoint, $responseCode),
            $endpoint,
            null,
            null,
            array_merge($data, [
                'method' => $method,
                'response_code' => $responseCode
            ])
        );
    }
    
    /**
     * 認証関連のログを記録
     * @param string $action アクション（login, register, logout）
     * @param int $playerId プレイヤーID
     * @param bool $success 成功/失敗
     * @param string $message メッセージ
     */
    public function logAuth($action, $playerId, $success, $message = '') {
        $this->writeLog(
            $success ? 'INFO' : 'WARNING',
            'AUTH',
            sprintf('Action: %s | Status: %s | Message: %s', 
                strtoupper($action),
                $success ? 'SUCCESS' : 'FAILED',
                $message
            ),
            'auth/' . $action . '.php',
            $playerId,
            null,
            [
                'action' => $action,
                'success' => $success,
                'message' => $message
            ]
        );
    }
    
    /**
     * ルーム関連のログを記録
     * @param string $action アクション（create, join, leave, start, finish）
     * @param string $roomId ルームID
     * @param int $playerId プレイヤーID
     * @param array $data 追加データ
     */
    public function logRoom($action, $roomId, $playerId, $data = []) {
        $this->writeLog(
            'INFO',
            'ROOM',
            sprintf('Action: %s', strtoupper($action)),
            'rooms/' . $action . '.php',
            $playerId,
            $roomId,
            array_merge($data, ['action' => $action])
        );
    }
    
    /**
     * ホスト引き継ぎログを記録
     * @param string $roomId ルームID
     * @param int $oldHostId 旧ホストID
     * @param int $newHostId 新ホストID
     */
    public function logHostMigration($roomId, $oldHostId, $newHostId) {
        $this->writeLog(
            'INFO',
            'HOST_MIGRATION',
            sprintf('OldHost: %s | NewHost: %s', $oldHostId, $newHostId),
            'rooms/migrate_host.php',
            $newHostId,
            $roomId,
            [
                'old_host_id' => $oldHostId,
                'new_host_id' => $newHostId
            ]
        );
    }
    
    /**
     * カスタムログを記録
     * @param string $category カテゴリ
     * @param string $message メッセージ
     * @param array $data 追加データ
     */
    public function log($category, $message, $data = []) {
        $this->writeLog(
            'INFO',
            strtoupper($category),
            $message,
            null,
            null,
            null,
            $data
        );
    }
    
    /**
     * データベースにログを書き込み
     * @param string $level ログレベル (INFO, WARNING, ERROR, DEBUG)
     * @param string $category カテゴリ
     * @param string $message メッセージ
     * @param string|null $context コンテキスト
     * @param int|null $playerId プレイヤーID
     * @param string|null $roomId ルームID
     * @param array $data 追加データ
     */
    private function writeLog($level, $category, $message, $context = null, $playerId = null, $roomId = null, $data = []) {
        try {
            $query = "INSERT INTO system_logs 
                     (log_level, category, message, context, player_id, room_id, ip_address, data) 
                     VALUES (:level, :category, :message, :context, :player_id, :room_id, :ip_address, :data)";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(':level', $level);
            $stmt->bindParam(':category', $category);
            $stmt->bindParam(':message', $message);
            $stmt->bindParam(':context', $context);
            $stmt->bindParam(':player_id', $playerId);
            $stmt->bindParam(':room_id', $roomId);
            
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? null;
            $stmt->bindParam(':ip_address', $ipAddress);
            
            $jsonData = !empty($data) ? json_encode($data, JSON_UNESCAPED_UNICODE) : null;
            $stmt->bindParam(':data', $jsonData);
            
            $stmt->execute();
            
            // 古いログを削除（30日以上前）
            $this->cleanOldLogs();
            
        } catch (Exception $e) {
            // ログ記録に失敗した場合は、PHPのエラーログに記録
            error_log("Failed to write log to database: " . $e->getMessage());
        }
    }
    
    /**
     * 古いログを削除（30日以上前）
     */
    private function cleanOldLogs() {
        try {
            // 1%の確率で実行（パフォーマンス対策）
            if (rand(1, 100) !== 1) {
                return;
            }
            
            $query = "DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)";
            $this->db->exec($query);
        } catch (Exception $e) {
            error_log("Failed to clean old logs: " . $e->getMessage());
        }
    }
}
