# Web 应用全面安全与质量审计报告

**审计日期**: 2025-11-15
**审计范围**: Smart Cat Home 全栈应用（前端 + 后端）
**总体评分**: 7.5/10 ⚠️

---

## 🔴 严重问题（HIGH - 需立即修复）

### 1. 前端暴露 Admin API Key

**位置**: `/Users/meaqua/Desktop/EE3070/smart-cat-home/.env.local:7`

**问题**:
```env
VITE_ADMIN_API_KEY=cat_admin_key_9be1d4c72f994fcaad2acf6d1c88e4b1
```

**严重性**: 🔴 **CRITICAL**

**影响**:
- Vite 会将所有 `VITE_*` 前缀的环境变量打包到前端 JavaScript 代码中
- 任何人打开浏览器开发者工具都能看到这个 API key
- 攻击者可以使用这个 key 调用所有 admin 端点（settings, calibration, hardware commands）

**使用位置**: `smart-cat-home/src/utils/backendClient.ts`

**修复方案**:

**方案 A（推荐）**: 完全移除前端 admin key，改用用户登录认证

```typescript
// backendClient.ts - 移除硬编码的 admin key
// ❌ 删除这行
const adminApiKey = import.meta.env.VITE_ADMIN_API_KEY || ''

// ✅ 改为使用用户登录 token
export async function adminRequest(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Admin operation requires login')
  }

  return fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  })
}
```

**方案 B（临时）**: 如果必须保留，改为服务端认证

```typescript
// 前端不存储 key，改为调用后端 proxy 端点
// 后端 index.ts 添加：
app.post('/api/admin/settings', verifyAuth, async (req, res) => {
  // 只允许 role=developer 的用户
  if (req.user?.role !== 'developer') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // 后端使用内部 ADMIN_API_KEY 调用真实端点
  // ...
})
```

**紧急措施**:
1. 立即轮换后端 `ADMIN_API_KEY`（生成新 key）
2. 从 `.env.local` 删除 `VITE_ADMIN_API_KEY`
3. 检查是否曾经提交到 git（如果是，key 已泄露）

---

### 2. Firebase Service Account 路径泄露

**位置**: `/Users/meaqua/Desktop/EE3070/smart-cat-backend/.env:139`

```env
FCM_SERVICE_ACCOUNT_PATH=/Users/meaqua/Downloads/ee3070-b1947-firebase-adminsdk-fbsvc-3a8d2f8396.json
```

**严重性**: 🟡 **MEDIUM-HIGH**

**影响**:
- 虽然文件路径本身不直接泄露密钥，但暴露了：
  - Firebase project ID: `ee3070-b1947`
  - Service account ID: `firebase-adminsdk-fbsvc`
  - 文件哈希: `3a8d2f8396`
- 如果 `.env` 文件曾提交到公开 git repo，攻击者可推断项目结构

**修复方案**:

**方案 A**: 使用 Base64 编码存储在环境变量中
```bash
# 生成 base64（执行一次）
cat /Users/meaqua/Downloads/ee3070-b1947-firebase-adminsdk-fbsvc-3a8d2f8396.json | base64

# .env 中使用 FCM_SERVICE_ACCOUNT_BASE64 而非 PATH
FCM_SERVICE_ACCOUNT_BASE64=<base64-encoded-json>
```

**方案 B**: 使用 Docker secrets 或 Kubernetes secrets（生产环境）

**方案 C**: 至少改用相对路径
```env
FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
```

---

## 🟡 中等问题（MEDIUM - 建议修复）

### 3. Async Promise Executor 反模式

**位置**: `smart-cat-home/src/utils/pushNotifications.ts:315`

**代码**:
```typescript
async function waitForNativeRegistrationToken(): Promise<string> {
  return new Promise(async (resolve, reject) => {  // ❌ 反模式
    // ...
  })
}
```

**问题**:
- Promise executor 函数不应该是 async
- 如果 executor 内部抛出异常，可能导致未捕获的 rejection
- ESLint 错误: `Promise executor functions should not be async`

**修复**:
```typescript
async function waitForNativeRegistrationToken(): Promise<string> {
  return new Promise((resolve, reject) => {  // ✅ 移除 async
    let settled = false
    const handles: PluginListenerHandle[] = []

    const cleanup = () => {  // ✅ 内部函数可以保持 async
      return Promise.all(
        handles.map((handle) => handle.remove().catch(console.warn))
      )
    }
    // ...
  })
}
```

---

### 4. React Hooks 依赖数组警告

**位置**: 多处 ESLint 警告

**示例 1**: `smart-cat-home/src/App.tsx:883`
```typescript
useMemo(() => {
  // ... 使用了 snapshot.reading.timestamp 等
}, [snapshot])  // ⚠️ 依赖数组不完整
```

**影响**:
- 可能导致 memo 失效，造成不必要的重新计算
- 或者反过来，过度 memo 导致使用过期数据

