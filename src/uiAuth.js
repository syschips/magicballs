/**
 * 認証・キャラ選択周りのUIハンドラをまとめたユーティリティ。
 * 依存を注入することで循環参照を避ける。
 */
export function createAuthHandlers({
  playerSession,
  state,
  showAuthUI,
  showCharSelectUI,
  showRoomSelectUI,
  loadRoomList,
  startRoomListPolling,
  showError,
  showSuccess,
  showLoading,
  hideLoading,
  handleError,
  startGame
}) {
  function handleLogin() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!username || !password) {
      showError('プレイヤー名とパスワードを入力してください');
      return;
    }

    showLoading('ログイン中...');
    playerSession.login(username, password)
      .then((result) => {
        hideLoading();
        if (result.success) {
          showSuccess(`ログイン成功！レート: ${playerSession.rate}`);
          state.isOnlineMode = true;
          showCharSelectUI();
        } else {
          showError('ログイン失敗: ' + result.message);
        }
      })
      .catch((error) => {
        hideLoading();
        handleError(error, 'handleLogin');
      });
  }

  function handleRegister() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!username || !password) {
      showError('プレイヤー名とパスワードを入力してください');
      return;
    }
    if (password.length < 6) {
      showError('パスワードは6文字以上にしてください');
      return;
    }

    showLoading('登録中...');
    playerSession.register(username, password)
      .then((result) => {
        hideLoading();
        if (result.success) {
          showSuccess('登録成功！');
          state.isOnlineMode = true;
          showCharSelectUI();
        } else {
          showError('登録失敗: ' + result.message);
        }
      })
      .catch((error) => {
        hideLoading();
        handleError(error, 'handleRegister');
      });
  }

  function handleOfflinePlay() {
    state.isOnlineMode = false;
    showCharSelectUI();
  }

  function handleCharConfirm() {
    if (state.isOnlineMode === false) {
      state.currentGameMode = 'classic';
      console.log('[handleCharConfirm] Offline mode: set game mode to classic');
      if (typeof startGame === 'function') {
        startGame(2, [1]);
      }
      return;
    }
    showRoomSelectUI();
    loadRoomList();
    startRoomListPolling();
  }

  return {
    handleLogin,
    handleRegister,
    handleOfflinePlay,
    handleCharConfirm
  };
}
