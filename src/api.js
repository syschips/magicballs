/**
 * サーバーAPI連携クラス
 * 認証、ルーム管理、ゲーム結果送信などのAPIとの通信を管理
 * @module api
 */

import { checkResponse, handleError, AppError, ErrorType } from './errorHandler.js';

// APIのベースURL（相対パス）
const API_BASE_URL = './server/api';

/**
 * 認証エラーをチェックして適切なエラータイプで再スロー
 * @param {Error} error - キャッチしたエラー
 * @param {string} context - エラーコンテキスト
 * @throws {AppError}
 * @private
 */
function handleAPIError(error, context) {
  if (error instanceof AppError) {
    handleError(error, context);
    throw error;
  }
  
  // ネットワークエラーか認証エラーか判定
  const isAuthError = context.includes('Auth') || 
                      error.message?.includes('認証') ||
                      error.message?.includes('ログイン') ||
                      error.message?.includes('登録');
  
  const appError = new AppError(
    error.message || 'APIエラー',
    isAuthError ? ErrorType.AUTH : ErrorType.NETWORK,
    { context, originalError: error }
  );
  
  handleError(appError, context);
  throw appError;
}

/**
 * 認証API
 */
export const AuthAPI = {
  /**
   * プレイヤー登録
   * @param {string} playerName - プレイヤー名
   * @param {string} password - パスワード
   * @returns {Promise<{success: boolean, player_id?: number, message?: string}>}
   */
  async register(playerName, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: playerName, 
          password: password,
          display_name: playerName  // 表示名はユーザー名と同じにする
        })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'AuthAPI.register');
    }
  },

  /**
   * ログイン
   * @param {string} playerName - プレイヤー名
   * @param {string} password - パスワード
   * @returns {Promise<{success: boolean, player_id?: number, player_name?: string, rate?: number, message?: string}>}
   */
  async login(playerName, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: playerName, password: password })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'AuthAPI.login');
    }
  }
};

/**
 * ルーム管理API
 */
export const RoomAPI = {
  /**
   * ルーム一覧取得
   * @returns {Promise<{success: boolean, rooms?: Array}>}
   */
  async listRooms() {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/list.php`);
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RoomAPI.listRooms');
    }
  },

  /**
   * ルーム作成
   * @param {number} playerId - プレイヤーID
   * @param {string} roomName - ルーム名
   * @param {number} maxPlayers - 最大プレイヤー数
   * @param {number} gameTime - ゲーム時間（秒）
   * @param {string} ballType - ボールタイプ
   * @param {string} gameMode - ゲームモード
   * @returns {Promise<{success: boolean, room_id?: number, message?: string}>}
   */
  async createRoom(playerId, roomName, maxPlayers, ballType, gameMode = 'classic') {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/create.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          room_name: roomName,
          max_players: maxPlayers,
          ball_type: ballType,
          game_mode: gameMode
        })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RoomAPI.createRoom');
    }
  },

  /**
   * ルーム参加
   * @param {number} roomId - ルームID
   * @param {number} playerId - プレイヤーID
   * @param {string} ballType - ボールタイプ
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async joinRoom(roomId, playerId, ballType) {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/join.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          player_id: playerId,
          ball_type: ballType
        })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RoomAPI.joinRoom');
    }
  },

  /**
   * ルーム退出
   * @param {string} roomId - ルームID
   * @param {number} playerId - プレイヤーID
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async leaveRoom(roomId, playerId) {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/leave.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, player_id: playerId })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RoomAPI.leaveRoom');
    }
  },

  /**
   * ルームリセット（ゲーム終了後に待機状態に戻す）
   * @param {string} roomId - ルームID
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async resetRoom(roomId) {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/reset.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RoomAPI.resetRoom');
    }
  }
};

/**
 * ゲームAPI
 */
export const GameAPI = {
  /**
   * ゲーム結果送信
   * @param {string} roomId - ルームID
   * @param {Array<{player_id: number, result: string, score: number}>} results - 各プレイヤーの結果
   * @param {number|null} winner_id - 勝者のplayer_id（引き分けの場合はnull）
   * @returns {Promise<{success: boolean, rate_changes?: Object, message?: string}>}
   */
  async finishGame(roomId, results, winner_id = null) {
    try {
      const response = await fetch(`${API_BASE_URL}/game/finish.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          results: results,
          winner_id: winner_id
        })
      });
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'GameAPI.finishGame');
    }
  }
};

