/**
 * Smart Cat Home 后端 API 文档
 * Smart Cat Home Backend API Documentation
 *
 * 基础URL: http://localhost:3000/api
 * Base URL: http://localhost:3000/api
 */

/**
 * ============================================
 * AI 聊天端点 / AI Chat Endpoints
 * ============================================
 */

/**
 * POST /api/ai/chat
 *
 * 与AI助手进行聊天对话
 * Chat with AI assistant
 *
 * 请求体 / Request Body:
 * {
 *   "message": "string (必需, 1-5000字符) / Required, 1-5000 characters",
 *   "temperature": "number (可选, 0-2, 默认0.7) / Optional, 0-2, default 0.7",
 *   "attachments": "string[] (可选, 图像base64) / Optional, image base64",
 *   "sessionId": "string (可选) / Optional"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "reply": "AI的回复 / AI reply",
 *     "tools": [
 *       {
 *         "tool": "updateSettings",
 *         "success": true,
 *         "message": "设置已更新 / Settings updated"
 *       }
 *     ]
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 *
 * 错误响应 / Error Response (400/500):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "MESSAGE_TOO_LONG",
 *     "message": "消息不能超过5000个字符 / Message cannot exceed 5000 characters"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 *
 * @throws {400} - 验证失败 / Validation failed
 * @throws {500} - 服务器错误 / Server error
 */

/**
 * ============================================
 * 智能家居控制端点 / Smart Home Control Endpoints
 * ============================================
 */

/**
 * GET /api/hardware/latest
 *
 * 获取最新的传感器读数
 * Get latest sensor readings
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "reading": {
 *       "temperatureC": 24.5,
 *       "humidityPercent": 55,
 *       "waterIntakeMl": 200,
 *       "airQualityIndex": 45,
 *       "catWeightKg": 4.2,
 *       "lastFeedingMinutesAgo": 120,
 *       "timestamp": "2025-01-01T12:00:00Z"
 *     },
 *     "settings": { ... },
 *     "status": { ... }
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * POST /api/hardware/settings
 *
 * 更新智能家居设置
 * Update smart home settings
 *
 * 请求体 / Request Body:
 * {
 *   "autoMode": "boolean (可选) / Optional",
 *   "targetTemperatureC": "number (可选, 15-35) / Optional, 15-35",
 *   "targetHumidityPercent": "number (可选, 30-80) / Optional, 30-80",
 *   "waterBowlLevelTargetMl": "number (可选, 100-1000) / Optional, 100-1000",
 *   "feederSchedule": "string (可选) / Optional",
 *   "purifierIntensity": "string (可选, low/medium/high) / Optional, low/medium/high"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "message": "设置已保存 / Settings saved"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * POST /api/hardware/calibration
 *
 * 更新传感器校准配置
 * Update sensor calibration
 *
 * 请求体 / Request Body:
 * {
 *   "fsrZero": "number (可选) / Optional",
 *   "fsrScale": "number (可选) / Optional",
 *   "waterLevelFullCm": "number (可选) / Optional",
 *   "waterLevelEmptyCm": "number (可选) / Optional",
 *   "ldrDark": "number (可选) / Optional",
 *   "ldrBright": "number (可选) / Optional",
 *   "catPresenceThresholdKg": "number (可选) / Optional"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "message": "校准已更新 / Calibration updated"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 关怀任务端点 / Care Task Endpoints
 * ============================================
 */

