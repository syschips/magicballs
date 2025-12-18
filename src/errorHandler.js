/**
 * 共通エラーハンドリングユーティリティ
 * @module errorHandler
 */

import { showError } from './notifications.js';

/**
 * エラーの種類
 * @enum {string}
 */
export const ErrorType = {
  NETWORK: 'network',
  AUTH: 'auth',
  VALIDATION: 'validation',
  WEBRTC: 'webrtc',
  GAME: 'game',
  UNKNOWN: 'unknown'
};

/**
 * カスタムエラークラス
 * @class
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - エラーメッセージ
   * @param {ErrorType} type - エラータイプ
   * @param {Object} [details={}] - 追加の詳細情報
   */
  constructor(message, type = ErrorType.UNKNOWN, details = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date();
  }
}

/**
 * エラーをログに記録
 * @param {Error|AppError} error - エラーオブジェクト
 * @param {string} [context=''] - エラー発生のコンテキスト
 * @private
 */
function logError(error, context = '') {
  const prefix = context ? `[${context}]` : '';
  
  if (error instanceof AppError) {
    console.error(`${prefix} ${error.type.toUpperCase()} Error:`, {
      message: error.message,
      type: error.type,
      details: error.details,
      timestamp: error.timestamp,
      stack: error.stack
    });
  } else {
    console.error(`${prefix} Error:`, error);
  }
}

/**
 * エラーを適切に処理してユーザーに通知
 * @param {Error|AppError} error - エラーオブジェクト
 * @param {string} [context=''] - エラー発生のコンテキスト
 * @param {boolean} [showToUser=true] - ユーザーに通知を表示するか
 */
export function handleError(error, context = '', showToUser = true) {
  // ログに記録
  logError(error, context);
  
  // ユーザーへの通知
  if (showToUser) {
    let userMessage = 'エラーが発生しました';
    
    if (error instanceof AppError) {
      switch (error.type) {
        case ErrorType.NETWORK:
          userMessage = `ネットワークエラー: ${error.message}`;
          break;
        case ErrorType.AUTH:
          userMessage = `認証エラー: ${error.message}`;
          break;
        case ErrorType.VALIDATION:
          userMessage = `入力エラー: ${error.message}`;
          break;
        case ErrorType.WEBRTC:
          userMessage = `接続エラー: ${error.message}`;
          break;
        case ErrorType.GAME:
          userMessage = `ゲームエラー: ${error.message}`;
          break;
        default:
          userMessage = error.message || 'エラーが発生しました';
      }
    } else {
      userMessage = error.message || 'エラーが発生しました';
    }
    
    showError(userMessage);
  }
}

/**
 * 非同期関数をラップしてエラーハンドリングを追加
 * @param {Function} fn - ラップする非同期関数
 * @param {string} [context=''] - エラー発生のコンテキスト
 * @returns {Function} エラーハンドリング付きの関数
 */
export function withErrorHandling(fn, context = '') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      handleError(error, context);
      throw error; // 再スローして呼び出し元でもハンドリング可能に
    }
  };
}

/**
 * fetch APIのレスポンスをチェックしてエラーを投げる
 * @param {Response} response - fetchのレスポンス
 * @returns {Promise<Object>} JSONパース後のデータ
 * @throws {AppError} レスポンスがOKでない場合
 */
export async function checkResponse(response) {
  const data = await response.json();
  
  if (!response.ok) {
    throw new AppError(
      data.message || `HTTP error! status: ${response.status}`,
      ErrorType.NETWORK,
      { status: response.status, data }
    );
  }
  
  if (data.success === false) {
    throw new AppError(
      data.message || 'APIエラー',
      ErrorType.NETWORK,
      { data }
    );
  }
  
  return data;
}

/**
 * WebRTCエラーを処理
 * @param {Error} error - WebRTCエラー
 * @param {string} peerId - 接続先のピアID
 */
export function handleWebRTCError(error, peerId) {
  const appError = new AppError(
    `WebRTC接続エラー (Peer: ${peerId})`,
    ErrorType.WEBRTC,
    { peerId, originalError: error.message }
  );
  handleError(appError, 'WebRTC');
}

/**
 * 入力検証エラーを作成
 * @param {string} field - フィールド名
 * @param {string} message - エラーメッセージ
 * @returns {AppError}
 */
export function createValidationError(field, message) {
  return new AppError(
    message,
    ErrorType.VALIDATION,
    { field }
  );
}
