/**
 * WebRTC P2P通信管理
 * ホスト権威方式: ホストが各参加者と個別に接続
 * @module webrtc
 */

import { handleWebRTCError, handleError, AppError, ErrorType } from './errorHandler.js';

const API_BASE_URL = './server/api';

/**
 * WebRTC接続を管理するクラス
 * ホスト権威方式でピアツーピア接続を確立し、ゲーム状態と入力イベントを同期
 * @class
 */
export class WebRTCManager {
  /**
   * WebRTCマネージャーを作成
   * @param {string} roomId - ルームID
   * @param {number} playerId - このクライアントのプレイヤーID
   * @param {boolean} isHost - このクライアントがホストかどうか
   */
  constructor(roomId, playerId, isHost) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.isHost = isHost;
    
    // RTCPeerConnection管理 (playerId -> RTCPeerConnection)
    this.peers = new Map();
    
    // RTCDataChannel管理 (playerId -> RTCDataChannel)
    this.dataChannels = new Map();
    
    // シグナリングポーリング
    this.signalingInterval = null;
    
    // イベントハンドラ
    this.onMessageCallback = null;
    this.onConnectionStateChangeCallback = null;
    
    // ICE Serverの設定（STUNサーバー使用）
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    console.log('[WebRTC] Initialized:', { roomId, playerId, isHost });
  }
  
  /**
   * ホストとして全参加者と接続を確立
   * 各参加者に対してOfferを送信し、WebRTC接続を開始する
   * @param {number[]} participantIds - 参加者のプレイヤーID配列
   * @returns {Promise<void>}
   */
  async connectAsHost(participantIds) {
    console.log('[WebRTC Host] Connecting to participants:', participantIds);
    
    for (const targetId of participantIds) {
      if (targetId === this.playerId) continue; // 自分自身はスキップ
      
      try {
        await this.createOfferConnection(targetId);
      } catch (error) {
        handleWebRTCError(error, targetId);
      }
    }
    
    // シグナリングのポーリング開始
    this.startSignalingPoll();
  }
  
  /**
   * 参加者としてホストと接続
   * ホストからのOfferを待機し、Answerで応答する
   * @param {number} hostId - ホストのプレイヤーID
   * @returns {Promise<void>}
   */
  async connectAsParticipant(hostId) {
    console.log('[WebRTC Participant] Waiting for offer from host:', hostId);
    
    // シグナリングのポーリング開始（Offerを待つ）
    this.startSignalingPoll();
  }
  
  /**
   * Offer側の接続を作成（ホスト→参加者）
   * RTCPeerConnectionとDataChannelを作成し、Offerを送信
   * @param {number} targetId - 接続先の参加者プレイヤーID
   * @returns {Promise<void>}
   * @private
   */
  async createOfferConnection(targetId) {
    console.log('[WebRTC] Creating offer connection to:', targetId);
    
    const pc = new RTCPeerConnection(this.iceServers);
    this.peers.set(targetId, pc);
    
    // DataChannelを作成（Offer側が作成）
    const dc = pc.createDataChannel('gameData', {
      ordered: false, // 順序保証なし（低レイテンシ優先）
      maxRetransmits: 0 // 再送なし
    });
    
    this.setupDataChannel(dc, targetId);
    this.dataChannels.set(targetId, dc);
    
    // ICE Candidate処理
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(targetId, 'candidate', event.candidate);
      }
    };
    
    // 接続状態の監視
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetId}:`, pc.connectionState);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(targetId, pc.connectionState);
      }
    };
    
    // Offerを作成
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Offerをシグナリングサーバーに送信
    await this.sendSignal(targetId, 'offer', offer);
    
    console.log('[WebRTC] Offer sent to:', targetId);
  }
  
  /**
   * Answer側の接続を作成（参加者→ホスト）
   * ホストからのOfferを受け取り、RTCPeerConnectionを作成してAnswerを送信
   * @param {number} hostId - ホストのプレイヤーID
   * @param {RTCSessionDescriptionInit} offer - ホストから受信したOffer
   * @returns {Promise<void>}
   * @private
   */
  async createAnswerConnection(hostId, offer) {
    console.log('[WebRTC] Creating answer connection to:', hostId);
    
    const pc = new RTCPeerConnection(this.iceServers);
    this.peers.set(hostId, pc);
    
    // DataChannelを受信
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      this.setupDataChannel(dc, hostId);
      this.dataChannels.set(hostId, dc);
      console.log('[WebRTC] DataChannel received from:', hostId);
    };
    
    // ICE Candidate処理
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(hostId, 'candidate', event.candidate);
      }
    };
    
    // 接続状態の監視
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${hostId}:`, pc.connectionState);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(hostId, pc.connectionState);
      }
    };
    
    // Remote Descriptionを設定
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Answerを作成
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    // Answerをシグナリングサーバーに送信
    await this.sendSignal(hostId, 'answer', answer);
    
    console.log('[WebRTC] Answer sent to:', hostId);
  }
  
  /**
   * DataChannelのイベントハンドラーをセットアップ
   * open/close/error/messageイベントを処理
   * @param {RTCDataChannel} dc - セットアップ対象のDataChannel
   * @param {number} peerId - 接続先のプレイヤーID
   * @private
   */
  setupDataChannel(dc, peerId) {
    dc.onopen = () => {
      console.log(`[WebRTC] DataChannel opened with ${peerId}`);
    };
    
    dc.onclose = () => {
      console.log(`[WebRTC] DataChannel closed with ${peerId}`);
    };
    
    dc.onerror = (error) => {
      handleWebRTCError(error, peerId);
    };
    
    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (this.onMessageCallback) {
          this.onMessageCallback(peerId, message);
        }
      } catch (error) {
        const appError = new AppError(
          'メッセージのパースに失敗しました',
          ErrorType.WEBRTC,
          { peerId, rawData: event.data }
        );
        handleError(appError, 'WebRTC.onmessage', false);
      }
    };
  }
  
  /**
   * シグナリングデータをサーバー経由で送信
   * Offer/Answer/ICE Candidateをデータベースに保存
   * @param {number} targetId - 送信先のプレイヤーID
   * @param {string} type - シグナルタイプ（'offer'|'answer'|'candidate'）
   * @param {Object} data - 送信するシグナルデータ
   * @returns {Promise<void>}
   * @private
   */
  async sendSignal(targetId, type, data) {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/signaling.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          player_id: this.playerId,
          type: type,
          data: data
        })
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new AppError(
          `シグナル送信失敗: ${result.message}`,
          ErrorType.WEBRTC,
          { targetId, type, result }
        );
      }
    } catch (error) {
      if (error instanceof AppError) {
        handleError(error, 'WebRTC.sendSignal', false);
      } else {
        handleWebRTCError(error, targetId);
      }
    }
  }
  
  /**
   * シグナリングデータのポーリング開始
   * 1秒間隔でサーバーから新しいシグナルを取得
   * @private
   */
  startSignalingPoll() {
    if (this.signalingInterval) return; // 既に開始済み
    
    console.log('[WebRTC] Starting signaling poll');
    
    // 即座に1回実行
    this.pollSignaling();
    
    // 1秒間隔でポーリング
    this.signalingInterval = setInterval(() => {
      this.pollSignaling();
    }, 1000);
  }
  
  /**
   * シグナリングデータをサーバーから取得
   * 新しいOffer/Answer/ICE Candidateを処理
   * @returns {Promise<void>}
   * @private
   */
  async pollSignaling() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/signaling.php?room_id=${this.roomId}&player_id=${this.playerId}`
      );
      
      const result = await response.json();
      
      if (result.success && result.signals) {
        for (const signal of result.signals) {
          await this.handleSignal(signal);
        }
      }
    } catch (error) {
      // ポーリングエラーはユーザーに通知せずログのみ
      const appError = new AppError(
        'シグナル取得エラー',
        ErrorType.WEBRTC,
        { error: error.message }
      );
      handleError(appError, 'WebRTC.pollSignaling', false);
    }
  }
  
  /**
   * 受信したシグナリングデータを処理
   * Offer/Answer/ICE Candidateを適切にRTCPeerConnectionに適用
   * @param {Object} signal - シグナルデータ
   * @param {number} signal.player_id - 送信元プレイヤーID
   * @param {RTCSessionDescriptionInit} [signal.offer] - Offerデータ
   * @param {RTCSessionDescriptionInit} [signal.answer] - Answerデータ
   * @param {RTCIceCandidateInit[]} [signal.candidates] - ICE Candidate配列
   * @returns {Promise<void>}
   * @private
   */
  async handleSignal(signal) {
    const peerId = signal.player_id;
    
    try {
      // Offerを受信（参加者のみ）
      if (signal.offer && !this.peers.has(peerId)) {
        console.log('[WebRTC] Received offer from:', peerId);
        await this.createAnswerConnection(peerId, signal.offer);
      }
      
      // Answerを受信（ホストのみ）
      if (signal.answer && this.peers.has(peerId)) {
        const pc = this.peers.get(peerId);
        if (pc.signalingState === 'have-local-offer') {
          console.log('[WebRTC] Received answer from:', peerId);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        }
      }
      
      // ICE Candidateを受信
      if (signal.candidates && signal.candidates.length > 0) {
        const pc = this.peers.get(peerId);
        if (pc && pc.remoteDescription) {
          for (const candidate of signal.candidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              // 既に追加済みの可能性があるので警告のみ
              console.warn('[WebRTC] Failed to add ICE candidate:', error);
            }
          }
        }
      }
    } catch (error) {
      handleWebRTCError(error, peerId);
    }
  }
  
  /**
   * 特定のプレイヤーにメッセージを送信
   * DataChannelが開いている場合のみJSON化して送信
   * @param {number} targetId - 送信先プレイヤーID
   * @param {Object} message - 送信するメッセージオブジェクト
   */
  send(targetId, message) {
    const dc = this.dataChannels.get(targetId);
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebRTC] Failed to send message to ${targetId}:`, error);
      }
    } else {
      console.warn(`[WebRTC] DataChannel not ready for ${targetId}`);
    }
  }
  
  /**
   * 全参加者にメッセージをブロードキャスト（ホスト専用）
   * スナップショットやゲーム状態の同期に使用
   * @param {Object} message - ブロードキャストするメッセージオブジェクト
   */
  broadcast(message) {
    if (!this.isHost) {
      console.warn('[WebRTC] Only host can broadcast');
      return;
    }
    
    for (const [targetId, dc] of this.dataChannels) {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(message));
        } catch (error) {
          console.error(`[WebRTC] Failed to broadcast to ${targetId}:`, error);
        }
      }
    }
  }
  
  /**
   * メッセージ受信時のコールバックを設定
   * スナップショットや入力イベントの受信時に呼ばれる
   * @param {Function} callback - (senderId: number, message: Object) => void
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }
  
  /**
   * 接続状態変化時のコールバックを設定
   * 接続/切断/失敗の検知に使用
   * @param {Function} callback - (peerId: number, state: string) => void
   */
  onConnectionStateChange(callback) {
    this.onConnectionStateChangeCallback = callback;
  }
  
  /**
   * 全プレイヤーとの接続状態を取得
   * @returns {Object<number, string>} playerIdをキー、connectionStateを値とするオブジェクト
   */
  getConnectionStates() {
    const states = {};
    for (const [peerId, pc] of this.peers) {
      states[peerId] = pc.connectionState;
    }
    return states;
  }
  
  /**
   * 全ての接続をクローズ
   */
  close() {
    console.log('[WebRTC] Closing all connections');
    
    // シグナリングポーリング停止
    if (this.signalingInterval) {
      clearInterval(this.signalingInterval);
      this.signalingInterval = null;
    }
    
    // DataChannelをクローズ
    for (const [peerId, dc] of this.dataChannels) {
      dc.close();
    }
    this.dataChannels.clear();
    
    // PeerConnectionをクローズ
    for (const [peerId, pc] of this.peers) {
      pc.close();
    }
    this.peers.clear();
  }
}

/**
 * WebRTCManagerのファクトリー関数
 */
export function createWebRTCManager(roomId, playerId, isHost) {
  return new WebRTCManager(roomId, playerId, isHost);
}
