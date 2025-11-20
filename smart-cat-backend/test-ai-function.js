#!/usr/bin/env node
/**
 * AI功能综合测试脚本 / AI Function Comprehensive Test Script
 *
 * 使用方法 / Usage:
 * node test-ai-function.js
 *
 * 或指定服务器 URL / Or specify server URL:
 * BACKEND_URL=http://localhost:4000 node test-ai-function.js
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000'
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function testChatEndpoint(testName, payload, expectedBehavior) {
  log(`\n📝 测试: ${testName}`, 'cyan')
  log(`   Expected: ${expectedBehavior}`, 'blue')

  try {
    const startTime = Date.now()
    const response = await fetch(`${BACKEND_URL}/api/chat/suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const duration = Date.now() - startTime
    const data = await response.json()

    if (!response.ok) {
      log(`   ❌ FAILED: HTTP ${response.status}`, 'red')
      log(`   Error: ${JSON.stringify(data, null, 2)}`, 'red')
      return false
    }

    log(`   ✅ SUCCESS (${duration}ms)`, 'green')
    log(`   Provider: ${data.provider || 'unknown'}`, 'blue')
    log(`   Response length: ${data.text?.length || 0} chars`, 'blue')

    if (data.toolCall) {
      log(`   🔧 Tool called: ${data.toolCall.tool}`, 'yellow')
      log(`   Args: ${JSON.stringify(data.toolCall.args)}`, 'yellow')
    }

    // 显示响应预览
    if (data.text) {
      const preview = data.text.length > 100
        ? `${data.text.substring(0, 100)}...`
        : data.text
      log(`   Response: "${preview}"`, 'blue')
    }

    return true
  } catch (error) {
    log(`   ❌ NETWORK ERROR: ${error.message}`, 'red')
    return false
  }
}

async function runTests() {
  log('\n🚀 开始 AI 功能测试 / Starting AI Function Tests', 'cyan')
  log(`Backend URL: ${BACKEND_URL}`, 'blue')

  const tests = [
    // 测试 1: 基本聊天功能
    {
      name: '基本问候 / Basic Greeting',
      payload: {
        messages: [
          { role: 'user', content: 'hello' }
        ]
      },
      expected: '应返回友好的问候回复'
    },

    // 测试 2: 中文问候
    {
      name: '中文问候 / Chinese Greeting',
      payload: {
        messages: [
          { role: 'user', content: '你好' }
        ]
      },
      expected: '应返回中文友好回复'
    },

    // 测试 3: 能力查询
    {
      name: '查询 AI 能力 / Capability Query',
      payload: {
        messages: [
          { role: 'user', content: 'what can you do?' }
        ]
      },
      expected: '应列出 AI 的主要功能'
    },

    // 测试 4: 环境数据查询 (英文)
    {
      name: '查询温度 (英文) / Temperature Query (EN)',
      payload: {
        messages: [
          { role: 'user', content: 'what is the current temperature?' }
        ]
      },
      expected: '应返回当前温度数据和建议'
    },

    // 测试 5: 环境数据查询 (中文)
    {
      name: '查询湿度 (中文) / Humidity Query (ZH)',
      payload: {
        messages: [
          { role: 'user', content: '现在的湿度是多少？' }
        ]
      },
      expected: '应返回当前湿度数据'
    },

    // 测试 6: 设置意图检测 (直接命令)
    {
      name: '温度设置命令 / Temperature Setting Command',
      payload: {
        messages: [
          { role: 'user', content: '把温度设成 24 度' }
        ]
      },
      expected: '应调用 updateSettings 工具，设置目标温度为 24°C'
    },

    // 测试 7: 设置意图检测 (英文)
    {
      name: '湿度设置命令 (英文) / Humidity Setting (EN)',
      payload: {
        messages: [
          { role: 'user', content: 'set humidity to 60%' }
        ]
      },
      expected: '应调用 updateSettings 工具，设置目标湿度为 60%'
    },

    // 测试 8: 多轮对话
    {
      name: '多轮对话 / Multi-turn Conversation',
      payload: {
        messages: [
          { role: 'user', content: '现在温度怎么样？' },
          { role: 'assistant', content: '目前温度是 22°C，湿度 55%，环境舒适。' },
          { role: 'user', content: '那帮我调高一点' }
        ]
      },
      expected: '应理解上下文，调用 updateSettings 提高温度'
    },

    // 测试 9: 饮水关注查询
    {
      name: '饮水量查询 / Water Intake Query',
      payload: {
        messages: [
          { role: 'user', content: '我的猫今天喝水够吗？' }
        ]
      },
      expected: '应返回饮水数据和建议'
    },

    // 测试 10: 空消息 (错误处理)
    {
      name: '空消息测试 / Empty Message Test',
      payload: {
        messages: []
      },
      expected: '应返回默认回复或提示需要输入'
    },

    // 测试 11: 无效消息格式
    {
      name: '无效格式 / Invalid Format',
      payload: {
        messages: [
          { role: 'user' }  // 缺少 content
        ]
      },
      expected: '应处理错误或返回默认回复'
    },

    // 测试 12: 校准意图检测
    {
      name: '校准命令 / Calibration Command',
      payload: {
        messages: [
          { role: 'user', content: 'set cat presence threshold to 1.5 kg' }
        ]
      },
      expected: '应调用 updateCalibration 工具'
    },
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    const success = await testChatEndpoint(test.name, test.payload, test.expected)
    if (success) {
      passed++
    } else {
      failed++
    }

    // 延迟避免速率限制
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  log('\n' + '='.repeat(60), 'cyan')
  log(`\n📊 测试总结 / Test Summary`, 'cyan')
  log(`   Total: ${tests.length}`, 'blue')
  log(`   ✅ Passed: ${passed}`, 'green')
  log(`   ❌ Failed: ${failed}`, 'red')
  log(`   Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`, passed === tests.length ? 'green' : 'yellow')

  if (failed > 0) {
    log('\n⚠️  一些测试失败。请检查：', 'yellow')
    log('   1. 后端服务是否在运行？', 'yellow')
    log('   2. AI 服务 (Nexa/Ollama/OpenAI) 是否配置正确？', 'yellow')
    log('   3. 环境变量是否设置正确？', 'yellow')
    process.exit(1)
  } else {
    log('\n🎉 所有测试通过！AI 功能运行正常。', 'green')
    process.exit(0)
  }
}

// 运行测试
runTests().catch(error => {
  log(`\n💥 测试脚本崩溃: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})