/**
 * GET /api/care/tasks
 *
 * 获取所有关怀任务
 * Get all care tasks
 *
 * 查询参数 / Query Parameters:
 * - status: pending|completed|dismissed (可选)
 * - category: environment|hydration|nutrition|behavior|wellness|safety|maintenance|general (可选)
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "tasks": [
 *       {
 *         "id": 1,
 *         "title": "添加水 / Add water",
 *         "description": "水碗需要补充 / Water bowl needs refilling",
 *         "category": "hydration",
 *         "status": "pending",
 *         "createdAt": "2025-01-01T12:00:00Z",
 *         "dueAt": "2025-01-01T14:00:00Z",
 *         "source": "ai"
 *       }
 *     ]
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * POST /api/care/tasks
 *
 * 创建新的关怀任务
 * Create a new care task
 *
 * 请求体 / Request Body:
 * {
 *   "title": "string (必需) / Required",
 *   "description": "string (必需) / Required",
 *   "category": "string (可选, 默认general) / Optional, default general",
 *   "dueAt": "string (可选, ISO 8601) / Optional, ISO 8601"
 * }
 *
 * 响应 / Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "id": 2,
 *     "title": "梳毛 / Grooming",
 *     "description": "定期梳理猫咪的毛发 / Regular grooming",
 *     "category": "wellness",
 *     "status": "pending",
 *     "createdAt": "2025-01-01T12:00:00Z",
 *     "source": "user"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * PATCH /api/care/tasks/:id
 *
 * 更新任务状态
 * Update task status
 *
 * 请求体 / Request Body:
 * {
 *   "status": "pending|completed|dismissed"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "id": 1,
 *     "status": "completed",
 *     "completedAt": "2025-01-01T13:30:00Z"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 分析和报告端点 / Analytics & Reports Endpoints
 * ============================================
 */

/**
 * GET /api/analytics/insights
 *
 * 获取关怀洞察（AI分析）
 * Get care insights (AI analysis)
 *
 * 查询参数 / Query Parameters:
 * - hours: number (可选, 默认24) / Optional, default 24
 * - limit: number (可选, 默认10, 最多100) / Optional, default 10, max 100
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "insights": [
 *       {
 *         "id": "insight-1",
 *         "title": "猫咪活动异常 / Unusual activity",
 *         "summary": "检测到猫咪活动减少 / Detected reduced activity",
 *         "severity": "warning",
 *         "category": "behavior",
 *         "recommendations": [
 *           "增加互动时间 / Increase interaction time"
 *         ],
 *         "evidence": [
 *           {
 *             "metric": "movement_count",
 *             "current": 45,
 *             "baseline": 120,
 *             "unit": "times/hour"
 *           }
 *         ],
 *         "createdAt": "2025-01-01T12:00:00Z"
 *       }
 *     ]
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * GET /api/analytics/forecast
 *
 * 获取猫咪行为预测
 * Get behavior forecast
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "generatedAt": "2025-01-01T12:00:00Z",
 *     "confidence": "high",
 *     "summary": "猫咪今天活动水平正常 / Normal activity level today",
 *     "segments": [
 *       {
 *         "id": "seg-1",
 *         "period": "morning",
 *         "label": "早晨 / Morning",
 *         "focus": "进食和清洁 / Eating and grooming",
 *         "confidence": "high",
 *         "tips": [ "确保有新鲜的水 / Ensure fresh water" ]
 *       }
 *     ],
 *     "anomalies": [],
 *     "recommendations": []
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * GET /api/reports/professional
 *
 * 生成专业的关怀报告
 * Generate professional care report
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "generatedAt": "2025-01-01T12:00:00Z",
 *     "headline": "猫咪健康状态良好 / Cat health status is good",
 *     "summary": "综合分析表明... / Comprehensive analysis shows...",
 *     "riskLevel": "low",
 *     "vitals": [
 *       {
 *         "id": "vital-temp",
 *         "label": "温度 / Temperature",
 *         "value": "24.5°C",
 *         "status": "optimal",
 *         "trend": "stable"
 *       }
 *     ],
 *     "actionItems": []
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 内存和历史端点 / Memory & History Endpoints
 * ============================================
 */

/**
 * GET /api/memories
 *
 * 获取所有记忆和笔记
 * Get all memories and notes
 *
 * 查询参数 / Query Parameters:
 * - type: note|conversation|setting (可选)
 * - limit: number (可选, 默认50, 最多500)
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "memories": [
 *       {
 *         "id": 1,
 *         "type": "note",
 *         "content": "猫咪喜欢在午后睡觉 / Cat likes to sleep in afternoon",
 *         "source": "ai",
 *         "createdAt": "2025-01-01T12:00:00Z"
 *       }
 *     ]
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * POST /api/memories
 *
 * 添加新的记忆
 * Add new memory
 *
 * 请求体 / Request Body:
 * {
 *   "type": "note|conversation|setting (必需) / Required",
 *   "content": "string (必需) / Required",
 *   "source": "string (可选, 默认user) / Optional, default user"
 * }
 *
 * 响应 / Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "id": 5,
 *     "type": "note",
 *     "content": "新的记忆 / New memory",
 *     "source": "user",
 *     "createdAt": "2025-01-01T12:00:00Z"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 语音合成端点 / Text-to-Speech Endpoints
 * ============================================
 */

