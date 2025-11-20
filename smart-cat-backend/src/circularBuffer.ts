/**
 * 循环缓冲区实现
 * Circular Buffer implementation
 *
 * 用于限制内存中存储的事件/日志数量
 * Used to limit the amount of events/logs stored in memory
 */

/**
 * 通用的循环缓冲区类
 * Generic Circular Buffer class
 *
 * 当缓冲区满时，最旧的元素会被自动删除
 * When the buffer is full, the oldest elements are automatically removed
 *
 * @example
 * const buffer = new CircularBuffer<LogEntry>(100)
 * buffer.push({ timestamp: Date.now(), message: 'test' })
 * const allLogs = buffer.getAll() // 最多100条日志
 */
export class CircularBuffer<T> {
  private buffer: T[] = []
  private maxSize: number

  /**
   * @param maxSize - 缓冲区的最大容量 / Maximum capacity of the buffer
   */
  constructor(maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('缓冲区大小必须大于0 / Buffer size must be greater than 0')
    }
    this.maxSize = maxSize
  }

  /**
   * 添加元素到缓冲区
   * Add element to buffer
   * 如果缓冲区已满，删除最旧的元素
   * If buffer is full, the oldest element is removed
   */
  push(item: T): void {
    this.buffer.push(item)

    // 如果超过最大大小，删除最旧的元素
    // If exceeds max size, remove oldest element
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  /**
   * 获取所有元素
   * Get all elements in the buffer
   */
  getAll(): T[] {
    return [...this.buffer]
  }

  /**
   * 获取最后N个元素
   * Get the last N elements
   */
  getLast(count: number): T[] {
    const start = Math.max(0, this.buffer.length - count)
    return this.buffer.slice(start)
  }

  /**
   * 获取缓冲区大小
   * Get current size of the buffer
   */
  size(): number {
    return this.buffer.length
  }

  /**
   * 获取缓冲区容量
   * Get maximum capacity of the buffer
   */
  capacity(): number {
    return this.maxSize
  }

  /**
   * 清空缓冲区
   * Clear the buffer
   */
  clear(): void {
    this.buffer = []
  }

  /**
   * 检查缓冲区是否已满
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.buffer.length >= this.maxSize
  }
}

/**
 * 带有时间戳的事件缓冲区
 * Event buffer with timestamps
 *
 * 自动为每个事件添加时间戳
 * Automatically adds timestamp to each event
 *
 * @example
 * const eventBuffer = new TimestampedBuffer<LogEntry>(100)
 * eventBuffer.push({ message: 'test' })
 * // 自动添加 timestamp 字段
 */
export class TimestampedBuffer<T extends Record<string, unknown>> {
  private buffer: CircularBuffer<T & { timestamp: string }>

  constructor(maxSize: number) {
    this.buffer = new CircularBuffer(maxSize)
  }

  /**
   * 添加事件（自动添加时间戳）
   * Add event with automatic timestamp
   */
  push(item: T): void {
    const withTimestamp = {
      ...item,
      timestamp: new Date().toISOString(),
    } as T & { timestamp: string }

    this.buffer.push(withTimestamp)
  }

  /**
   * 获取所有事件
   * Get all events
   */
  getAll(): (T & { timestamp: string })[] {
    return this.buffer.getAll()
  }

  /**
   * 获取最近N个事件
   * Get recent N events
   */
  getRecent(count: number): (T & { timestamp: string })[] {
    return this.buffer.getLast(count)
  }

  /**
   * 获取在指定时间范围内的事件
   * Get events within time range
   *
   * @param startTime - 开始时间 (ISO 8601 格式)
   * @param endTime - 结束时间 (ISO 8601 格式)
   */
  getByTimeRange(startTime: string, endTime: string): (T & { timestamp: string })[] {
    const start = new Date(startTime).getTime()
    const end = new Date(endTime).getTime()

    return this.buffer.getAll().filter((item) => {
      const itemTime = new Date(item.timestamp).getTime()
      return itemTime >= start && itemTime <= end
    })
  }

  /**
   * 获取缓冲区大小
   * Get current size
   */
  size(): number {
    return this.buffer.size()
  }

  /**
   * 清空缓冲区
   * Clear buffer
   */
  clear(): void {
    this.buffer.clear()
  }

  /**
   * 获取容量
   * Get capacity
   */
  capacity(): number {
    return this.buffer.capacity()
  }
}

/**
 * 带有计数的事件缓冲区
 * Event buffer with counters
 *
 * 追踪不同类型事件的数量
 * Tracks count of different event types
 *
 * @example
 * const counter = new CountedBuffer<ToolLog>(100)
 * counter.push({ tool: 'updateSettings', success: true })
 * counter.getStats() // 返回每种工具的执行次数
 */
export class CountedBuffer<T extends { [K in keyof T]: T[K] }> {
  private buffer: CircularBuffer<T>
  private counts: Map<string, number> = new Map()

  constructor(maxSize: number) {
    this.buffer = new CircularBuffer(maxSize)
  }

  /**
   * 添加项目并更新计数
   * Add item and update counts
   *
   * @param item - 要添加的项目
   * @param countKey - 用于计数的键 / Key to use for counting
   */
  push(item: T, countKey?: string): void {
    this.buffer.push(item)

    if (countKey) {
      const current = this.counts.get(countKey) ?? 0
      this.counts.set(countKey, current + 1)

      // 如果缓冲区满，重新计算计数
      // If buffer is full, recalculate counts
      if (this.buffer.isFull()) {
        this.recalculateCounts(countKey)
      }
    }
  }

  /**
   * 重新计算计数（用于删除旧项目时）
   * Recalculate counts (when old items are removed)
   */
  private recalculateCounts(countKey: string): void {
    // 完整重新计算（简化版本）
    // Full recalculation (simplified version)
    let count = 0
    for (const item of this.buffer.getAll()) {
      if ((item as Record<string, unknown>)[countKey] !== undefined) {
        count++
      }
    }
    this.counts.set(countKey, count)
  }

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.counts)
  }

  /**
   * 获取所有项目
   * Get all items
   */
  getAll(): T[] {
    return this.buffer.getAll()
  }

  /**
   * 清空缓冲区和计数
   * Clear buffer and counts
   */
  clear(): void {
    this.buffer.clear()
    this.counts.clear()
  }

  /**
   * 获取大小
   * Get size
   */
  size(): number {
    return this.buffer.size()
  }

  /**
   * 获取容量
   * Get capacity
   */
  capacity(): number {
    return this.buffer.capacity()
  }
}
