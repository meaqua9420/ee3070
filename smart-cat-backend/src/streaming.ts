/**
 * SSE (Server-Sent Events) Streaming Manager
 * 管理聊天串流連接，支持打字機效果和思考階段推送
 */

import type { Response } from 'express';

/**
 * 思考/生成階段
 */
export type ThinkingPhase =
  | 'idle'
  | 'analyzing_data'      // 分析數據
  | 'retrieving_memory'   // 調用記憶
  | 'generating_response' // 生成回應
  | 'executing_tool'      // 執行工具
  | 'streaming_text'      // 串流文本
  | 'complete'
  | 'error';

/**
 * SSE 事件類型
 */
export type SSEEventType =
  | 'phase'    // 階段變更
  | 'token'    // 文本token（逐字）
  | 'tool'     // 工具調用
  | 'metadata' // 元數據
  | 'error'    // 錯誤
  | 'done';    // 完成

/**
 * SSE 消息格式
 */
export interface SSEMessage {
  type: SSEEventType;
  data: any;
  timestamp?: number;
}

/**
 * SSE 連接管理器
 */
export class SSEConnection {
  private res: Response;
  private closed: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public readonly id: string;

  constructor(res: Response, connectionId: string) {
    this.res = res;
    this.id = connectionId;

    // 設置 SSE 標頭
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 緩衝

    // 發送初始連接消息
    this.send({
      type: 'metadata',
      data: { connected: true, connectionId }
    });

    // 心跳保持連接（每15秒）
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed) {
        this.res.write(':heartbeat\n\n');
      }
    }, 15000);

    // 監聽客戶端斷開
    res.on('close', () => {
      this.close();
    });
  }

  /**
   * 發送 SSE 消息
   */
  send(message: SSEMessage): boolean {
    if (this.closed) return false;

    try {
      const eventData = JSON.stringify({
        ...message,
        timestamp: message.timestamp || Date.now()
      });

      this.res.write(`data: ${eventData}\n\n`);
      return true;
    } catch (error) {
      console.error('SSE send error:', error);
      return false;
    }
  }

  /**
   * 發送階段變更
   */
  sendPhase(phase: ThinkingPhase, details?: string | Record<string, unknown>): boolean {
    const payload =
      typeof details === 'object' && details !== null
        ? { phase, ...details }
        : { phase, details }
    return this.send({
      type: 'phase',
      data: payload,
    });
  }

  /**
   * 發送文本 token（逐字串流）
   */
  sendToken(token: string): boolean {
    return this.send({
      type: 'token',
      data: { token }
    });
  }

  /**
   * 發送工具調用信息
   */
  sendTool(toolName: string, args?: any, result?: any): boolean {
    return this.send({
      type: 'tool',
      data: { toolName, args, result }
    });
  }

  /**
   * 發送錯誤
   */
  sendError(error: string, code?: string): boolean {
    return this.send({
      type: 'error',
      data: { error, code }
    });
  }

  /**
   * 發送完成信號並關閉連接
   */
  sendDone(finalData?: any): void {
    this.send({
      type: 'done',
      data: finalData || {}
    });
    this.close();
  }

  /**
   * 關閉連接
   */
  close(): void {
    if (this.closed) return;

    this.closed = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    try {
      this.res.end();
    } catch (error) {
      // 忽略已關閉連接的錯誤
    }
  }

  /**
   * 檢查連接是否仍然活躍
   */
  isActive(): boolean {
    return !this.closed;
  }

  /**
   * 判斷連線是否已關閉
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * SSE 連接池管理器
 */
export class SSEConnectionPool {
  private connections: Map<string, SSEConnection> = new Map();
  private readonly maxConnections: number;

  constructor(maxConnections: number = 100) {
    this.maxConnections = maxConnections;
  }

  /**
   * 創建新連接
   */
  createConnection(res: Response, connectionId: string): SSEConnection | null {
    // 檢查連接數限制
    if (this.connections.size >= this.maxConnections) {
      console.warn(`SSE connection pool full (${this.maxConnections}), rejecting new connection`);
      return null;
    }

    // 如果已存在，先關閉舊連接
    if (this.connections.has(connectionId)) {
      this.closeConnection(connectionId);
    }

    const connection = new SSEConnection(res, connectionId);
    this.connections.set(connectionId, connection);

    console.log(`SSE connection created: ${connectionId} (total: ${this.connections.size})`);

    return connection;
  }

  /**
   * 獲取連接
   */
  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * 關閉並移除連接
   */
  closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close();
      this.connections.delete(connectionId);
      console.log(`SSE connection closed: ${connectionId} (remaining: ${this.connections.size})`);
    }
  }

  /**
   * 清理所有非活躍連接
   */
  cleanupInactive(): void {
    for (const [id, connection] of this.connections.entries()) {
      if (!connection.isActive()) {
        this.closeConnection(id);
      }
    }
  }

  /**
   * 關閉所有連接
   */
  closeAll(): void {
    for (const [id] of this.connections.entries()) {
      this.closeConnection(id);
    }
  }

  /**
   * 獲取當前連接數
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
}

/**
 * 文本串流工具：將完整文本分割成token流
 */
export class TextStreamer {
  /**
   * 將文本分割成單詞級別的tokens
   * 支持中文、英文、標點符號
   */
  static tokenize(text: string): string[] {
    const tokens: string[] = [];

    // 正則：匹配中文字符、英文單詞、數字、標點符號
    const regex = /[\u4e00-\u9fa5]|[a-zA-Z]+|[0-9]+|[^\s\u4e00-\u9fa5a-zA-Z0-9]+|\s+/g;
    const matches = text.match(regex);

    if (matches) {
      for (const match of matches) {
        // 中文逐字，英文/數字保持完整單詞
        if (/[\u4e00-\u9fa5]/.test(match)) {
          tokens.push(match);
        } else {
          tokens.push(match);
        }
      }
    }

    return tokens;
  }

  /**
   * 串流發送文本
   * @param connection SSE連接
   * @param text 要發送的文本
   * @param delayMs 每個token之間的延遲（毫秒）
   */
  static async streamText(
    connection: SSEConnection,
    text: string,
    delayMs: number = 30
  ): Promise<void> {
    const tokens = this.tokenize(text);

    console.log('[TextStreamer] Starting to stream text:', {
      totalTokens: tokens.length,
      textLength: text.length,
      textPreview: text.substring(0, 50) + '...',
      connectionActive: connection.isActive()
    })

    for (let i = 0; i < tokens.length; i++) {
      if (!connection.isActive()) {
        console.log('[TextStreamer] Connection closed at token', i, '/', tokens.length)
        break;
      }

      const token = tokens[i]
      if (typeof token !== 'string') {
        continue
      }
      connection.sendToken(token);

      // 延遲（打字機效果）
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log('[TextStreamer] Finished streaming text:', {
      tokensStreamed: tokens.length,
      connectionStillActive: connection.isActive()
    })
  }
}

// 導出全局連接池實例
export const globalSSEPool = new SSEConnectionPool(100);

// 定期清理非活躍連接（每分鐘）
setInterval(() => {
  globalSSEPool.cleanupInactive();
}, 60000);
