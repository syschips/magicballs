<?php
/**
 * データベース接続設定
 * 外部設定ファイル（config.php）から接続情報を読み込みます
 */

class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $charset;
    public $conn;

    public function __construct() {
        // 設定ファイルを読み込み
        $configPath = __DIR__ . '/config.php';
        
        if (!file_exists($configPath)) {
            throw new Exception(
                "設定ファイルが見つかりません。\n" .
                "config.sample.php をコピーして config.php を作成し、データベース接続情報を設定してください。\n" .
                "または、install.php を実行してセットアップを完了してください。"
            );
        }
        
        $config = require $configPath;
        
        $this->host = $config['db_host'] ?? 'localhost';
        $this->db_name = $config['db_name'] ?? 'magicball';
        $this->username = $config['db_user'] ?? 'root';
        $this->password = $config['db_pass'] ?? '';
        $this->charset = $config['db_charset'] ?? 'utf8mb4';
    }

    /**
     * データベース接続を取得
     */
    public function getConnection() {
        $this->conn = null;
        
        try {
            $dsn = "mysql:host={$this->host};dbname={$this->db_name};charset={$this->charset}";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$this->charset} COLLATE {$this->charset}_unicode_ci",
                PDO::MYSQL_ATTR_FOUND_ROWS => true
            ];
            
            $this->conn = new PDO($dsn, $this->username, $this->password, $options);
        } catch(PDOException $e) {
            error_log("Connection error: " . $e->getMessage());
            throw $e;
        }
        
        return $this->conn;
    }
    
    /**
     * データベース接続を取得（データベース名なし）
     * インストール時のデータベース作成用
     */
    public function getConnectionWithoutDB() {
        try {
            $dsn = "mysql:host={$this->host};charset={$this->charset}";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$this->charset} COLLATE {$this->charset}_unicode_ci"
            ];
            
            return new PDO($dsn, $this->username, $this->password, $options);
        } catch(PDOException $e) {
            error_log("Connection error: " . $e->getMessage());
            throw $e;
        }
    }
}

