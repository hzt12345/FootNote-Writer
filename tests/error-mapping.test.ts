import { describe, it, expect } from 'vitest'
import { mapErrorToUserMessage } from '../src/main/error-mapping'

describe('mapErrorToUserMessage', () => {
  it('MiniMax 2049 → API key guidance', () => {
    const result = mapErrorToUserMessage('MiniMax错误(2049): invalid api key', undefined, 'minimax')
    expect(result.userMessage).toContain('API Key 无效或已过期')
    expect(result.userMessage).toContain('Group ID')
    expect(result.rawError).toBe('MiniMax错误(2049): invalid api key')
  })

  it('MiniMax 1004 → API key guidance', () => {
    const result = mapErrorToUserMessage('MiniMax错误(1004): invalid api key', undefined, 'minimax')
    expect(result.userMessage).toContain('API Key 无效或已过期')
  })

  it('HTTP 400 → parameter error', () => {
    const result = mapErrorToUserMessage('Bad Request', 400)
    expect(result.userMessage).toContain('请求参数有误')
  })

  it('HTTP 401 → auth failure', () => {
    const result = mapErrorToUserMessage('Unauthorized', 401)
    expect(result.userMessage).toContain('API 认证失败')
  })

  it('HTTP 403 → auth failure', () => {
    const result = mapErrorToUserMessage('Forbidden', 403)
    expect(result.userMessage).toContain('API 认证失败')
  })

  it('HTTP 429 → rate limit', () => {
    const result = mapErrorToUserMessage('Too Many Requests', 429)
    expect(result.userMessage).toContain('请求过于频繁')
  })

  it('HTTP 500 → server error', () => {
    const result = mapErrorToUserMessage('Internal Server Error', 500)
    expect(result.userMessage).toContain('API 服务器出错')
  })

  it('HTTP 502 → server error', () => {
    const result = mapErrorToUserMessage('Bad Gateway', 502)
    expect(result.userMessage).toContain('API 服务器出错')
  })

  it('ECONNREFUSED → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: connect ECONNREFUSED 127.0.0.1:443')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('ETIMEDOUT → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: connect ETIMEDOUT')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('ENOTFOUND → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: getaddrinfo ENOTFOUND api.example.com')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('ECONNRESET → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: read ECONNRESET')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('socket hang up → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: socket hang up')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('connect timeout → network guidance', () => {
    const result = mapErrorToUserMessage('请求失败: connect timeout')
    expect(result.userMessage).toContain('网络连接失败')
  })

  it('our timeout → pass through', () => {
    const result = mapErrorToUserMessage('请求超时（60秒无响应）')
    expect(result.userMessage).toContain('请求超时')
  })

  it('empty content → content guidance', () => {
    const result = mapErrorToUserMessage('模型未返回有效内容（content 为空）')
    expect(result.userMessage).toContain('模型返回了空内容')
  })

  it('unknown error → pass through raw message', () => {
    const result = mapErrorToUserMessage('some unknown error 12345')
    expect(result.userMessage).toBe('some unknown error 12345')
    expect(result.rawError).toBe('some unknown error 12345')
  })

  it('always preserves rawError', () => {
    const result = mapErrorToUserMessage('MiniMax错误(2049): bad key', 200, 'minimax')
    expect(result.rawError).toBe('MiniMax错误(2049): bad key')
  })
})