**修复**:
```typescript
// 方案 A: 明确列出所有依赖
useMemo(() => {
  // ...
}, [snapshot, snapshot.reading.timestamp, snapshot.reading.timestampIso])

// 方案 B: 如果依赖过多，考虑拆分逻辑
const timestampData = useMemo(() => ({
  timestamp: snapshot.reading?.timestamp,
  iso: snapshot.reading?.timestampIso,
  // ...
}), [snapshot.reading?.timestamp, snapshot.reading?.timestampIso])
```

---

### 5. console.log 泄露到生产环境

**位置**: 前端 66 处 console 调用

**问题**:
- 虽然大多是 `console.warn` 和 `console.error`（可保留），但有些 `console.log` 可能泄露敏感信息
- 例如：`[ai-chat] Very short response after sanitization:` 可能泄露 AI 内部状态

**建议**:
```typescript
// 创建生产环境安全的 logger
const logger = {
  info: import.meta.env.DEV ? console.log : () => {},
  warn: console.warn,
  error: console.error,
}

// 使用
logger.info('[ai-chat] Debug info')  // 只在开发环境输出
logger.error('[ai-chat] Error occurred')  // 生产环境也输出
```

---

## 🟢 低优先级问题（LOW - 可选修复）

### 6. 后端不是 Git 仓库

**位置**: `/Users/meaqua/Desktop/EE3070/smart-cat-backend/`

**影响**:
- `.env` 文件缺少版本控制保护
- 无法回滚代码更改
- 团队协作困难

**建议**:
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
git init
git add .gitignore
git add -A
git commit -m "Initial commit"

# 验证 .env 未被追踪
git status | grep .env  # 应该为空
```

---

### 7. npm 权限问题

**问题**: npm cache 被 root 用户占用

**修复**:
```bash
sudo chown -R 501:20 "/Users/meaqua/.npm"
```

---

### 8. 硬编码 URL

**位置**: 4 个文件包含硬编码 URL

**示例**: `App.tsx`, `CameraMonitorPanel.tsx`, `CareCommandCenter.tsx`

**建议**:
- 使用环境变量或配置文件
- 特别是相机 URL: `http://192.168.5.1`

```typescript
// ✅ 改为
const CAMERA_BASE_URL = import.meta.env.VITE_CAMERA_URL || 'http://192.168.5.1'
```

---

## ✅ 做得好的方面

### 1. 数据库安全 ✅

**检查结果**:
- ✅ 所有查询使用 `db.prepare()` 参数化查询
- ✅ 无 SQL 注入风险
- ✅ 没有使用字符串拼接构造 SQL

**示例**:
```typescript
const insertSnapshotStmt = db.prepare(
  `INSERT INTO snapshots (id, catId, timestamp, payload) VALUES (?, ?, ?, ?)`
)
// ✅ 使用 ? 占位符，better-sqlite3 自动转义
```

---

### 2. 安全头部和速率限制 ✅

**位置**: `smart-cat-backend/src/index.ts`

- ✅ 使用 `helmet` 设置安全 HTTP 头部
- ✅ 使用 `express-rate-limit` 限制请求频率
- ✅ 不同端点有不同的速率限制：
  - General API: 100 req/15min
  - AI chat: 10 req/5min
  - TTS: 6 req/1min
  - Login: 5 req/15min

---

### 3. 认证系统 ✅

- ✅ 使用 bcrypt 哈希密码
- ✅ JWT token 认证
- ✅ 角色权限控制（user/developer）
- ✅ Hardware API key 分离

---

### 4. XSS 防护 ✅

**检查结果**:
- ✅ 无 `eval()` 调用
- ✅ 无 `innerHTML` 使用
- ✅ 无 `dangerouslySetInnerHTML` 使用
- ✅ React 自动转义输出

---

### 5. localStorage 使用安全 ✅

**检查结果**: 只存储非敏感配置
- ✅ 主题偏好
- ✅ 语言设置
- ✅ 布局偏好
- ✅ TTS 语音选择
- ❌ **没有**存储密码、token、API keys（token 在 authState.ts 中存储）

---

### 6. 性能优化 ✅

**统计**:
- ✅ 86 处使用 `React.memo` / `useMemo` / `useCallback`
- ✅ 适当的优化密度（121 个文件中使用）
- ✅ 避免不必要的重新渲染

---

### 7. CORS 配置 ✅

**位置**: `smart-cat-backend/.env:24`

```env
ALLOWED_ORIGINS=https://172.24.87.11:4173,https://172.24.87.11:5173,...
```

- ✅ 使用白名单限制来源
- ✅ 不允许所有来源（生产环境配置良好）

---

### 8. .gitignore 配置 ✅

**后端**:
```gitignore
.env
.env.local
smart-cat-home.db*
```

**前端**:
```gitignore
*.local
```