/**
 * POST /api/ai/tts
 *
 * 将文本转换为语音
 * Convert text to speech
 *
 * 请求体 / Request Body:
 * {
 *   "text": "string (必需, 1-1000字符) / Required, 1-1000 characters",
 *   "voiceId": "string (可选) / Optional",
 *   "playbackRate": "number (可选, 0.5-2.0, 默认1.0) / Optional, 0.5-2.0, default 1.0"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "audioBase64": "UklGRi4A... (base64编码的音频)",
 *     "format": "audio/wav",
 *     "sampleRate": 24000,
 *     "durationSeconds": 2.5,
 *     "voiceId": "en_female_1"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 *
 * 错误响应 / Error Response (429 Too Many Requests):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "RATE_LIMITED",
 *     "message": "请求过于频繁 / Too many requests"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 通知和推送端点 / Notifications & Push Endpoints
 * ============================================
 */

/**
 * POST /api/notifications/subscribe
 *
 * 订阅推送通知
 * Subscribe to push notifications
 *
 * 请求体 / Request Body:
 * {
 *   "subscription": {
 *     "endpoint": "string (必需) / Required",
 *     "keys": {
 *       "p256dh": "string (必需) / Required",
 *       "auth": "string (必需) / Required"
 *     }
 *   },
 *   "language": "zh|en (可选) / Optional"
 * }
 *
 * 响应 / Response (200 OK):
 * {
 *   "success": true,
 *   "data": {
 *     "message": "已订阅 / Subscribed"
 *   },
 *   "timestamp": "2025-01-01T12:00:00Z"
 * }
 */

/**
 * ============================================
 * 错误代码 / Error Codes
 * ============================================
 *
 * INVALID_MESSAGE - 消息格式无效 / Invalid message format
 * MESSAGE_TOO_LONG - 消息超过最大长度 / Message exceeds max length
 * EMPTY_MESSAGE - 消息为空 / Message is empty
 * INVALID_TEMPERATURE - 温度参数无效 / Invalid temperature
 * TEMPERATURE_OUT_OF_RANGE - 温度超出范围 / Temperature out of range
 * INVALID_TYPE - 请求类型无效 / Invalid request type
 * EXECUTION_ERROR - 执行出错 / Execution error
 * RATE_LIMITED - 请求过于频繁 / Rate limited
 * NOT_FOUND - 资源不存在 / Resource not found
 * VALIDATION_ERROR - 验证失败 / Validation failed
 *
 * ============================================
 * 通用响应格式 / Standard Response Format
 * ============================================
 *
 * 所有响应都遵循以下格式:
 * All responses follow this format:
 *
 * 成功响应 / Success Response (2xx):
 * {
 *   "success": true,
 *   "data": { ... },
 *   "timestamp": "ISO 8601 timestamp"
 * }
 *
 * 错误响应 / Error Response (4xx/5xx):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "用户友好的错误信息 / User-friendly error message",
 *     "details": { ... } (可选)
 *   },
 *   "timestamp": "ISO 8601 timestamp"
 * }
 *
 * ============================================
 * 认证 / Authentication
 * ============================================
 *
 * 硬件接口需要提供 API Key:
 * Hardware interface requires API Key:
 *
 * Header: X-Hardware-API-Key: <your_key>
 * Header: X-Admin-API-Key: <your_key>
 *
 * 或 / Or
 *
 * Header: Authorization: Bearer <token>
 *
 * ============================================
 * 速率限制 / Rate Limiting
 * ============================================
 *
 * /api/ai/tts: 10 requests per minute per IP
 * /api/ai/chat: 30 requests per minute per session
 * 其他端点: 无限制 / Other endpoints: Unlimited
 *
 * 超过限制时返回 429 Too Many Requests
 * Returns 429 Too Many Requests when limit exceeded
 */
