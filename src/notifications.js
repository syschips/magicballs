/**
 * エラーハンドリングとユーザーフィードバック
 */

import { TIMING } from './config.js';

/**
 * エラーメッセージを表示
 */
export function showError(message, duration = 5000) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-toast';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  // アニメーション表示
  setTimeout(() => errorDiv.classList.add('show'), 10);
  
  // 自動的に消す
  setTimeout(() => {
    errorDiv.classList.remove('show');
    setTimeout(() => errorDiv.remove(), TIMING.NOTIFICATION_FADE_OUT);
  }, duration);
}

/**
 * 成功メッセージを表示
 */
export function showSuccess(message, duration = 3000) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-toast';
  successDiv.textContent = message;
  document.body.appendChild(successDiv);
  
  setTimeout(() => successDiv.classList.add('show'), 10);
  
  setTimeout(() => {
    successDiv.classList.remove('show');
    setTimeout(() => successDiv.remove(), TIMING.NOTIFICATION_FADE_OUT);
  }, duration);
}

/**
 * ローディング表示
 */
export function showLoading(message = '読み込み中...') {
  let loadingDiv = document.getElementById('loading-overlay');
  
  if (!loadingDiv) {
    loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-overlay';
    loadingDiv.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p class="loading-message">${message}</p>
      </div>
    `;
    document.body.appendChild(loadingDiv);
  } else {
    loadingDiv.querySelector('.loading-message').textContent = message;
  }
  
  loadingDiv.style.display = 'flex';
}

/**
 * ローディング非表示
 */
export function hideLoading() {
  const loadingDiv = document.getElementById('loading-overlay');
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
}

/**
 * 確認ダイアログ
 */
export function confirm(message) {
  return window.confirm(message);
}
