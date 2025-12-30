<?php
// 文字エンコーディングを設定
header('Content-Type: text/html; charset=UTF-8');
mb_internal_encoding('UTF-8');
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MagicBall サーバーインストーラー</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: 600;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 5px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .hint {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
        }
        button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .alert {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .step {
            margin-bottom: 30px;
            padding-bottom: 30px;
            border-bottom: 1px solid #e0e0e0;
        }
        .step:last-child {
            border-bottom: none;
        }
        .step-number {
            display: inline-block;
            width: 30px;
            height: 30px;
            background: #667eea;
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 30px;
            font-weight: bold;
            margin-right: 10px;
        }
        .step-title {
            display: inline-block;
            font-size: 18px;
            color: #333;
            font-weight: 600;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s ease-in-out infinite;
            margin-left: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        pre {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 MagicBall サーバーインストーラー</h1>
        <p class="subtitle">データベースのセットアップとアプリケーションの初期化を行います</p>

        <?php
        $step = isset($_GET['step']) ? $_GET['step'] : 1;
        $configPath = __DIR__ . '/api/config/config.php';
        $configExists = file_exists($configPath);

        // インストール済みチェック
        if ($configExists && $step == 1 && !isset($_GET['reinstall'])) {
            echo '<div class="alert alert-info">';
            echo '<strong>✓ 既にインストール済みです</strong><br>';
            echo 'config.php が存在します。';
            echo '</div>';
            echo '<div style="margin-top:20px;">';
            echo '<a href="../index.html" style="display:block; text-align:center; padding:15px; background:#667eea; color:white; text-decoration:none; border-radius:5px; font-weight:600; margin-bottom:10px;">→ アプリケーションを起動</a>';
            echo '<a href="install.php?step=2&reinstall=1" style="display:block; text-align:center; padding:15px; background:#dc3545; color:white; text-decoration:none; border-radius:5px; font-weight:600;">⚠️ 再インストール（全データ削除）</a>';
            echo '<div class="hint" style="text-align:center; margin-top:10px; color:#dc3545; font-weight:600;">※ 再インストールすると全てのデータが削除されます</div>';
            echo '</div>';
            exit;
        }
        
        // 再インストール時、既存の設定があればstep2に直接進む
        if (isset($_GET['reinstall']) && $configExists && $step == 1) {
            // step2にリダイレクト
            header('Location: install.php?step=2&reinstall=1');
            exit;
        }

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && $step == 1) {
            // ステップ1: 設定ファイルの作成とDB接続テスト
            $dbHost = $_POST['db_host'] ?? 'localhost';
            $dbName = $_POST['db_name'] ?? 'magicball';
            $dbUser = $_POST['db_user'] ?? 'root';
            $dbPass = $_POST['db_pass'] ?? '';
            
            // 再インストールフラグの判定（GETまたはPOSTから）
            $isReinstall = isset($_GET['reinstall']) || isset($_POST['reinstall']);
            
            // デバッグ情報
            error_log("Install.php POST received: step={$step}, reinstall={$isReinstall}");
            error_log("POST data: " . print_r($_POST, true));
            error_log("GET data: " . print_r($_GET, true));

            try {
                // 接続テスト（UTF-8を明示的に設定）
                $dsn = "mysql:host={$dbHost};charset=utf8mb4";
                $pdo = new PDO($dsn, $dbUser, $dbPass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
                ]);

                // 設定ファイルを作成
                $configContent = "<?php\n";
                $configContent .= "/**\n";
                $configContent .= " * データベース設定ファイル\n";
                $configContent .= " * 自動生成日時: " . date('Y-m-d H:i:s') . "\n";
                $configContent .= " * このファイルは機密情報を含むため、Gitにコミットしないでください\n";
                $configContent .= " */\n\n";
                $configContent .= "return [\n";
                $configContent .= "    'db_host' => " . var_export($dbHost, true) . ",\n";
                $configContent .= "    'db_name' => " . var_export($dbName, true) . ",\n";
                $configContent .= "    'db_user' => " . var_export($dbUser, true) . ",\n";
                $configContent .= "    'db_pass' => " . var_export($dbPass, true) . ",\n";
                $configContent .= "    'db_charset' => 'utf8mb4'\n";
                $configContent .= "];\n";

                if (!is_dir(__DIR__ . '/api/config')) {
                    mkdir(__DIR__ . '/api/config', 0755, true);
                }

                // 一時的に厳格なumaskを設定して600で作成（Windowsでは無効な場合あり）
                $originalUmask = null;
                if (function_exists('umask')) {
                    $originalUmask = umask(0177); // 600想定
                }

                if (file_put_contents($configPath, $configContent) === false) {
                    throw new Exception('設定ファイルの作成に失敗しました。書き込み権限を確認してください。');
                }
                if ($originalUmask !== null) {
                    umask($originalUmask);
                }

                // パーミッション設定（Windowsでは効果がない場合がある）
                $chmodSucceeded = @chmod($configPath, 0600);
                if (!$chmodSucceeded) {
                    echo '<div class="alert alert-info">';
                    echo '<strong>⚠️ 警告</strong><br>';
                    echo 'config.phpのパーミッションを600に変更できませんでした。手動で設定してください（所有者のみ読み書き）。';
                    echo '</div>';
                } else {
                    echo '<div class="alert alert-success">';
                    echo 'config.phpのパーミッションを600に設定しました。';
                    echo '</div>';
                }

                echo '<div class="alert alert-success">';
                echo '<strong>✓ データベース接続成功</strong><br>';
                echo '設定ファイル (config.php) を作成しました。';
                echo '</div>';
                
                echo '<form method="get" action="install.php" id="nextStepForm">';
                echo '<input type="hidden" name="step" value="2">';
                if ($isReinstall) {
                    echo '<input type="hidden" name="reinstall" value="1">';
                }
                echo '<button type="submit">次へ: データベース初期化</button>';
                echo '</form>';
                echo '<script>document.getElementById("nextStepForm").submit();</script>';
                exit;

            } catch (PDOException $e) {
                echo '<div class="alert alert-error">';
                echo '<strong>✗ データベース接続エラー</strong><br>';
                echo 'エラー: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
                echo '</div>';
            }
        }

        if ($step == 2) {
            // ステップ2: データベースとテーブルの作成
            if (!$configExists) {
                echo '<div class="alert alert-error">設定ファイルが見つかりません。ステップ1からやり直してください。</div>';
                exit;
            }

            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                try {
                    require_once __DIR__ . '/api/config/database.php';
                    $database = new Database();
                    
                    // データベース作成
                    $conn = $database->getConnectionWithoutDB();
                    $config = require $configPath;
                    $dbName = $config['db_name'];
                    
                    // データベース名の検証（英数字、アンダースコア、ハイフンを許可）
                    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $dbName)) {
                        throw new Exception('データベース名に使用できない文字が含まれています');
                    }
                    
                    // データベースが存在しない場合は作成（既存の場合は何もしない）
                    $conn->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                    echo '<div class="alert alert-success">✓ データベース "' . htmlspecialchars($dbName, ENT_QUOTES, 'UTF-8') . '" を確認/作成しました</div>';
                    
                    // スキーマ読み込み（UTF-8で読み込み）
                    $schemaPath = __DIR__ . '/database/schema.sql';
                    if (!file_exists($schemaPath)) {
                        throw new Exception('schema.sql が見つかりません');
                    }
                    
                    $schema = file_get_contents($schemaPath);
                    
                    // USE文を除外してデータベースに接続
                    $conn = $database->getConnection();
                    
                    // UTF-8を明示的に設定
                    $conn->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
                    $conn->exec("SET CHARACTER SET utf8mb4");
                    
                    // トランザクション開始
                    $conn->beginTransaction();
                    
                    try {
                        // 再インストールの場合は既存テーブルを削除（外部キー制約を考慮した順序）
                        if (isset($_POST['drop_existing'])) {
                            echo '<div class="alert alert-info">⚠️ 既存のテーブルを削除しています...</div>';
                            $conn->exec('SET FOREIGN_KEY_CHECKS = 0');
                            $tables = ['system_logs', 'rate_history', 'game_history', 'room_messages', 'room_participants', 'game_rooms', 'players'];
                            foreach ($tables as $table) {
                                $conn->exec("DROP TABLE IF EXISTS `{$table}`");
                            }
                            $conn->exec('SET FOREIGN_KEY_CHECKS = 1');
                            echo '<div class="alert alert-success">✓ 既存のテーブルを削除しました</div>';
                        }
                        
                        // SQLを個別に実行
                        $statements = array_filter(
                            array_map('trim', explode(';', $schema)),
                            function($stmt) {
                                return !empty($stmt) && 
                                       stripos($stmt, 'CREATE DATABASE') === false && 
                                       stripos($stmt, 'USE ') === false;
                            }
                        );
                        
                        foreach ($statements as $statement) {
                            if (!empty(trim($statement))) {
                                $conn->exec($statement);
                            }
                        }
                        
                        // トランザクションコミット
                        $conn->commit();
                    } catch (Exception $e) {
                        // エラー時はロールバック
                        $conn->rollBack();
                        throw $e;
                    }
                    
                    echo '<div class="alert alert-success">';
                    echo '<strong>✓ データベースの初期化が完了しました</strong><br>';
                    echo 'テーブルとサンプルデータを作成しました。<br>';
                    echo '作成されたテーブル: players, game_rooms, room_participants, room_messages, game_history, rate_history, system_logs';
                    echo '</div>';
                    
                    echo '<div class="alert alert-success">';
                    echo '<strong>🎉 インストール完了！</strong><br>';
                    echo 'MagicBall サーバーのセットアップが完了しました。';
                    echo '</div>';
                    
                    echo '<div class="alert alert-info">';
                    echo '<strong>📊 バックオフィスについて</strong><br><br>';
                    echo '1. <strong>ログビューアーURL:</strong> <code>server/admin/index.php</code><br>';
                    echo '2. <strong>ログイン認証:</strong> DB接続ユーザー（config.php の <code>db_user</code>/<code>db_pass</code>）を使用します<br><br>';
                    echo '3. <strong>機能:</strong> システムログの閲覧、検索、統計表示<br>';
                    echo '4. <strong>ログ保存:</strong> 全てのログはデータベースに保存されます（30日間保持）';
                    echo '</div>';
                    
                    echo '<div class="alert alert-error">';
                    echo '<strong>🔒 重要：セキュリティ対策が必要です</strong><br><br>';
                    echo '1. <strong>install.php を今すぐ削除してください</strong><br>';
                    echo '   コマンド例: <code>rm install.php</code> (Linux/Mac) または <code>del install.php</code> (Windows)<br><br>';
                    echo '2. <strong>api/config/config.php のパーミッションを確認してください</strong><br>';
                    echo '   推奨設定: 600 (所有者のみ読み書き可能)<br><br>';
                    echo '3. <strong>本番環境ではサンプルユーザーを削除してください</strong>';
                    echo '</div>';
                    
                    echo '<a href="../index.html" style="display:block; text-align:center; margin-top:20px; padding:15px; background:#667eea; color:white; text-decoration:none; border-radius:5px; font-weight:600;">→ アプリケーションを起動</a>';
                    exit;
                    
                } catch (Exception $e) {
                    echo '<div class="alert alert-error">';
                    echo '<strong>✗ エラー</strong><br>';
                    echo htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
                    echo '</div>';
                }
            }
            
            $isReinstall = isset($_GET['reinstall']);
            
            echo '<div class="step">';
            echo '<span class="step-number">2</span>';
            echo '<span class="step-title">データベース初期化</span>';
            echo '</div>';
            
            if ($isReinstall) {
                echo '<div class="alert alert-error">';
                echo '<strong>⚠️ 警告: 再インストールモード</strong><br>';
                echo '既存のデータベースとテーブルが削除され、全てのデータが失われます。<br>';
                echo 'この操作は取り消せません。本当に実行しますか？';
                echo '</div>';
            } else {
                echo '<div class="alert alert-info">';
                echo 'データベースとテーブルを作成します。<br>';
                echo '既存のテーブルがある場合は "IF NOT EXISTS" によりスキップされます。';
                echo '</div>';
            }
            
            echo '<form method="post" action="install.php?step=2' . ($isReinstall ? '&reinstall=1' : '') . '">';
            if ($isReinstall) {
                echo '<input type="hidden" name="drop_existing" value="1">';
            }
            echo '<button type="submit" style="background:' . ($isReinstall ? '#dc3545' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)') . ';">';
            echo $isReinstall ? '⚠️ 全データを削除して再インストール' : 'データベースを初期化';
            echo '</button>';
            echo '</form>';
            exit;
        }

        // ステップ1: データベース接続情報入力
        
        // 再インストールフラグを保持
        $reinstallParam = isset($_GET['reinstall']) ? '1' : '';
        
        // 再インストール時は既存のconfig.phpから設定を読み込み
        $defaultDbHost = 'localhost';
        $defaultDbName = 'magicball';
        $defaultDbUser = 'root';
        $defaultDbPass = '';
        
        if ($reinstallParam && $configExists) {
            try {
                $existingConfig = require $configPath;
                $defaultDbHost = $existingConfig['db_host'] ?? 'localhost';
                $defaultDbName = $existingConfig['db_name'] ?? 'magicball';
                $defaultDbUser = $existingConfig['db_user'] ?? 'root';
                $defaultDbPass = $existingConfig['db_pass'] ?? '';
            } catch (Exception $e) {
                // 読み込みエラーの場合はデフォルト値を使用
            }
        }
        ?>
        
        <div class="step">
            <span class="step-number">1</span>
            <span class="step-title">データベース接続情報</span>
        </div>
        
        <?php if ($reinstallParam): ?>
        <div class="alert alert-error" style="margin-bottom: 20px;">
            <strong>⚠️ 再インストールモード</strong><br>
            既存のデータベースとテーブルが削除され、全てのデータが失われます。<br>
            現在の設定情報を読み込んでいます。必要に応じて変更してください。
        </div>
        <?php endif; ?>

        <form method="post" action="install.php?step=1<?php echo $reinstallParam ? '&reinstall=1' : ''; ?>">
            <?php if ($reinstallParam): ?>
            <input type="hidden" name="reinstall" value="1">
            <?php endif; ?>
            <div class="form-group">
                <label for="db_host">データベースホスト</label>
                <input type="text" id="db_host" name="db_host" value="<?php echo htmlspecialchars($defaultDbHost, ENT_QUOTES, 'UTF-8'); ?>" required>
                <div class="hint">通常は "localhost" を使用します</div>
            </div>

            <div class="form-group">
                <label for="db_name">データベース名</label>
                <input type="text" id="db_name" name="db_name" value="<?php echo htmlspecialchars($defaultDbName, ENT_QUOTES, 'UTF-8'); ?>" required>
                <div class="hint">使用するデータベース名（存在しない場合は作成されます）</div>
            </div>

            <div class="form-group">
                <label for="db_user">データベースユーザー名</label>
                <input type="text" id="db_user" name="db_user" value="<?php echo htmlspecialchars($defaultDbUser, ENT_QUOTES, 'UTF-8'); ?>" required>
                <div class="hint">MySQLユーザー名</div>
            </div>

            <div class="form-group">
                <label for="db_pass">データベースパスワード</label>
                <input type="password" id="db_pass" name="db_pass" value="<?php echo htmlspecialchars($defaultDbPass, ENT_QUOTES, 'UTF-8'); ?>">
                <div class="hint">MySQLパスワード（空欄の場合はパスワードなし）</div>
            </div>

            <button type="submit">接続テスト &amp; 設定保存</button>
        </form>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
                インストール後、セキュリティのため install.php を削除してください
            </p>
        </div>
    </div>
</body>
</html>
