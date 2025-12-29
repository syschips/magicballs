/**
 * WebRTC P2P通信管理
 * ホスト権威方式: ホストが各参加者と個別に接続
 * @module webrtc
 */

console.log('[WebRTC Module] LOADED - v2025-12-21-new');

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
    // 送信待ちメッセージ（DataChannel open 前にバッファ）(playerId -> Array<Object>)
    this.pendingMessages = new Map();
    
    // 処理済みシグナルの記録（重複処理防止）(peerId -> {offerHash, answerHash, candidateCount})
    this.processedSignals = new Map();
    
    // シグナリングポーリング
    this.signalingInterval = null;
    
    // イベントハンドラ
    this.onMessageCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onDataChannelOpenCallback = null;
    
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
   * 簡易ハッシュ関数（DJB2）
   * @private
   */
  _hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // 32bit整数に変換
    }
    return Math.abs(hash).toString(36);
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
    
    // ICE Candidate処理（DataChannelより前に登録）
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] ICE candidate generated for ${targetId}:`, event.candidate.candidate);
        this.sendSignal(targetId, 'candidate', event.candidate);
      } else {
        console.log(`[WebRTC] ICE gathering complete for ${targetId}`);
      }
    };
    
    // ICE接続状態の監視
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state with ${targetId}: ${pc.iceConnectionState}`);
    };
    
    // 接続状態の監視
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetId}:`, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState
      });
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(targetId, pc.connectionState);
      }
    };
    
    // DataChannelを作成（ハンドラ登録後に作成）
    const dc = pc.createDataChannel('gameData', {
      ordered: false, // 順序保証なし（低レイテンシ優先）
      maxRetransmits: 0 // 再送なし
    });
    
    this.setupDataChannel(dc, targetId);
    this.dataChannels.set(targetId, dc);
    console.log(`[WebRTC] DataChannel created for ${targetId}, initial state: ${dc.readyState}`);
    
    // Offerを作成
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log(`[WebRTC] Local description set for ${targetId}, signalingState: ${pc.signalingState}`);
    
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
    
    // ICE Candidate処理（ondatachannelより前に登録）
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] ICE candidate generated for ${hostId}:`, event.candidate.candidate);
        this.sendSignal(hostId, 'candidate', event.candidate);
      } else {
        console.log(`[WebRTC] ICE gathering complete for ${hostId}`);
      }
    };
    
    // ICE接続状態の監視
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state with ${hostId}: ${pc.iceConnectionState}`);
    };
    
    // 接続状態の監視
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${hostId}:`, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState
      });
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(hostId, pc.connectionState);
      }
    };
    
    // DataChannelを受信
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      console.log(`[WebRTC] DataChannel event received from ${hostId}, state: ${dc.readyState}`);
      this.setupDataChannel(dc, hostId);
      this.dataChannels.set(hostId, dc);
      console.log('[WebRTC] DataChannel registered for:', hostId);
    };
    
    // Remote Descriptionを設定
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[WebRTC] Remote description set for ${hostId}, signalingState: ${pc.signalingState}`);
    
    // Answerを作成
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`[WebRTC] Local description set for ${hostId}, signalingState: ${pc.signalingState}`);
    
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
      console.log(`[WebRTC] DataChannel opened with ${peerId}, readyState: ${dc.readyState}`);
      // バッファされているメッセージをフラッシュ
      const queue = this.pendingMessages.get(peerId);
      if (queue && queue.length) {
        for (const msg of queue) {
          try {
            dc.send(JSON.stringify(msg));
          } catch (error) {
            console.error(`[WebRTC] Failed to flush queued message to ${peerId}:`, error);
          }
        }
        this.pendingMessages.delete(peerId);
      }
      // アプリ層へ通知（遅延open時の再試行などに使用）
      if (typeof this.onDataChannelOpenCallback === 'function') {
        try {
          this.onDataChannelOpenCallback(peerId);
        } catch (cbErr) {
          console.warn('[WebRTC] onDataChannelOpen callback error:', cbErr);
        }
      }
    };
    
    dc.onclose = () => {
      console.log(`[WebRTC] DataChannel closed with ${peerId}`);
      // 古いDataChannelのcloseイベントで最新エントリを消さないようガード
      const current = this.dataChannels.get(peerId);
      if (current === dc) {
        this.dataChannels.delete(peerId);
      }
    };
    
    dc.onerror = (error) => {
      const details = {
        peerId,
        readyState: dc.readyState,
        bufferedAmount: dc.bufferedAmount,
        message: error?.message,
        name: error?.name
      };
      console.error('[WebRTC] DataChannel error', details);
      handleWebRTCError(error, peerId);
    };
    
    // DataChannelの状態変化を監視（デバッグ用）
    dc.onbufferedamountlow = () => {
      // ログ削減: bufferedamountlowは頻繁すぎるため出力しない
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
    
    // 500ms間隔でポーリング（より頻繁に候補を確認）
    this.signalingInterval = setInterval(() => {
      this.pollSignaling();
    }, 500);
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
    
    // 重複処理の検出と回避（Answerのみチェック。Offerは毎回新しいため不要）
    const currentProcessed = this.processedSignals.get(peerId) || {};
    let skipAnswerApply = false;
    
    // Answerの重複チェック（2ゲーム目以降で古いAnswerが返されるのを防止）
    if (signal.answer) {
      const answerStr = JSON.stringify(signal.answer);
      const answerHash = this._hashString(answerStr);
      if (currentProcessed.answerHash === answerHash) {
        console.log('[WebRTC] Duplicate answer detected, skipping re-apply but will process candidates:', peerId);
        skipAnswerApply = true;
      }
      currentProcessed.answerHash = answerHash;
    }
    
    // Offer は重複チェックしない（毎回新しいOffer/signalingStateなため）
    if (signal.offer) {
      // Offer受信時はprocessedSignalsを更新しない（Answerの状態のみ記録）
    }
    
    // 候補の重複チェック
    if (signal.candidates && signal.candidates.length > 0) {
      const candidateCount = signal.candidates.length;
      if (currentProcessed.candidateCount === candidateCount && 
          currentProcessed.lastCandidateTime && 
          Date.now() - currentProcessed.lastCandidateTime < 100) {
        // 短時間に同じ数の候補が来た = 重複の可能性
        console.log('[WebRTC] Potential duplicate candidates detected, skipping:', peerId);
        return;
      }
      currentProcessed.candidateCount = candidateCount;
      currentProcessed.lastCandidateTime = Date.now();
    }
    
    this.processedSignals.set(peerId, currentProcessed);

    try {
      // Offerを受信（参加者のみ）
      if (signal.offer) {
        const existingPc = this.peers.get(peerId);
        // 接続中（connecting/connected）は置き換えずに既存の確立を待つ
        // ただし、失敗/切断状態（failed/disconnected）は置き換える
        const progressingStates = ['connected', 'completed', 'connecting'];
        const progressingIceStates = ['connected', 'completed', 'checking'];
        const existingDc = this.dataChannels.get(peerId);
        const dcOpen = existingDc && existingDc.readyState === 'open';
        const isProgressing = existingPc && (
          progressingStates.includes(existingPc.connectionState) || 
          progressingIceStates.includes(existingPc.iceConnectionState)
        );
        // DataChannel が未openのまま進行中で張り付き続けるケースを救済: DCが開いていなければ置き換えを許可
        const shouldReplaceStuckProgress = existingPc && !dcOpen;

        if (existingPc && isProgressing && !shouldReplaceStuckProgress) {
          // 接続が進行中または完了しておりDCも開いている/開く見込みなので既存を保持
          console.log('[WebRTC] Offer received but existing connection is progressing, keeping current peer:', peerId, existingPc.connectionState, existingPc.iceConnectionState, 'dc:', existingDc?.readyState);
        } else {
          if (existingPc) {
            try {
              const dc = this.dataChannels.get(peerId);
              if (dc && dc.readyState !== 'closed') dc.close();
            } catch (_) {}
            try {
              existingPc.close();
            } catch (_) {}
            this.dataChannels.delete(peerId);
            this.peers.delete(peerId);
            console.log('[WebRTC] Replacing existing peer for new offer from:', peerId, { previousState: existingPc?.connectionState, iceState: existingPc?.iceConnectionState, dcState: existingDc?.readyState });
          }
          if (!this.peers.has(peerId)) {
            console.log('[WebRTC] Received offer from:', peerId);
            await this.createAnswerConnection(peerId, signal.offer);
          }
        }
      }
      
      // Answerを受信（ホストのみ）
      if (signal.answer && this.peers.has(peerId)) {
        const pc = this.peers.get(peerId);
        if (pc.signalingState === 'have-local-offer') {
          console.log('[WebRTC] Received answer from:', peerId);
          console.log('[WebRTC] Answer processing - before setRemoteDescription:', {
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState
          });
          if (!skipAnswerApply) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          } else {
            console.log('[WebRTC] Skipped re-applying duplicate answer for:', peerId);
          }
          console.log('[WebRTC] Answer processing - after setRemoteDescription:', {
            signalingState: pc.signalingState,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState
          });
        } else {
          console.log('[WebRTC] Answer received but signalingState not "have-local-offer":', peerId, pc.signalingState);
        }
      }
      
      // ICE Candidateを受信
      if (signal.candidates && signal.candidates.length > 0) {
        const pc = this.peers.get(peerId);
        if (pc) {
          // ログ削減: ICE候補追加は頻繁すぎるため出力しない
          for (const candidate of signal.candidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              // 既に追加済みや無効な候補の場合のみ警告
              console.warn(`[WebRTC] Failed to add ICE candidate for ${peerId}:`, error.message);
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
    // peer接続が存在するか確認
    if (!this.peers.has(targetId)) {
      console.warn(`[WebRTC] No peer connection for ${targetId}`);
      return;
    }
    
    const pc = this.peers.get(targetId);
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      console.warn(`[WebRTC] Peer connection is ${pc.connectionState} for ${targetId}`);
      return;
    }
    
    const dc = this.dataChannels.get(targetId);
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebRTC] Failed to send message to ${targetId}:`, error);
      }
    } else {
      // DataChannel未オープン: キューに積んでonopen時に送信
      const queue = this.pendingMessages.get(targetId) || [];
      queue.push(message);
      this.pendingMessages.set(targetId, queue);
      console.warn(`[WebRTC] DataChannel not ready for ${targetId}, queued message. state: ${dc ? dc.readyState : 'undefined'}`);
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
      // peer接続の状態も確認
      const pc = this.peers.get(targetId);
      if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        continue; // 無効な接続はスキップ
      }
      
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify(message));
        } catch (error) {
          console.error(`[WebRTC] Failed to broadcast to ${targetId}:`, error);
        }
      } else {
        // DataChannel未オープン: キューに積んでonopen時に送信
        const queue = this.pendingMessages.get(targetId) || [];
        queue.push(message);
        this.pendingMessages.set(targetId, queue);
      }
    }
  }

  /**
   * 接続再試行（ホスト→参加者）
   * 既存のPeerConnection/DataChannelをクローズして、新規にOffer接続を作成
   * @param {number} targetId
   */
  async retryOfferConnection(targetId, force = false) {
    try {
      const existingDc = this.dataChannels.get(targetId);
      const existingPc = this.peers.get(targetId);

      // 既に接続が進行中/確立済み、またはDCがopenならリトライせず様子を見る
      const safeStates = ['connected', 'completed', 'connecting'];
      const iceSafeStates = ['connected', 'completed', 'checking'];
      const pcSafe = existingPc && (safeStates.includes(existingPc.connectionState) || iceSafeStates.includes(existingPc.iceConnectionState));
      const dcOpen = existingDc && existingDc.readyState === 'open';
      if (!force && (pcSafe || dcOpen)) {
        console.log('[WebRTC] retryOfferConnection skipped (connection in progress or open):', targetId, {
          pcState: existingPc?.connectionState,
          iceState: existingPc?.iceConnectionState,
          dcState: existingDc?.readyState,
          forced: force
        });
        return;
      }

      // 不安定な場合のみ再作成
      if (existingDc && existingDc.readyState !== 'closed') {
        try { existingDc.close(); } catch (_) {}
      }
      this.dataChannels.delete(targetId);
      if (existingPc && existingPc.connectionState !== 'closed') {
        try { existingPc.close(); } catch (_) {}
      }
      this.peers.delete(targetId);
      this.pendingMessages.delete(targetId);
      this.processedSignals.delete(targetId);
      console.log('[WebRTC] Retrying offer connection to:', targetId, { forced: force });
      await this.createOfferConnection(targetId);
    } catch (err) {
      console.warn('[WebRTC] retryOfferConnection error:', err);
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
   * DataChannelがopenした際のコールバックを設定
   * 遅延オープン時の開始ブロードキャスト再試行などに使用
   * @param {Function} callback - (peerId: number) => void
   */
  onDataChannelOpen(callback) {
    this.onDataChannelOpenCallback = callback;
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
    
    // DataChannelをクローズ（エラーハンドリング付き）
    for (const [peerId, dc] of this.dataChannels) {
      try {
        if (dc.readyState !== 'closed') {
          dc.close();
        }
      } catch (error) {
        console.warn(`[WebRTC] Error closing DataChannel for ${peerId}:`, error);
      }
    }
    this.dataChannels.clear();
    
    // PeerConnectionをクローズ（エラーハンドリング付き）
    for (const [peerId, pc] of this.peers) {
      try {
        if (pc.connectionState !== 'closed') {
          pc.close();
        }
      } catch (error) {
        console.warn(`[WebRTC] Error closing PeerConnection for ${peerId}:`, error);
      }
    }
    this.peers.clear();
    // シグナル/キューをクリア（ゲーム再開時に古い情報を持ち越さない）
    this.pendingMessages.clear();
    this.processedSignals.clear();
    
    console.log('[WebRTC] All connections closed successfully');
  }
}

/**
 * WebRTCManagerのファクトリー関数
 */
export function createWebRTCManager(roomId, playerId, isHost) {
  return new WebRTCManager(roomId, playerId, isHost);
}
