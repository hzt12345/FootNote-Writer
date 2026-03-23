/**
 * CI API Smoke Test — verifies real API calls work for each provider.
 * Runs in Node.js (no Electron needed).
 *
 * Usage: node scripts/api-smoke-test.mjs
 *
 * Required env vars:
 *   DEEPSEEK_API_KEY, QWEN_API_KEY, MINIMAX_API_KEY, MINIMAX_GROUP_ID, KIMI_API_KEY
 */

import https from 'https'

const PROVIDERS = [
  {
    name: '通义千问',
    envKey: 'QWEN_API_KEY',
    apiBase: 'dashscope.aliyuncs.com',
    apiPath: '/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
  },
  {
    name: 'MiniMax',
    envKey: 'MINIMAX_API_KEY',
    apiBase: 'api.minimaxi.com',
    get apiPath() {
      const groupId = process.env.MINIMAX_GROUP_ID || ''
      return groupId ? `/v1/chat/completions?GroupId=${groupId}` : '/v1/chat/completions'
    },
    model: 'MiniMax-M2.5',
  },
  {
    name: 'Kimi',
    envKey: 'KIMI_API_KEY',
    apiBase: 'api.moonshot.cn',
    apiPath: '/v1/chat/completions',
    model: 'moonshot-v1-128k',
    noTemperature: true,
  },
]

function callAPI(provider) {
  return new Promise((resolve) => {
    const apiKey = process.env[provider.envKey]
    if (!apiKey) {
      resolve({ provider: provider.name, status: 'SKIP', message: `${provider.envKey} not set` })
      return
    }

    const body = JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一个助手' },
        { role: 'user', content: '请回复"OK"两个字母，不要说其他任何内容' },
      ],
      ...(provider.noTemperature ? {} : { temperature: 0.1 }),
    })

    const apiPath = typeof provider.apiPath === 'string' ? provider.apiPath : provider.apiPath
    const req = https.request(
      {
        hostname: provider.apiBase,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            // MiniMax error format
            if (json.base_resp && json.base_resp.status_code !== 0) {
              resolve({ provider: provider.name, status: 'FAIL', message: `MiniMax错误(${json.base_resp.status_code}): ${json.base_resp.status_msg}` })
              return
            }
            // OpenAI error format
            if (json.error) {
              resolve({ provider: provider.name, status: 'FAIL', message: json.error.message || JSON.stringify(json.error) })
              return
            }
            // Success
            if (json.choices && json.choices[0]?.message?.content) {
              let content = json.choices[0].message.content
              content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
              resolve({ provider: provider.name, status: 'PASS', message: `"${content.slice(0, 50)}"` })
            } else {
              resolve({ provider: provider.name, status: 'FAIL', message: `Unexpected response: ${data.slice(0, 200)}` })
            }
          } catch {
            resolve({ provider: provider.name, status: 'FAIL', message: `Parse error: ${data.slice(0, 200)}` })
          }
        })
      },
    )

    req.on('timeout', () => {
      req.destroy()
      resolve({ provider: provider.name, status: 'FAIL', message: 'Timeout (30s)' })
    })

    req.on('error', (err) => {
      resolve({ provider: provider.name, status: 'FAIL', message: err.message })
    })

    req.write(body)
    req.end()
  })
}

async function callWithRetry(provider, retries = 1) {
  const result = await callAPI(provider)
  if (result.status === 'FAIL' && retries > 0 && result.message.includes('overloaded')) {
    console.log(`RETRY (server overloaded, waiting 5s)...`)
    await new Promise(r => setTimeout(r, 5000))
    process.stdout.write(`  Retrying ${provider.name}... `)
    return callWithRetry(provider, retries - 1)
  }
  return result
}

async function main() {
  console.log('=== FootNote Writer API Smoke Test ===\n')

  const results = []
  for (const provider of PROVIDERS) {
    process.stdout.write(`Testing ${provider.name}... `)
    const result = await callWithRetry(provider)
    console.log(`${result.status} ${result.message}`)
    results.push(result)
  }

  console.log('\n=== Summary ===')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length
  console.log(`PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`)

  if (failed > 0) {
    console.log('\nFailed providers:')
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - ${r.provider}: ${r.message}`)
    }
    process.exit(1)
  }

  console.log('\nAll API providers working!')
}

main()
