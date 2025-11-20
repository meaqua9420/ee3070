#!/usr/bin/env node
/**
 * 🎥 ESP32-S3 CAM 快速测试工具
 * ESP32-S3 CAM Quick Test Tool
 */

const http = require('http')
const fs = require('fs')

console.log('🎥 ESP32-S3 CAM 快速测试工具')
console.log('===========================\n')

// 测试配置
const tests = [
  {
    name: 'ESP32 直连测试 (AP 模式)',
    url: 'http://192.168.5.1/capture',
    description: '测试是否能直接访问 ESP32 摄像头（需要连接到 ESP32 热点）'
  },
  {
    name: 'ESP32 局域网测试',
    url: 'http://192.168.0.123/capture',
    description: '测试 ESP32 在局域网中的连接（请根据实际 IP 修改）'
  },
  {
    name: '后端代理测试',
    url: 'http://localhost:4000/api/camera/snapshot',
    description: '测试通过后端代理访问摄像头'
  }
]

async function testUrl(url, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 测试: ${description}`)
    console.log(`   URL: ${url}`)

    const startTime = Date.now()

    http.get(url, (res) => {
      const duration = Date.now() - startTime
      const { statusCode, headers } = res

      console.log(`   状态码: ${statusCode}`)
      console.log(`   内容类型: ${headers['content-type'] || 'N/A'}`)
      console.log(`   响应时间: ${duration}ms`)

      let data = []
      res.on('data', chunk => data.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(data)
        const size = buffer.length

        if (statusCode === 200 && size > 100) {
          console.log(`   ✅ 成功！收到 ${(size / 1024).toFixed(2)} KB 数据`)

          // 保存照片
          const filename = `test_${Date.now()}.jpg`
          fs.writeFileSync(filename, buffer)
          console.log(`   📷 照片已保存: ${filename}`)
          resolve({ success: true, url, size, duration })
        } else {
          console.log(`   ❌ 失败：响应异常（大小: ${size} bytes）`)
          resolve({ success: false, url, error: `Status ${statusCode}` })
        }
      })
    }).on('error', (err) => {
      const duration = Date.now() - startTime
      console.log(`   ❌ 连接失败: ${err.message}`)
      console.log(`   响应时间: ${duration}ms`)
      resolve({ success: false, url, error: err.message })
    }).setTimeout(5000, function() {
      this.destroy()
      console.log(`   ❌ 超时（5秒）`)
      resolve({ success: false, url, error: 'Timeout' })
    })
  })
}

async function runTests() {
  console.log('📋 将测试以下端点：\n')
  tests.forEach((test, i) => {
    console.log(`${i + 1}. ${test.name}`)
    console.log(`   ${test.description}`)
    console.log(`   ${test.url}\n`)
  })

  console.log('⏳ 开始测试...\n')
  console.log('=' .repeat(50))

  const results = []
  for (const test of tests) {
    const result = await testUrl(test.url, test.name)
    results.push(result)
  }

  console.log('\n' + '='.repeat(50))
  console.log('\n📊 测试结果总结：\n')

  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  if (successful.length > 0) {
    console.log('✅ 成功的连接：')
    successful.forEach(r => {
      console.log(`   ${r.url}`)
      console.log(`   - 大小: ${(r.size / 1024).toFixed(2)} KB`)
      console.log(`   - 耗时: ${r.duration}ms`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ 失败的连接：')
    failed.forEach(r => {
      console.log(`   ${r.url}`)
      console.log(`   - 原因: ${r.error}`)
    })
  }

  console.log('\n💡 建议：')

  if (successful.length === 0) {
    console.log('   ⚠️  所有测试都失败了，请检查：')
    console.log('   1. ESP32-S3 是否已启动？')
    console.log('   2. 是否连接到正确的 Wi-Fi？')
    console.log('   3. IP 地址是否正确？')
    console.log('   4. 后端服务器是否运行？')
    console.log('\n   📚 详细指南：')
    console.log('   cat /Users/meaqua/Desktop/EE3070/ESP32_CAM_INTEGRATION_ZH.md')
  } else if (successful.find(r => r.url.includes('localhost:4000'))) {
    console.log('   ✅ 后端代理工作正常！')
    console.log('   ✅ 可以在前端使用 fetch("http://localhost:4000/api/camera/snapshot")')
  } else if (successful.find(r => r.url.includes('192.168'))) {
    console.log('   ✅ ESP32 连接正常！')
    console.log('   💡 建议配置后端代理以避免 CORS 问题')
    console.log('   编辑 /Users/meaqua/Desktop/EE3070/smart-cat-backend/.env：')
    console.log(`   CAMERA_BASE_URL=${successful[0].url.match(/http:\/\/[^/]+/)[0]}`)
  }

  console.log('\n✅ 测试完成！')
}

// 运行测试
runTests().catch(console.error)
