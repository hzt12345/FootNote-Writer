import { describe, it, expect } from 'vitest'
import { LLM_PROVIDERS, getProviderById } from '../src/shared/providers'

/**
 * 提取 ipc.ts CHAT_SEND 中的请求构建逻辑，单独测试
 * 不依赖 Electron，不调用真实 API
 */

/** 模拟 ipc.ts 中构建请求 URL 的逻辑 */
function buildRequestUrl(settings: {
  providerId: string
  apiBase: string
  groupId: string
}): { url: string; hostname: string; path: string } {
  const provider = getProviderById(settings.providerId || 'minimax')
  const apiBase = settings.apiBase || provider?.apiBase || 'https://api.minimaxi.com'
  let apiPath = provider?.apiPath || '/v1/chat/completions'
  if (provider?.needsGroupId && settings.groupId) {
    apiPath += `?GroupId=${settings.groupId}`
  }
  const url = new URL(apiPath, apiBase)
  return {
    url: url.href,
    hostname: url.hostname,
    path: url.pathname + url.search,
  }
}

/** 模拟 ipc.ts 中构建请求体的逻辑 */
function buildRequestBody(settings: {
  providerId: string
  model: string
  systemPrompt: string
}, userMessage: string): object {
  const provider = getProviderById(settings.providerId || 'minimax')
  const model = settings.model || provider?.models[0]?.id || 'MiniMax-M2.7'
  return {
    model,
    messages: [
      { role: 'system', content: settings.systemPrompt || '默认系统提示' },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
  }
}

/** 模拟 ipc.ts 中解析响应的逻辑 */
function parseApiResponse(data: string): { content?: string; error?: string } {
  try {
    const json = JSON.parse(data)
    if (json.base_resp && json.base_resp.status_code !== 0) {
      return { error: `MiniMax错误(${json.base_resp.status_code}): ${json.base_resp.status_msg}` }
    } else if (json.error) {
      return { error: json.error.message || JSON.stringify(json.error) }
    } else if (json.choices && json.choices[0]?.message) {
      const msg = json.choices[0].message
      let raw = msg.content || ''
      raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (!raw) {
        return { error: '模型未返回有效内容（content 为空）' }
      }
      const content = raw.replace(/\ufffd/g, '')
      return { content }
    } else {
      return { error: `意外的响应格式: ${data.slice(0, 300)}` }
    }
  } catch {
    return { error: `解析响应失败: ${data.slice(0, 300)}` }
  }
}

// ============================================================
// 1. URL 构建测试
// ============================================================
describe('API URL 构建', () => {
  it('通义千问: 正确拼接带 compatible-mode 的 URL', () => {
    const result = buildRequestUrl({
      providerId: 'qwen',
      apiBase: '',
      groupId: '',
    })
    expect(result.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
    expect(result.hostname).toBe('dashscope.aliyuncs.com')
    expect(result.path).toBe('/compatible-mode/v1/chat/completions')
  })

  it('MiniMax: 正确拼接带 GroupId 的 URL', () => {
    const result = buildRequestUrl({
      providerId: 'minimax',
      apiBase: '',
      groupId: '1234567890',
    })
    expect(result.url).toBe('https://api.minimaxi.com/v1/chat/completions?GroupId=1234567890')
    expect(result.path).toBe('/v1/chat/completions?GroupId=1234567890')
  })

  it('MiniMax: 没有 GroupId 时不带参数', () => {
    const result = buildRequestUrl({
      providerId: 'minimax',
      apiBase: '',
      groupId: '',
    })
    expect(result.url).toBe('https://api.minimaxi.com/v1/chat/completions')
    expect(result.path).not.toContain('GroupId')
  })

  it('Kimi: 正确拼接 URL', () => {
    const result = buildRequestUrl({
      providerId: 'kimi',
      apiBase: '',
      groupId: '',
    })
    expect(result.url).toBe('https://api.moonshot.cn/v1/chat/completions')
  })

  it('OpenAI: 正确拼接 URL', () => {
    const result = buildRequestUrl({
      providerId: 'openai',
      apiBase: '',
      groupId: '',
    })
    expect(result.url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('自定义 apiBase 覆盖默认值', () => {
    const result = buildRequestUrl({
      providerId: 'kimi',
      apiBase: 'https://custom-proxy.example.com',
      groupId: '',
    })
    expect(result.url).toBe('https://custom-proxy.example.com/v1/chat/completions')
    expect(result.hostname).toBe('custom-proxy.example.com')
  })

  it('apiBase 末尾带斜线不影响拼接', () => {
    const result = buildRequestUrl({
      providerId: 'kimi',
      apiBase: 'https://api.moonshot.cn/',
      groupId: '',
    })
    expect(result.url).toBe('https://api.moonshot.cn/v1/chat/completions')
  })

  it('空 providerId 回退到 minimax', () => {
    const result = buildRequestUrl({
      providerId: '',
      apiBase: '',
      groupId: '',
    })
    // getProviderById('') returns undefined, so fallback to default apiBase
    expect(result.url).toBe('https://api.minimaxi.com/v1/chat/completions')
  })

  it('不存在的 providerId 使用默认路径', () => {
    const result = buildRequestUrl({
      providerId: 'nonexistent',
      apiBase: 'https://example.com',
      groupId: '',
    })
    expect(result.path).toBe('/v1/chat/completions')
  })

  it('所有非 custom 服务商 URL 都是 https', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider.id === 'custom') continue
      const result = buildRequestUrl({
        providerId: provider.id,
        apiBase: '',
        groupId: provider.needsGroupId ? '123' : '',
      })
      expect(result.url).toMatch(/^https:\/\//)
    }
  })
})

// ============================================================
// 2. 请求体构建测试
// ============================================================
describe('API 请求体构建', () => {
  it('使用 provider 默认模型', () => {
    const body = buildRequestBody(
      { providerId: 'qwen', model: '', systemPrompt: '测试' },
      '你好',
    )
    expect(body).toHaveProperty('model', 'qwen3-max')
  })

  it('自定义模型覆盖默认值', () => {
    const body = buildRequestBody(
      { providerId: 'qwen', model: 'qwen-plus', systemPrompt: '' },
      '你好',
    )
    expect(body).toHaveProperty('model', 'qwen-plus')
  })

  it('包含 system 和 user 两条消息', () => {
    const body = buildRequestBody(
      { providerId: 'qwen', model: '', systemPrompt: '系统提示' },
      '用户消息',
    ) as any
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]).toEqual({ role: 'system', content: '系统提示' })
    expect(body.messages[1]).toEqual({ role: 'user', content: '用户消息' })
  })

  it('不包含 max_tokens 字段', () => {
    const body = buildRequestBody(
      { providerId: 'qwen', model: '', systemPrompt: '' },
      '你好',
    )
    expect(body).not.toHaveProperty('max_tokens')
  })

  it('temperature 固定为 0.3', () => {
    const body = buildRequestBody(
      { providerId: 'qwen', model: '', systemPrompt: '' },
      '你好',
    )
    expect(body).toHaveProperty('temperature', 0.3)
  })

  it('空 providerId 回退到 MiniMax 默认模型', () => {
    const body = buildRequestBody(
      { providerId: '', model: '', systemPrompt: '' },
      '你好',
    )
    expect(body).toHaveProperty('model', 'MiniMax-M2.7')
  })

  it('所有服务商默认模型都有值', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider.id === 'custom') continue
      const body = buildRequestBody(
        { providerId: provider.id, model: '', systemPrompt: '' },
        '你好',
      )
      expect((body as any).model).toBeTruthy()
    }
  })
})

