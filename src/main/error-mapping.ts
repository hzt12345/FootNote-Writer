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
  if (rawError.includes('ECONNREFUSED') || rawError.includes('ETIMEDOUT') || rawError.includes('ENOTFOUND')) {
    return { userMessage: '无法连接到 API 服务器，请检查网络连接或 API 地址是否正确', rawError }
  }

  // 4. Timeout
  if (rawError.includes('请求超时') || rawError.includes('timeout')) {
    return { userMessage: '请求超时，请检查网络连接或稍后重试', rawError }
  }

  // 5. Empty content
  if (rawError.includes('content 为空') || rawError.includes('模型未返回有效内容')) {
    return { userMessage: '模型返回了空内容，可能是输入过长或触发了内容过滤，请尝试缩短文本', rawError }
  }

  // 6. Unknown — pass through
  return { userMessage: rawError, rawError }
}
