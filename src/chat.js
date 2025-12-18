/**
 * チャット管理モジュール
 * 
 * NGワードチェック、メッセージ送受信を管理
 */

import { CHAT_INPUT_MAX_LENGTH } from './constants.js';

const API_BASE_URL = './server/api';

// NGワード定義
const NG_WORDS = ['えた', '死ね', 'しね'];

/**
 * チャットマネージャークラス
 */
export class ChatManager {
  constructor(roomId, playerId) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.messages = [];
    this.pollingInterval = null;
  }

  /**
   * NGワードチェック
   * @param {string} text メッセージテキスト
   * @returns {boolean} NGワードが含まれている場合true
   */
  containsNGWord(text) {
    const lowerText = text.toLowerCase();
    return NG_WORDS.some(word => lowerText.includes(word));
  }

  /**
   * メッセージのバリデーション
   * @param {string} text メッセージテキスト
   * @returns {object} { valid: boolean, error: string }
   */
  validateMessage(text) {
    if (text.length === 0) {
      return { valid: false, error: '空メッセージ' };
    }
    if (text.length > CHAT_INPUT_MAX_LENGTH) {
      return { valid: false, error: `最大${CHAT_INPUT_MAX_LENGTH}文字まで` };
    }
    return { valid: true };
  }

  /**
   * メッセージ送信
   * @param {string} text メッセージテキスト
   * @returns {Promise<object>} 送信結果
   */
  async sendMessage(text) {
    // バリデーション
    const validation = this.validateMessage(text);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // NGワードチェック
    const isBlocked = this.containsNGWord(text);
    const messageText = isBlocked ? '禁止ワードが含まれます' : text;

    try {
      const response = await fetch(`${API_BASE_URL}/chat/send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          player_id: this.playerId,
          message_text: messageText,
          is_system: false,
          is_blocked: isBlocked
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Chat send error:', error);
      return { success: false, error: 'ネットワークエラー' };
    }
  }

  /**
   * システムメッセージ送信
   * @param {string} text システムメッセージテキスト
   * @returns {Promise<object>} 送信結果
   */
  async sendSystemMessage(text) {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/send.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          player_id: null,
          message_text: text,
          is_system: true,
          is_blocked: false
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('System message error:', error);
      return { success: false, error: 'ネットワークエラー' };
    }
  }

  /**
   * メッセージ取得
   * @returns {Promise<array>} メッセージ配列
   */
  async fetchMessages() {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/fetch.php?room_id=${this.roomId}&limit=100`);
      const data = await response.json();
      
      if (data.success) {
        this.messages = data.messages;
        return this.messages;
      } else {
        console.error('Failed to fetch messages:', data.message);
        return [];
      }
    } catch (error) {
      console.error('Chat fetch error:', error);
      return [];
    }
  }

  /**
   * ポーリング開始
   * @param {function} callback メッセージ更新時のコールバック
   * @param {number} interval ポーリング間隔（ミリ秒、デフォルト2000）
   */
  startPolling(callback, interval = 2000) {
    this.stopPolling();
    
    // 初回取得
    this.fetchMessages().then(callback);
    
    // 定期取得
    this.pollingInterval = setInterval(async () => {
      const messages = await this.fetchMessages();
      callback(messages);
    }, interval);
  }

  /**
   * ポーリング停止
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * 最新N件のメッセージ取得
   * @param {number} count 取得件数
   * @returns {array} メッセージ配列
   */
  getRecentMessages(count) {
    return this.messages.slice(-count);
  }
}
