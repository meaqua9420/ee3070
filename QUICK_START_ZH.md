# 🚀 智能猫咪系统 - 快速启动指南

> 完整的服务器启动说明，从零到运行只需 5 分钟！

---

## 📋 前置要求

### 必须安装的软件

1. **Node.js** (版本 18 或以上)
   ```bash
   node --version  # 应该显示 v18.x.x 或更高
   ```

2. **Python** (版本 3.8 或以上)
   ```bash
   python3 --version  # 应该显示 Python 3.8.x 或更高
   ```

3. **Python 虚拟环境** (推荐)
   ```bash
   cd /Users/meaqua/Desktop/EE3070
   python3 -m venv venv
   source venv/bin/activate
   ```

4. **AI 推理引擎** (二选一)
   - **Nexa** (推荐，跨平台)
     ```bash
     pip install nexaai
     ```
   - **MLX** (仅 Apple Silicon Mac)
     ```bash
     pip install mlx-lm
     ```

---

## 🖥️ 需要启动的服务器

智能猫咪系统需要**同时运行 3 个服务器**才能完整工作：

| 服务器 | 作用 | 端口 | 必需性 |
|--------|------|------|--------|
| **AI 服务器** | 本地 LLM 推理 | 8000 | ✅ 必需 |
| **后端服务器** | 业务逻辑和 API | 4000 | ✅ 必需 |
| **前端服务器** | 用户界面 | 5173 | ✅ 必需 |

---

## 🎯 完整启动流程（3 个终端）

### 准备工作：配置环境变量

**后端配置** (`smart-cat-backend/.env`):
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend

# 如果还没有 .env 文件，复制示例文件
cp .env.example .env

# 编辑 .env 文件，确保以下配置正确：
# PORT=4000
# LOCAL_LLM_API_BASE=http://localhost:8000
# LOCAL_LLM_MODEL_NAME=qwen3-4b-thinking:q4_0
# ADMIN_API_KEY=your-secure-admin-key
# HARDWARE_API_KEY=your-hardware-key
```

**前端配置** (`smart-cat-home/.env.local`):
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-home

# 如果还没有 .env.local 文件，复制示例文件
cp .env.local.example .env.local

# 编辑 .env.local 文件，确保以下配置正确：
# VITE_API_BASE_URL=http://localhost:4000
# 前端登入 developer 帳號即可執行管理操作，無需再設定 VITE_ADMIN_API_KEY
```

---

### 终端 1️⃣: 启动 AI 服务器

```bash
# 1. 进入项目目录
cd /Users/meaqua/Desktop/EE3070

# 2. 激活 Python 虚拟环境（如果有）
source venv/bin/activate

# 3. 启动 Nexa 服务器（推荐）
nexa server qwen3-4b-thinking:q4_0

# 或者使用 MLX（仅 Apple Silicon）
# mlx_lm.server --model mlx-community/Qwen2.5-7B-Instruct-4bit --port 8000
```

**成功标志**:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**验证**:
```bash
# 在另一个终端测试
curl http://localhost:8000/v1/models
# 应该返回模型列表
```

**常见问题**:
- ❌ `nexa: command not found` → 运行 `pip install nexaai`
- ❌ 模型下载失败 → 检查网络连接，Nexa 首次运行会下载模型

---

### 终端 2️⃣: 启动后端服务器

```bash
# 1. 进入后端目录
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend

# 2. 安装依赖（首次运行）
npm install

# 3. 启动开发服务器
npm run dev

# 或者使用生产模式
# npm run build && npm start
```

**成功标志**:
```
[server] 🚀 Server listening on port 4000
[server] 📊 Database initialized
[server] 🧠 AI config loaded
```

**验证**:
```bash
# 在另一个终端测试
curl http://localhost:4000/api/health
# 应该返回 {"ok": true}
```

**常见问题**:
- ❌ `ECONNREFUSED localhost:8000` → AI 服务器未启动
- ❌ `Port 4000 already in use` → 关闭其他占用 4000 端口的程序
- ❌ 数据库错误 → 删除 `smart-cat-home.db` 重新初始化

---

### 终端 3️⃣: 启动前端服务器