/**
 * ランキングAPI
 */
export const RankingAPI = {
  /**
   * トップランキング取得
   * @param {number} limit - 取得件数（デフォルト10）
   * @returns {Promise<{success: boolean, ranking?: Array}>}
   */
  async getTopRanking(limit = 10) {
    try {
      const response = await fetch(`${API_BASE_URL}/ranking/top.php?limit=${limit}`);
      return await checkResponse(response);
    } catch (error) {
      handleAPIError(error, 'RankingAPI.getTopRanking');
    }
  }
};

/**
 * プレイヤーセッション管理
 */
export class PlayerSession {
  constructor() {
    this.playerId = null;
    this.playerName = null;
    this.rate = 1500;
    this.currentRoomId = null;
    this.ballType = 'kuro';
  }

  /**
   * ログイン実行
   */
  async login(playerName, password) {
    const result = await AuthAPI.login(playerName, password);
    if (result.success && result.player) {
      this.playerId = result.player.player_id;
      this.playerName = result.player.username;
      this.rate = result.player.current_rate;
      // セッション情報をlocalStorageに保存
      localStorage.setItem('magicball_player', JSON.stringify({
        playerId: this.playerId,
        playerName: this.playerName,
        rate: this.rate,
        ballType: this.ballType
      }));
    }
    return result;
  }

  /**
   * 登録実行
   */
  async register(playerName, password) {
    const result = await AuthAPI.register(playerName, password);
    if (result.success) {
      // 登録後、自動的にログイン
      return await this.login(playerName, password);
    }
    return result;
  }

  /**
   * セッション復元（ページリロード時など）
   */
  restore() {
    const saved = localStorage.getItem('magicball_player');
    if (saved) {
      const data = JSON.parse(saved);
      this.playerId = data.playerId;
      this.playerName = data.playerName;
      this.rate = data.rate;
      this.ballType = data.ballType || 'kuro';  // ballTypeも復元
      return true;
    }
    return false;
  }

  /**
   * ログアウト
   */
  logout() {
    this.playerId = null;
    this.playerName = null;
    this.rate = 1500;
    this.currentRoomId = null;
    this.ballType = 'kuro';
    localStorage.removeItem('magicball_player');
  }

  /**
   * ログイン状態チェック
   */
  isLoggedIn() {
    return this.playerId !== null;
  }

  /**
   * ルーム作成
   */
  async createRoom(roomName, maxPlayers, gameMode = 'classic') {
    if (!this.isLoggedIn()) {
      throw new Error('ログインが必要です');
    }
    const result = await RoomAPI.createRoom(
      this.playerId,
      roomName,
      maxPlayers,
      this.ballType,
      gameMode
    );
    console.log('[PlayerSession] createRoom result:', result);
    if (result.success) {
      // サーバーからはroom.room_idとして返ってくる
      this.currentRoomId = result.room?.room_id || result.room_id;
      console.log('[PlayerSession] Set currentRoomId:', this.currentRoomId);
    }
    return result;
  }

  /**
   * ルーム参加
   */
  async joinRoom(roomId) {
    if (!this.isLoggedIn()) {
      throw new Error('ログインが必要です');
    }
    console.log('ルーム参加:', { roomId, playerId: this.playerId, ballType: this.ballType });
    const result = await RoomAPI.joinRoom(roomId, this.playerId, this.ballType);
    if (result.success) {
      this.currentRoomId = roomId;
    }
    return result;
  }

  /**
   * ルーム退出
   */
  async leaveRoom() {
    if (!this.isLoggedIn() || !this.currentRoomId) {
      return { success: false, message: 'ルームに参加していません' };
    }
    const result = await RoomAPI.leaveRoom(this.currentRoomId, this.playerId);
    if (result.success) {
      this.currentRoomId = null;
    }
    return result;
  }

  /**
   * ボールタイプ設定
   */
  setBallType(ballType) {
    if (!['kuro', 'shiro', 'kiiro'].includes(ballType)) {
      throw new Error('無効なボールタイプです');
    }
    this.ballType = ballType;
    
    // localStorageも更新
    if (this.isLoggedIn()) {
      const saved = localStorage.getItem('magicball_player');
      if (saved) {
        const data = JSON.parse(saved);
        data.ballType = ballType;
        localStorage.setItem('magicball_player', JSON.stringify(data));
      }
    }
  }
}
