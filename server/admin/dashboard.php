<?php
/**
 * バックオフィス ダッシュボード
 */
session_start();

// 認証チェック
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: index.php');
    exit();
}

$displayName = $_SESSION['admin_display_name'] ?? 'Admin';
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ログビューアー - MagicBall バックオフィス</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #f5f5f5;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header h1 {
            font-size: 24px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .header-right {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .user-info {
            font-size: 14px;
        }
        
        .btn-logout {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
            transition: background 0.3s;
        }
        
        .btn-logout:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 30px;
        }
        
        .search-panel {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        
        .search-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
        }
        
        .search-form {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            align-items: end;
        }
        
        .form-field {
            display: flex;
            flex-direction: column;
        }
        
        .form-field label {
            font-size: 13px;
            color: #666;
            margin-bottom: 5px;
            font-weight: 500;
        }
        
        .form-field input,
        .form-field select {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        
        .btn-search {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: transform 0.2s;
        }
        
        .btn-search:hover {
            transform: translateY(-2px);
        }
        
        .btn-clear {
            background: #6c757d;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.3s;
        }
        
        .btn-clear:hover {
            background: #5a6268;
        }
        
        .stats-panel {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card h3 {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
        }
        
        .stat-card .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: #333;
        }
        
        .stat-card.error {
            border-left: 4px solid #dc3545;
        }
        
        .stat-card.warning {
            border-left: 4px solid #ffc107;
        }
        
        .stat-card.info {
            border-left: 4px solid #17a2b8;
        }
        
        .logs-panel {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .logs-header {
            padding: 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logs-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }
        
        .refresh-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .logs-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .logs-table th,
        .logs-table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        
        .logs-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
            font-size: 13px;
            position: sticky;
            top: 0;
        }
        
        .logs-table td {
            font-size: 13px;
            color: #666;
        }
        
        .logs-table tbody tr:hover {
            background: #f8f9fa;
        }
        
        .log-level {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .log-level.ERROR {
            background: #dc3545;
            color: white;
        }
        
        .log-level.WARNING {
            background: #ffc107;
            color: #333;
        }
        
        .log-level.INFO {
            background: #17a2b8;
            color: white;
        }
        
        .log-level.DEBUG {
            background: #6c757d;
            color: white;
        }
        
        .log-message {
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .log-data {
            font-family: monospace;
            font-size: 12px;
            color: #666;
            cursor: pointer;
        }
        
        .log-data:hover {
            color: #333;
            text-decoration: underline;
        }
        
        .pagination {
            padding: 20px;
            display: flex;
            justify-content: center;
            gap: 10px;
        }
        
        .pagination button {
            padding: 8px 12px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 5px;
            cursor: pointer;
        }
        
        .pagination button:hover:not(:disabled) {
            background: #f8f9fa;
        }
        
        .pagination button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .pagination button.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .no-data {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        
        .modal.show {
            display: flex;
        }
        
        .modal-content {
            background: white;
            border-radius: 10px;
            padding: 30px;
            max-width: 800px;
            max-height: 80vh;
            overflow: auto;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .modal-title {
            font-size: 20px;
            font-weight: 600;
        }
        
        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
        }
        
        .modal-close:hover {
            color: #333;
        }
        
        .modal-body pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            overflow: auto;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎱 MagicBall バックオフィス</h1>
        <div class="header-right">
            <div class="user-info">ようこそ、<?php echo htmlspecialchars($displayName); ?> さん</div>
            <a href="logout.php" class="btn-logout">ログアウト</a>
        </div>
    </div>
    
    <div class="container">
        <div class="search-panel">
            <div class="search-title">🔍 ログ検索</div>
            <div class="search-form">
                <div class="form-field">
                    <label>ログレベル</label>
                    <select id="filterLevel">
                        <option value="">すべて</option>
                        <option value="ERROR">ERROR</option>
                        <option value="WARNING">WARNING</option>
                        <option value="INFO">INFO</option>
                        <option value="DEBUG">DEBUG</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>カテゴリ</label>
                    <select id="filterCategory">
                        <option value="">すべて</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>プレイヤーID</label>
                    <input type="text" id="filterPlayerId" placeholder="プレイヤーID">
                </div>
                <div class="form-field">
                    <label>ルームID</label>
                    <input type="text" id="filterRoomId" placeholder="ルームID">
                </div>
                <div class="form-field">
                    <label>キーワード</label>
                    <input type="text" id="filterKeyword" placeholder="メッセージ内のキーワード">
                </div>
                <div class="form-field">
                    <button class="btn-search" onclick="searchLogs()">検索</button>
                </div>
                <div class="form-field">
                    <button class="btn-clear" onclick="clearFilters()">クリア</button>
                </div>
            </div>
        </div>
        
        <div class="stats-panel">
            <div class="stat-card error">
                <h3>エラー (24時間)</h3>
                <div class="stat-value" id="statError">-</div>
            </div>
            <div class="stat-card warning">
                <h3>警告 (24時間)</h3>
                <div class="stat-value" id="statWarning">-</div>
            </div>
            <div class="stat-card info">
                <h3>総ログ数</h3>
                <div class="stat-value" id="statTotal">-</div>
            </div>
        </div>
        
        <div class="logs-panel">
            <div class="logs-header">
                <div class="logs-title">📋 ログ一覧</div>
                <button class="refresh-btn" onclick="loadLogs()">🔄 更新</button>
            </div>
            <div id="logsTableContainer">
                <div class="loading">読み込み中...</div>
            </div>
        </div>
    </div>
    
    <div id="detailModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">ログ詳細</div>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body" id="modalBody">
            </div>
        </div>
    </div>
    
    <script>
        let currentPage = 1;
        const logsPerPage = 50;
        
        // 初期ロード
        document.addEventListener('DOMContentLoaded', function() {
            loadCategories();
            loadStats();
            loadLogs();
            
            // 自動更新（30秒ごと）
            setInterval(loadStats, 30000);
        });
        
        async function loadCategories() {
            try {
                const response = await fetch('api/logs.php?action=categories');
                const data = await response.json();
                
                const select = document.getElementById('filterCategory');
                data.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Failed to load categories:', error);
            }
        }
        
        async function loadStats() {
            try {
                const response = await fetch('api/logs.php?action=stats');
                const data = await response.json();
                
                document.getElementById('statError').textContent = data.error_count || 0;
                document.getElementById('statWarning').textContent = data.warning_count || 0;
                document.getElementById('statTotal').textContent = data.total_count || 0;
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }
        
        async function loadLogs() {
            const container = document.getElementById('logsTableContainer');
            container.innerHTML = '<div class="loading">読み込み中...</div>';
            
            try {
                const params = new URLSearchParams({
                    action: 'list',
                    page: currentPage,
                    limit: logsPerPage,
                    level: document.getElementById('filterLevel').value,
                    category: document.getElementById('filterCategory').value,
                    player_id: document.getElementById('filterPlayerId').value,
                    room_id: document.getElementById('filterRoomId').value,
                    keyword: document.getElementById('filterKeyword').value
                });
                
                const response = await fetch('api/logs.php?' + params);
                const data = await response.json();
                
                if (data.logs && data.logs.length > 0) {
                    renderLogsTable(data.logs, data.total_pages);
                } else {
                    container.innerHTML = '<div class="no-data">ログが見つかりませんでした</div>';
                }
            } catch (error) {
                console.error('Failed to load logs:', error);
                container.innerHTML = '<div class="no-data">エラーが発生しました</div>';
            }
        }
        
        function renderLogsTable(logs, totalPages) {
            let html = '<table class="logs-table"><thead><tr>';
            html += '<th>ID</th>';
            html += '<th>レベル</th>';
            html += '<th>カテゴリ</th>';
            html += '<th>メッセージ</th>';
            html += '<th>プレイヤーID</th>';
            html += '<th>ルームID</th>';
            html += '<th>IP</th>';
            html += '<th>日時</th>';
            html += '<th>詳細</th>';
            html += '</tr></thead><tbody>';
            
            logs.forEach(log => {
                html += '<tr>';
                html += `<td>${log.log_id}</td>`;
                html += `<td><span class="log-level ${log.log_level}">${log.log_level}</span></td>`;
                html += `<td>${log.category}</td>`;
                html += `<td><div class="log-message" title="${escapeHtml(log.message)}">${escapeHtml(log.message)}</div></td>`;
                html += `<td>${log.player_id || '-'}</td>`;
                html += `<td>${log.room_id || '-'}</td>`;
                html += `<td>${log.ip_address || '-'}</td>`;
                html += `<td>${log.created_at}</td>`;
                html += `<td><span class="log-data" onclick='showDetail(${JSON.stringify(log).replace(/'/g, "&apos;")})'>📄</span></td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            
            // ページネーション
            html += '<div class="pagination">';
            html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">前へ</button>`;
            for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
                html += `<button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
            }
            html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">次へ</button>`;
            html += '</div>';
            
            document.getElementById('logsTableContainer').innerHTML = html;
        }
        
        function changePage(page) {
            currentPage = page;
            loadLogs();
        }
        
        function searchLogs() {
            currentPage = 1;
            loadLogs();
        }
        
        function clearFilters() {
            document.getElementById('filterLevel').value = '';
            document.getElementById('filterCategory').value = '';
            document.getElementById('filterPlayerId').value = '';
            document.getElementById('filterRoomId').value = '';
            document.getElementById('filterKeyword').value = '';
            searchLogs();
        }
        
        function showDetail(log) {
            const modal = document.getElementById('detailModal');
            const body = document.getElementById('modalBody');
            
            let html = '<table style="width: 100%; border-collapse: collapse;">';
            html += `<tr><td style="padding: 8px; font-weight: bold; width: 150px;">ログID</td><td style="padding: 8px;">${log.log_id}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">レベル</td><td style="padding: 8px;"><span class="log-level ${log.log_level}">${log.log_level}</span></td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">カテゴリ</td><td style="padding: 8px;">${log.category}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">メッセージ</td><td style="padding: 8px;">${escapeHtml(log.message)}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">コンテキスト</td><td style="padding: 8px;">${log.context || '-'}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">プレイヤーID</td><td style="padding: 8px;">${log.player_id || '-'}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">ルームID</td><td style="padding: 8px;">${log.room_id || '-'}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">IPアドレス</td><td style="padding: 8px;">${log.ip_address || '-'}</td></tr>`;
            html += `<tr><td style="padding: 8px; font-weight: bold;">日時</td><td style="padding: 8px;">${log.created_at}</td></tr>`;
            html += '</table>';
            
            if (log.data) {
                html += '<h4 style="margin-top: 20px; margin-bottom: 10px;">追加データ</h4>';
                html += '<pre>' + JSON.stringify(JSON.parse(log.data), null, 2) + '</pre>';
            }
            
            body.innerHTML = html;
            modal.classList.add('show');
        }
        
        function closeModal() {
            document.getElementById('detailModal').classList.remove('show');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // モーダル外クリックで閉じる
        document.getElementById('detailModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    </script>
</body>
</html>