```bash
# 1. 进入前端目录
cd /Users/meaqua/Desktop/EE3070/smart-cat-home

# 2. 安装依赖（首次运行）
npm install

# 3. 启动开发服务器
npm run dev
```

**成功标志**:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**验证**:
- 打开浏览器访问 `http://localhost:5173`
- 应该看到智能猫咪控制面板

**常见问题**:
- ❌ 前端显示网络错误 → 检查后端是否启动（http://localhost:4000）
- ❌ `Port 5173 already in use` → 使用 `npm run dev -- --port 5174` 换端口

---

## 🔍 验证所有服务器正常运行

### 1. 检查 AI 服务器
```bash
curl http://localhost:8000/v1/models
```
✅ 应该返回模型列表 JSON

### 2. 检查后端服务器
```bash
curl http://localhost:4000/api/health
```
✅ 应该返回 `{"ok": true}`

### 3. 检查前端服务器
打开浏览器访问 `http://localhost:5173`
✅ 应该看到控制面板界面

### 4. 完整功能测试
1. 在前端打开 AI 聊天面板
2. 输入一个问题，如 "Hello, how are you?"
3. ✅ 如果能收到 AI 回复，说明所有服务器连接正常！

---

## 📊 服务器依赖关系图

```
┌─────────────────────┐
│    浏览器            │
│  (http://localhost:5173)
└──────────┬──────────┘
           │ HTTP 请求
           ↓
┌─────────────────────┐
│  前端服务器          │ (终端 3)
│  React + Vite       │
│  端口: 5173         │
└──────────┬──────────┘
           │ API 调用 (/api/*)
           ↓
┌─────────────────────┐
│  后端服务器          │ (终端 2)
│  Express + Node.js  │
│  端口: 4000         │
└──────────┬──────────┘
           │ AI 推理请求 (/v1/*)
           ↓
┌─────────────────────┐
│  AI 服务器           │ (终端 1)
│  Nexa / MLX         │
│  端口: 8000         │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  本地 LLM 模型       │
│  Qwen3-4B 等        │
└─────────────────────┘
```

---

## 🛠️ 一键启动脚本（高级）

创建脚本 `start-all.sh`:

```bash
#!/bin/bash

echo "🚀 启动智能猫咪系统..."
echo "===================================="

# 检查端口是否已占用
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ 端口 $1 已被占用！"
        lsof -Pi :$1 -sTCP:LISTEN
        return 1
    fi
    return 0
}

# 检查所有端口
check_port 8000 || exit 1
check_port 4000 || exit 1
check_port 5173 || exit 1

# 启动 AI 服务器
echo ""
echo "1️⃣  启动 AI 服务器 (端口 8000)..."
cd /Users/meaqua/Desktop/EE3070
source venv/bin/activate
osascript -e 'tell app "Terminal" to do script "cd /Users/meaqua/Desktop/EE3070 && source venv/bin/activate && nexa server qwen3-4b-thinking:q4_0"'

# 等待 AI 服务器启动
echo "⏳ 等待 AI 服务器启动..."
sleep 15

# 启动后端服务器
echo ""
echo "2️⃣  启动后端服务器 (端口 4000)..."
osascript -e 'tell app "Terminal" to do script "cd /Users/meaqua/Desktop/EE3070/smart-cat-backend && npm run dev"'

# 等待后端启动
echo "⏳ 等待后端服务器启动..."
sleep 8

# 启动前端服务器
echo ""
echo "3️⃣  启动前端服务器 (端口 5173)..."
osascript -e 'tell app "Terminal" to do script "cd /Users/meaqua/Desktop/EE3070/smart-cat-home && npm run dev"'

echo ""
echo "✅ 所有服务器已在独立终端中启动！"
echo ""
echo "📝 访问地址："
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:4000"
echo "   AI:   http://localhost:8000"
echo ""
echo "💡 关闭所有服务器：在各个终端按 Ctrl+C"
```

使用方法：
```bash
chmod +x start-all.sh
./start-all.sh
```

---

## 🧪 测试新功能

### 1. 测试校准历史记录

