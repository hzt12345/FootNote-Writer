export interface MappedError {
  userMessage: string
  rawError: string
}

export function mapErrorToUserMessage(
  rawError: string,
  statusCode?: number,
  provider?: string,
): MappedError {
  // 1. HTTP status code errors
  if (statusCode !== undefined) {
    if (statusCode === 400) {
      return { userMessage: '请求参数有误，请检查模型名称是否正确', rawError }
    }
    if (statusCode === 401 || statusCode === 403) {
      return { userMessage: 'API 认证失败，请检查 API Key 是否正确', rawError }
    }
    if (statusCode === 429) {
      return { userMessage: '请求过于频繁，请稍后再试', rawError }
    }
    if (statusCode >= 500) {
      return { userMessage: 'API 服务器出错，请稍后重试', rawError }
    }
  }

  // 2. MiniMax-specific errors
  if (rawError.includes('MiniMax错误')) {
    const codeMatch = rawError.match(/MiniMax错误\((\d+)\)/)
    const code = codeMatch ? parseInt(codeMatch[1]) : 0
    if (code === 2049 || code === 1004 || rawError.toLowerCase().includes('invalid')) {
      return {
        userMessage: 'API Key 无效或已过期。请检查：1) Key 是否正确复制（无多余空格）2) Group ID 是否已填写 3) Key 是否仍有效',
        rawError,
      }
    }
  }

  // 3. Network errors
  if (rawError.includes('ECONNREFUSED') || rawError.includes('ETIMEDOUT') || rawError.includes('ENOTFOUND') ||
      rawError.includes('ECONNRESET') || rawError.includes('socket hang up') || rawError.includes('timeout')) {
    return { userMessage: '网络连接失败，请检查：1) 网络是否通畅 2) 是否使用了代理/VPN 3) API 地址是否正确', rawError }
  }

  // 4. Our own timeout (from requestTimeout setting)
  if (rawError.includes('请求超时')) {
    return { userMessage: rawError, rawError }
  }

  // 5. Empty content
  if (rawError.includes('content 为空') || rawError.includes('模型未返回有效内容')) {
    return { userMessage: '模型返回了空内容，可能是输入过长或触发了内容过滤，请尝试缩短文本', rawError }
  }

  // 6. Unknown — pass through
  return { userMessage: rawError, rawError }
}