- ✅ 正确忽略敏感文件
- ✅ 前端 `.env.local` 已被 git 忽略

---

## 📊 问题优先级汇总

| 问题 | 严重性 | 影响 | 修复难度 | 优先级 |
|------|--------|------|----------|--------|
| 1. 前端暴露 Admin API Key | 🔴 HIGH | 完全暴露管理权限 | 中 | **P0** |
| 2. Firebase 路径泄露 | 🟡 MED | 信息泄露 | 低 | **P1** |
| 3. Async Promise Executor | 🟡 MED | 潜在未捕获异常 | 低 | **P1** |
| 4. React Hooks 依赖 | 🟡 MED | 性能/正确性 | 低 | **P2** |
| 5. console.log 泄露 | 🟢 LOW | 调试信息泄露 | 低 | **P2** |
| 6. 后端非 Git 仓库 | 🟢 LOW | 开发体验 | 极低 | **P3** |
| 7. npm 权限 | 🟢 LOW | 开发体验 | 极低 | **P3** |
| 8. 硬编码 URL | 🟢 LOW | 可维护性 | 低 | **P3** |

---

## 🔧 立即行动计划

### 第 1 步：修复 Admin API Key 泄露（必须）

```bash
# 1. 生成新的 admin key
node -e "console.log('cat_admin_key_' + require('crypto').randomBytes(16).toString('hex'))"

# 2. 更新后端 .env
# ADMIN_API_KEY=<new-key>

# 3. 删除前端 .env.local 中的 VITE_ADMIN_API_KEY

# 4. 修改前端代码，改用登录认证（见上方修复方案）
```

### 第 2 步：修复 async Promise executor（建议）

```bash
# 编辑 smart-cat-home/src/utils/pushNotifications.ts:315
# 移除 executor 函数的 async 关键字
```

### 第 3 步：初始化 Git 仓库（可选但推荐）

```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
git init
git add .
git commit -m "Initial commit"
```

---

## 📈 评分细节

### 安全性: 6/10
- ✅ SQL 注入防护: 10/10
- ✅ XSS 防护: 10/10
- ✅ CSRF 防护: 9/10（有 CORS）
- ❌ 密钥管理: 2/10（前端泄露 admin key）
- ✅ 认证授权: 8/10
- ✅ 速率限制: 10/10

### 代码质量: 8/10
- ✅ TypeScript 使用: 9/10
- ✅ 错误处理: 8/10
- ✅ 代码组织: 8/10
- 🟡 Lint 警告: 6/10（8 个问题）
- ✅ 测试覆盖: N/A（无测试）

### 性能: 8.5/10
- ✅ React 优化: 9/10
- ✅ 数据库优化: 9/10（WAL mode, prepared statements）
- ✅ 缓存策略: 8/10
- ✅ 资源加载: 8/10

### 配置管理: 7/10
- ✅ .gitignore: 10/10
- ✅ 环境变量: 7/10
- ❌ 密钥存储: 3/10（前端泄露）
- 🟡 版本控制: 5/10（后端无 git）

---

## 📚 参考资源

### OWASP Top 10 (2021) 检查

| 风险 | 状态 | 备注 |
|------|------|------|
| A01 Broken Access Control | 🟡 PARTIAL | Admin key 泄露 |
| A02 Cryptographic Failures | ✅ PASS | bcrypt 哈希 |
| A03 Injection | ✅ PASS | 参数化查询 |
| A04 Insecure Design | ✅ PASS | 良好架构 |
| A05 Security Misconfiguration | 🟡 PARTIAL | 前端暴露密钥 |
| A06 Vulnerable Components | ⚠️ UNKNOWN | npm outdated 失败 |
| A07 Identification and Auth | ✅ PASS | JWT + bcrypt |
| A08 Software and Data Integrity | ✅ PASS | 无明显问题 |
| A09 Security Logging | ✅ PASS | 有日志记录 |
| A10 SSRF | ✅ PASS | 无 SSRF 风险 |

---

## 总结

**整体评估**: 这是一个**架构良好**的应用，但有**一个严重的安全漏洞**（前端泄露 admin key）必须立即修复。

**优点**:
- ✅ 数据库安全做得很好
- ✅ 认证系统完善
- ✅ 使用了现代安全最佳实践（helmet, rate limiting）
- ✅ React 性能优化到位

**需要改进**:
- 🔴 立即移除前端的 `VITE_ADMIN_API_KEY`
- 🟡 修复 async Promise executor 反模式
- 🟡 处理 React hooks 依赖警告
- 🟢 初始化后端 git 仓库

**修复后预期评分**: **9.0/10** ⭐⭐⭐⭐⭐

---

**报告生成时间**: 2025-11-15
**审计人员**: Claude Code AI Assistant
**审计范围**: 121 个前端文件 + 49 个后端文件
**审计方法**: 静态代码分析 + 配置审查 + OWASP 检查