// ============================================================
// 3. 响应解析测试
// ============================================================
describe('API 响应解析', () => {
  // ---- 成功响应 ----
  it('正确解析标准 OpenAI 格式响应', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '这是回复内容' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('这是回复内容')
    expect(result.error).toBeUndefined()
  })

  it('正确解析带 model 和 usage 的完整响应', () => {
    const data = JSON.stringify({
      model: 'qwen-plus',
      choices: [{ message: { role: 'assistant', content: '回复' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('回复')
  })

  // ---- <think> 标签过滤 ----
  it('过滤 <think> 标签（推理模型兼容）', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '<think>思考过程...</think>最终回复内容' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('最终回复内容')
    expect(result.content).not.toContain('think')
    expect(result.content).not.toContain('思考过程')
  })

  it('过滤多行 <think> 标签', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '<think>\n用户要求...\n我应该...\n</think>\n正式回复' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('正式回复')
  })

  it('过滤多个 <think> 标签', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '<think>A</think>中间文字<think>B</think>最终文字' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('中间文字最终文字')
  })

  it('只有 <think> 标签没有正文时报 content 为空', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '<think>纯思考内容</think>' } }],
    })
    const result = parseApiResponse(data)
    expect(result.error).toBe('模型未返回有效内容（content 为空）')
  })

  // ---- content 为空 ----
  it('content 为空字符串时报错', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '' } }],
    })
    const result = parseApiResponse(data)
    expect(result.error).toBe('模型未返回有效内容（content 为空）')
  })

  it('content 只有空白时报错', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '   \n\n  ' } }],
    })
    const result = parseApiResponse(data)
    expect(result.error).toBe('模型未返回有效内容（content 为空）')
  })

  // ---- Unicode 替换字符清理 ----
  it('清理 Unicode 替换字符 U+FFFD', () => {
    const data = JSON.stringify({
      choices: [{ message: { content: '正文\ufffd内容\ufffd结束' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('正文内容结束')
    expect(result.content).not.toContain('\ufffd')
  })

  // ---- 错误响应 ----
  it('解析 MiniMax 错误格式', () => {
    const data = JSON.stringify({
      base_resp: { status_code: 1004, status_msg: 'invalid api key' },
    })
    const result = parseApiResponse(data)
    expect(result.error).toContain('MiniMax错误')
    expect(result.error).toContain('1004')
    expect(result.error).toContain('invalid api key')
  })

  it('MiniMax base_resp.status_code=0 视为成功（不是错误）', () => {
    const data = JSON.stringify({
      base_resp: { status_code: 0, status_msg: 'success' },
      choices: [{ message: { content: '正常回复' } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toBe('正常回复')
  })

  it('解析 OpenAI 标准错误格式', () => {
    const data = JSON.stringify({
      error: { message: 'Invalid API key', type: 'authentication_error' },
    })
    const result = parseApiResponse(data)
    expect(result.error).toBe('Invalid API key')
  })

  it('解析无 message 的 error 对象', () => {
    const data = JSON.stringify({
      error: { type: 'rate_limit', code: 429 },
    })
    const result = parseApiResponse(data)
    expect(result.error).toContain('rate_limit')
  })

  it('解析 DeepSeek max_tokens 超限错误', () => {
    const data = JSON.stringify({
      error: { message: 'Invalid max_tokens value, the valid range of max_tokens is [1, 8192]' },
    })
    const result = parseApiResponse(data)
    expect(result.error).toContain('max_tokens')
  })

  // ---- 意外格式 ----
  it('无 choices 字段时报意外格式', () => {
    const data = JSON.stringify({ result: 'something unexpected' })
    const result = parseApiResponse(data)
    expect(result.error).toContain('意外的响应格式')
  })

  it('choices 为空数组时报意外格式', () => {
    const data = JSON.stringify({ choices: [] })
    const result = parseApiResponse(data)
    expect(result.error).toContain('意外的响应格式')
  })

  it('choices[0] 无 message 时报意外格式', () => {
    const data = JSON.stringify({ choices: [{ finish_reason: 'stop' }] })
    const result = parseApiResponse(data)
    expect(result.error).toContain('意外的响应格式')
  })

  // ---- 非 JSON 响应 ----
  it('HTML 错误页面（非 JSON）', () => {
    const data = '<html><body>502 Bad Gateway</body></html>'
    const result = parseApiResponse(data)
    expect(result.error).toContain('解析响应失败')
    expect(result.error).toContain('502')
  })

  it('空响应', () => {
    const result = parseApiResponse('')
    expect(result.error).toContain('解析响应失败')
  })

  it('截断的 JSON', () => {
    const result = parseApiResponse('{"choices": [{"mess')
    expect(result.error).toContain('解析响应失败')
  })

  // ---- 脚注相关内容 ----
  it('正确保留脚注格式内容', () => {
    const content = `正文内容[^1]，更多内容[^2]。\n\n[^1]: 参见《合同法》第52条。\n[^2]: 王利明：《民法总则研究》，第123页。`
    const data = JSON.stringify({
      choices: [{ message: { content } }],
    })
    const result = parseApiResponse(data)
    expect(result.content).toContain('[^1]')
    expect(result.content).toContain('[^2]')
    expect(result.content).toContain('合同法')
    expect(result.content).toContain('王利明')
  })
})

// ============================================================
// 4. Provider 配置完整性测试
// ============================================================
describe('Provider 配置完整性', () => {
  it('所有非 custom 服务商都有 apiBase', () => {
    for (const p of LLM_PROVIDERS) {
      if (p.id === 'custom') continue
      expect(p.apiBase, `${p.id} 缺少 apiBase`).toBeTruthy()
      expect(p.apiBase).toMatch(/^https:\/\//)
    }
  })

  it('所有服务商都有 apiPath', () => {
    for (const p of LLM_PROVIDERS) {
      expect(p.apiPath, `${p.id} 缺少 apiPath`).toBeTruthy()
      expect(p.apiPath).toContain('/chat/completions')
    }
  })

  it('所有非 custom 服务商至少有一个模型', () => {
    for (const p of LLM_PROVIDERS) {
      if (p.id === 'custom') continue
      expect(p.models.length, `${p.id} 没有模型`).toBeGreaterThan(0)
    }
  })

  it('只有 minimax 需要 GroupId', () => {
    for (const p of LLM_PROVIDERS) {
      if (p.id === 'minimax') {
        expect(p.needsGroupId).toBe(true)
      } else {
        expect(p.needsGroupId, `${p.id} 不应该 needsGroupId`).toBeFalsy()
      }
    }
  })

  it('所有非 custom 服务商 URL 可以正确构建', () => {
    for (const p of LLM_PROVIDERS) {
      if (p.id === 'custom') continue
      // 不应该抛出异常
      expect(() => new URL(p.apiPath, p.apiBase)).not.toThrow()
      const url = new URL(p.apiPath, p.apiBase)
      expect(url.protocol).toBe('https:')
    }
  })

  it('模型 ID 不包含空格', () => {
    for (const p of LLM_PROVIDERS) {
      for (const m of p.models) {
        expect(m.id, `${p.id} 的模型 ${m.id} 包含空格`).not.toMatch(/\s/)
      }
    }
  })

  it('模型 name 不为空', () => {
    for (const p of LLM_PROVIDERS) {
      for (const m of p.models) {
        expect(m.name, `${p.id} 的模型 name 为空`).toBeTruthy()
      }
    }
  })
})

// ============================================================
// 5. System Prompt 构建测试
// ============================================================
describe('System Prompt 构建', () => {
  /** 模拟 ipc.ts 中 system prompt 拼接逻辑 */
  function buildSystemPrompt(opts: {
    systemPrompt?: string
    templateGroup?: string
    templateFormat?: string
    references?: { title: string; content: string }[]
    maxRefChars?: number
  }): string {
    let fullSystemPrompt = opts.systemPrompt || '默认系统提示'

    if (opts.templateFormat) {
      fullSystemPrompt += `\n\n当前脚注格式模板：${opts.templateFormat}`
    }

    if (opts.references && opts.references.length > 0) {
      const maxTotalChars = opts.maxRefChars || 30000
      const perRefLimit = Math.floor(maxTotalChars / opts.references.length)
      fullSystemPrompt += '\n\n以下是用户提供的参考文献（脚注只能引用这些文献）：\n'
      for (const ref of opts.references) {
        const text = ref.content.length > perRefLimit
          ? ref.content.slice(0, perRefLimit) + '\n...(文献内容已截断)'
          : ref.content
        fullSystemPrompt += `\n===== 文献：${ref.title} =====\n${text}\n`
      }
    }

    return fullSystemPrompt
  }

  it('无参考文献时只有系统提示', () => {
    const prompt = buildSystemPrompt({ systemPrompt: '你是助手' })
    expect(prompt).toBe('你是助手')
  })

  it('添加模板格式', () => {
    const prompt = buildSystemPrompt({
      systemPrompt: '你是助手',
      templateFormat: '{作者}：《{书名}》',
    })
    expect(prompt).toContain('当前脚注格式模板')
    expect(prompt).toContain('{作者}：《{书名}》')
  })

  it('添加参考文献', () => {
    const prompt = buildSystemPrompt({
      systemPrompt: '你是助手',
      references: [
        { title: '民法总则', content: '第一条 为了保护民事主体的合法权益...' },
      ],
    })
    expect(prompt).toContain('参考文献')
    expect(prompt).toContain('民法总则')
    expect(prompt).toContain('合法权益')
  })

  it('参考文献超长时截断', () => {
    const longContent = '重复内容'.repeat(10000) // 40000 chars
    const prompt = buildSystemPrompt({
      references: [{ title: '长文献', content: longContent }],
      maxRefChars: 100,
    })
    expect(prompt).toContain('文献内容已截断')
    expect(prompt.length).toBeLessThan(longContent.length)
  })

  it('多篇参考文献均分字符限额', () => {
    const content1 = 'A'.repeat(20000)
    const content2 = 'B'.repeat(20000)
    const prompt = buildSystemPrompt({
      references: [
        { title: '文献1', content: content1 },
        { title: '文献2', content: content2 },
      ],
      maxRefChars: 10000,
    })
    // 每篇限 5000 字符
    expect(prompt).toContain('文献内容已截断')
    // 两篇都应该出现
    expect(prompt).toContain('文献1')
    expect(prompt).toContain('文献2')
  })
})

// ============================================================
// 6. 设置默认值回退测试
// ============================================================
describe('设置默认值回退', () => {
  /** 模拟 db.ts getSettings 的默认值逻辑 */
  function getSettingsDefaults(map: Map<string, string>) {
    return {
      providerId: map.get('providerId') || 'minimax',
      apiKey: map.get('apiKey') || '',
      apiBase: map.get('apiBase') || 'https://api.minimaxi.com',
      groupId: map.get('groupId') || '',
      model: map.get('model') || 'MiniMax-M2.5',
      systemPrompt: map.get('systemPrompt') || '默认提示',
      defaultTemplateId: map.has('defaultTemplateId') ? Number(map.get('defaultTemplateId')) : null,
      exportFont: map.get('exportFont') || '宋体',
      exportFontSize: Number(map.get('exportFontSize') || '12'),
      maxRefChars: Number(map.get('maxRefChars') || '30000'),
    }
  }

  it('空数据库返回所有默认值', () => {
    const settings = getSettingsDefaults(new Map())
    expect(settings.providerId).toBe('minimax')
    expect(settings.apiKey).toBe('')
    expect(settings.apiBase).toBe('https://api.minimaxi.com')
    expect(settings.model).toBe('MiniMax-M2.5')
    expect(settings.exportFont).toBe('宋体')
    expect(settings.exportFontSize).toBe(12)
    expect(settings.maxRefChars).toBe(30000)
    expect(settings.defaultTemplateId).toBeNull()
  })

  it('部分设置覆盖默认值', () => {
    const map = new Map([
      ['providerId', 'qwen'],
      ['apiKey', 'sk-test'],
      ['model', 'qwen-plus'],
    ])
    const settings = getSettingsDefaults(map)
    expect(settings.providerId).toBe('qwen')
    expect(settings.apiKey).toBe('sk-test')
    expect(settings.model).toBe('qwen-plus')
    // 其他保持默认
    expect(settings.exportFont).toBe('宋体')
  })

  it('数字字段正确转换', () => {
    const map = new Map([
      ['exportFontSize', '14'],
      ['maxRefChars', '50000'],
    ])
    const settings = getSettingsDefaults(map)
    expect(settings.exportFontSize).toBe(14)
    expect(settings.maxRefChars).toBe(50000)
  })

  it('非法数字字段: exportFontSize 非法值产生 NaN', () => {
    const map = new Map([['exportFontSize', 'abc']])
    const settings = getSettingsDefaults(map)
    expect(settings.exportFontSize).toBeNaN() // Number('abc') = NaN
  })

  it('空字符串 maxRefChars 回退到默认值 30000', () => {
    // db.ts 逻辑: Number(map.get('maxRefChars') || '30000')
    // 空字符串 '' 是 falsy，所以 || '30000' 生效
    const map = new Map([['maxRefChars', '']])
    const settings = getSettingsDefaults(map)
    expect(settings.maxRefChars).toBe(30000)
  })
})

// ============================================================
// 7. 端到端模拟测试（完整调用链路）
// ============================================================
describe('端到端调用链路模拟', () => {
  /** 完全模拟 ipc.ts CHAT_SEND 的逻辑（不发网络请求） */
  function simulateChatSend(settings: {
    providerId: string
    apiKey: string
    apiBase: string
    groupId: string
    model: string
    systemPrompt: string
  }) {
    // Step 1: 检查 API Key
    if (!settings.apiKey) {
      return { error: '请先在设置中配置 API Key' }
    }

    // Step 2: 构建 URL
    const provider = getProviderById(settings.providerId || 'minimax')
    const model = settings.model || provider?.models[0]?.id || 'MiniMax-M2.7'
    const apiBase = settings.apiBase || provider?.apiBase || 'https://api.minimaxi.com'
    let apiPath = provider?.apiPath || '/v1/chat/completions'
    if (provider?.needsGroupId && settings.groupId) {
      apiPath += `?GroupId=${settings.groupId}`
    }

    // Step 3: 构建请求体
    const body = {
      model,
      messages: [
        { role: 'system', content: settings.systemPrompt || '默认提示' },
        { role: 'user', content: '测试消息' },
      ],
      temperature: 0.3,
    }

    const url = new URL(apiPath, apiBase)

    return {
      url: url.href,
      hostname: url.hostname,
      path: url.pathname + url.search,
      model,
      body,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
    }
  }

  it('通义千问 完整链路', () => {
    const result = simulateChatSend({
      providerId: 'qwen',
      apiKey: 'sk-test',
      apiBase: '',
      groupId: '',
      model: '',
      systemPrompt: '你是助手',
    })
    expect(result).not.toHaveProperty('error')
    expect((result as any).url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
    expect((result as any).model).toBe('qwen3-max')
    expect((result as any).headers.Authorization).toBe('Bearer sk-test')
  })

  it('MiniMax 完整链路（带 GroupId）', () => {
    const result = simulateChatSend({
      providerId: 'minimax',
      apiKey: 'sk-api-test',
      apiBase: '',
      groupId: '999',
      model: 'MiniMax-M2.7',
      systemPrompt: '',
    })
    expect(result).not.toHaveProperty('error')
    expect((result as any).url).toBe('https://api.minimaxi.com/v1/chat/completions?GroupId=999')
  })

  it('无 API Key 报错', () => {
    const result = simulateChatSend({
      providerId: 'qwen',
      apiKey: '',
      apiBase: '',
      groupId: '',
      model: '',
      systemPrompt: '',
    })
    expect(result).toHaveProperty('error', '请先在设置中配置 API Key')
  })

  it('自定义 provider 使用用户填写的 apiBase', () => {
    const result = simulateChatSend({
      providerId: 'custom',
      apiKey: 'sk-custom',
      apiBase: 'https://my-proxy.com',
      groupId: '',
      model: 'my-model',
      systemPrompt: '',
    })
    expect(result).not.toHaveProperty('error')
    expect((result as any).url).toBe('https://my-proxy.com/v1/chat/completions')
    expect((result as any).model).toBe('my-model')
  })
})
