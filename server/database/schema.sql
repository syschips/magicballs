-- MagicBall データベーススキーマ
-- MySQL 5.7以上を想定

-- データベース作成
CREATE DATABASE IF NOT EXISTS magicball CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE magicball;

-- プレイヤーテーブル
CREATE TABLE IF NOT EXISTS players (
    player_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    current_rate INT DEFAULT 1500,
    total_games INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_rate (current_rate DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ゲームルームテーブル
CREATE TABLE IF NOT EXISTS game_rooms (
    room_id VARCHAR(32) PRIMARY KEY,
    room_name VARCHAR(100),
    max_players INT DEFAULT 6,
    current_players INT DEFAULT 0,
    host_player_id INT NOT NULL,
    game_time INT DEFAULT 180,
    status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (host_player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_host (host_player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ルーム参加者テーブル
CREATE TABLE IF NOT EXISTS room_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(32) NOT NULL,
    player_id INT NOT NULL,
    player_number INT NOT NULL,
    ball_type ENUM('kuro', 'shiro', 'kiiro') DEFAULT 'kuro',
    is_cpu BOOLEAN DEFAULT FALSE,
    is_ready BOOLEAN DEFAULT FALSE,
    rate_before INT,
    rate_after INT,
    result ENUM('win', 'lose', 'draw') NULL,
    score INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    webrtc_offer TEXT NULL,
    webrtc_answer TEXT NULL,
    webrtc_candidates TEXT NULL,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    UNIQUE KEY unique_room_player (room_id, player_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ゲーム履歴テーブル
CREATE TABLE IF NOT EXISTS game_history (
    game_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(32) NOT NULL,
    player_count INT NOT NULL,
    winner_id INT NULL,
    duration_seconds INT,
    finished_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id),
    FOREIGN KEY (winner_id) REFERENCES players(player_id),
    INDEX idx_finished_at (finished_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- レート履歴テーブル
CREATE TABLE IF NOT EXISTS rate_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    game_id INT NOT NULL,
    rate_before INT NOT NULL,
    rate_after INT NOT NULL,
    rate_change INT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES game_history(game_id) ON DELETE CASCADE,
    INDEX idx_player_recorded (player_id, recorded_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ゲーム状態テーブル（リアルタイム同期用）
CREATE TABLE IF NOT EXISTS game_state (
    room_id VARCHAR(32) NOT NULL,
    player_id INT NOT NULL,
    state_data TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, player_id),
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- チャットメッセージテーブル
CREATE TABLE IF NOT EXISTS room_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(32) NOT NULL,
    player_id INT NULL,
    message_text TEXT NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE SET NULL,
    INDEX idx_room_sent (room_id, sent_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- システムログテーブル
CREATE TABLE IF NOT EXISTS system_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    log_level ENUM('INFO', 'WARNING', 'ERROR', 'DEBUG') DEFAULT 'INFO',
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    context VARCHAR(255) NULL,
    player_id INT NULL,
    room_id VARCHAR(32) NULL,
    ip_address VARCHAR(45) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE SET NULL,
    INDEX idx_level_created (log_level, created_at DESC),
    INDEX idx_category_created (category, created_at DESC),
    INDEX idx_player (player_id),
    INDEX idx_room (room_id),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- サンプルデータ: テストユーザー
-- パスワードは全て "test123" (開発用のみ、本番環境では削除すること)
-- ハッシュ生成: password_hash('test123', PASSWORD_DEFAULT)
INSERT IGNORE INTO players (username, password_hash, display_name, current_rate) VALUES
('guest1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ゲスト1', 1500),
('guest2', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ゲスト2', 1500),
('guest3', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ゲスト3', 1500),
('guest4', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ゲスト4', 1500);