```bash
# 查看当前校准历史
curl http://localhost:4000/api/calibration/history | jq '.'

# 更新校准（会自动记录历史）
curl -X POST http://localhost:4000/api/calibration \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{
    "fsrZero": 200,
    "fsrScale": 6000
  }' | jq '.'

# 再次查看历史（应该有新记录）
curl http://localhost:4000/api/calibration/history | jq '.data.items[0]'
```

### 2. 测试记忆相关性评分

启用调试模式查看筛选日志：
```bash
cd /Users/meaqua/Desktop/EE3070/smart-cat-backend
SMART_CAT_AI_DEBUG=true npm run dev
```

然后在前端 AI 聊天面板发送问题，后端会输出：
```
[ai-debug] Filtered 43 memories to 8 relevant ones
```

### 3. 运行自动化测试脚本

```bash
cd /Users/meaqua/Desktop/EE3070

# 编辑 test-backend.sh，替换 ADMIN_KEY
nano test-backend.sh

# 运行测试
bash test-backend.sh
```

---

## 🔧 常见问题排查

### Q1: AI 服务器启动失败
**症状**: `nexa: command not found`

**解决方案**:
```bash
# 确保虚拟环境已激活
source /Users/meaqua/Desktop/EE3070/venv/bin/activate

# 安装 Nexa
pip install nexaai

# 验证安装
nexa --version
```

---

### Q2: 后端无法连接 AI 服务器
**症状**: 后端日志显示 `ECONNREFUSED localhost:8000`

**解决方案**:
1. 确认 AI 服务器正在运行
   ```bash
   curl http://localhost:8000/v1/models
   ```

2. 检查后端 `.env` 配置
   ```bash
   LOCAL_LLM_API_BASE=http://localhost:8000
   ```

3. 重启后端服务器

---

### Q3: 前端显示网络错误
**症状**: 前端界面显示 "Failed to fetch" 或类似错误

**解决方案**:
1. 确认后端正在运行
   ```bash
   curl http://localhost:4000/api/health
   ```

2. 检查前端 `.env.local` 配置
   ```bash
   VITE_API_BASE_URL=http://localhost:4000
   ```

3. 检查浏览器控制台（F12）的 CORS 错误

4. 确认后端 `.env` 的 CORS 设置
   ```bash
   ALLOWED_ORIGINS=http://localhost:5173
   ```

---

### Q4: 模型下载很慢或失败
**症状**: Nexa 首次运行时卡在下载模型

**解决方案**:
1. 检查网络连接
2. 使用代理（如果在中国大陆）
   ```bash
   export HTTP_PROXY=http://your-proxy:port
   export HTTPS_PROXY=http://your-proxy:port
   nexa server qwen3-4b-thinking:q4_0
   ```

3. 或者使用更小的模型
   ```bash
   nexa server qwen3-2b:q4_0
   ```

---

## 📚 相关文档

- [完整实现总结](IMPLEMENTATION_SUMMARY.md) - 新功能详细说明
- [后端 API 文档](smart-cat-backend/README.md)
- [前端开发指南](smart-cat-home/README.md)
- [测试脚本](test-backend.sh)

---

## ✅ 检查清单

启动前确认：
- [ ] Node.js 已安装（v18+）
- [ ] Python 已安装（v3.8+）
- [ ] Nexa 或 MLX 已安装
- [ ] 后端 `.env` 文件已配置
- [ ] 前端 `.env.local` 文件已配置
- [ ] 端口 8000, 4000, 5173 未被占用

启动后验证：
- [ ] `curl http://localhost:8000/v1/models` 返回模型列表
- [ ] `curl http://localhost:4000/api/health` 返回 `{"ok": true}`
- [ ] 浏览器访问 `http://localhost:5173` 显示控制面板
- [ ] AI 聊天功能正常工作

---

## 🎉 成功！

如果所有检查都通过，恭喜你！智能猫咪系统已经完全运行起来了！

下一步可以：
1. 📱 安装为 PWA 应用
2. 🔔 配置推送通知
3. 🤖 测试 AI 聊天功能
4. 📊 查看数据可视化
5. ⚙️ 尝试传感器校准

**需要帮助？**
查看 [主 README](README.md) 或 [实现总结文档](IMPLEMENTATION_SUMMARY.md)

---

**最后更新**: 2025-11-03
**版本**: 1.0.0
