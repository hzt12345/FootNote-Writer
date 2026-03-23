import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { IPC } from '../shared/types'
import { getProviderById } from '../shared/providers'
import { exportToDocx } from './docx-export'
import { extractTextFromFile } from './file-reader'
import {
  addReference, getReferences, deleteReference,
  getTemplates, saveTemplate, deleteTemplate,
  getSettings, saveSettings,
} from './db'
import { getCitationPrompt } from '../shared/citation-prompts'
import https from 'https'
import http from 'http'
import fs from 'fs'
import os from 'os'
import { logger } from './logger'
import { mapErrorToUserMessage } from './error-mapping'

/**
 * Simple keyword-based retrieval: split references into chunks,
 * score each chunk by keyword overlap with body text, return top chunks
 * within a character budget.
 */
function retrieveRelevantChunks(
  bodyText: string,
  references: { title: string; author: string; content: string }[],
  maxChars: number,
): { title: string; text: string; score: number }[] {
  // If total reference content is small enough, just send everything
  const totalRefChars = references.reduce((sum, r) => sum + r.content.length, 0)
  if (totalRefChars <= maxChars) {
    return references.map(ref => ({ title: ref.title, text: ref.content, score: 10 }))
  }

  // If body text is short (< 500 chars), keyword matching is unreliable
  // Just take the beginning of each reference evenly
  if (bodyText.length < 500) {
    const perRef = Math.floor(maxChars / references.length)
    return references.map(ref => ({
      title: ref.title,
      text: ref.content.slice(0, Math.min(ref.content.length, perRef)),
      score: 5,
    }))
  }

  // Extract keywords from body text (Chinese: split by punctuation; English: split by space)
  const bodyKeywords = extractKeywords(bodyText)
  if (bodyKeywords.size === 0) {
    // Fallback: just take first N chars from each reference
    const chunks: { title: string; text: string; score: number }[] = []
    let budget = maxChars
    for (const ref of references) {
      if (budget <= 0) break
      const take = Math.min(ref.content.length, budget, 2000)
      chunks.push({ title: ref.title, text: ref.content.slice(0, take), score: 0 })
      budget -= take
    }
    return chunks
  }

  // Split each reference into ~500-char chunks and score
  const allChunks: { title: string; text: string; score: number }[] = []
  for (const ref of references) {
    const chunks = splitIntoChunks(ref.content, 500)
    for (const chunk of chunks) {
      const chunkKeywords = extractKeywords(chunk)
      let score = 0
      for (const kw of chunkKeywords) {
        if (bodyKeywords.has(kw)) score++
      }
      if (score > 0) {
        allChunks.push({ title: ref.title, text: chunk, score })
      }
    }
    // Always include the first chunk (title/abstract area) with a small bonus
    if (chunks.length > 0) {
      const firstChunk = allChunks.find(c => c.text === chunks[0] && c.title === ref.title)
      if (firstChunk) {
        firstChunk.score += 2 // boost title/abstract
      } else {
        allChunks.push({ title: ref.title, text: chunks[0], score: 1 })
      }
    }
  }

  // Sort by score descending, take top chunks within budget
  allChunks.sort((a, b) => b.score - a.score)

  const result: { title: string; text: string; score: number }[] = []
  let budget = maxChars
  for (const chunk of allChunks) {
    if (budget <= 0) break
    result.push(chunk)
    budget -= chunk.text.length
  }
  return result
}

function extractKeywords(text: string): Set<string> {
  // Remove common punctuation, split into tokens
  const cleaned = text
    .replace(/[，。、；：""''（）【】《》？！\s\n\r\t,.;:?!()[\]{}"']/g, ' ')
    .toLowerCase()
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 2)
  // Filter out very common stop words
  const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'but', 'also', 'than', 'then', 'into', 'about', 'which', 'their', 'there', 'these', 'those', 'other', 'some', 'such', 'only', 'over', 'after', 'before', 'between', 'through', 'during', 'under', 'above', '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'])
  return new Set(tokens.filter(t => !stopWords.has(t)))
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize))
  }
  return chunks
}

export function registerIPC() {
  // ---- DOCX Export ----
  ipcMain.handle(IPC.EXPORT_DOCX, async (_event, { paragraphs, footnotes, font, fontSize, mode }) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: '导出DOCX',
      defaultPath: '学术论文.docx',
      filters: [{ name: 'Word文档', extensions: ['docx'] }],
    })
    if (result.canceled || !result.filePath) return { success: false }
    await exportToDocx({ paragraphs, footnotes, font, fontSize, mode }, result.filePath)
    logger.info('file', `DOCX export mode=${mode} success`)
    return { success: true, path: result.filePath }
  })

  // ---- File reading ----
  ipcMain.handle(IPC.READ_FILE, async (_event, filePath: string) => {
    logger.info('file', `Read file: ${filePath}`)
    return extractTextFromFile(filePath)
  })

  // ---- Open file dialog ----
  ipcMain.handle(IPC.OPEN_FILE_DIALOG, async (_event, options: { filters?: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters || [
        { name: '文档', extensions: ['pdf', 'docx', 'txt', 'md'] },
      ],
    })
    if (result.canceled) return { canceled: true, filePaths: [] }
    return { canceled: false, filePaths: result.filePaths }
  })

  // ---- References ----
  ipcMain.handle(IPC.ADD_REFERENCE, async (_event, ref) => {
    return addReference(ref)
  })

  ipcMain.handle(IPC.GET_REFERENCES, async () => {
    return getReferences()
  })

  ipcMain.handle(IPC.DELETE_REFERENCE, async (_event, id: number) => {
    deleteReference(id)
    return { success: true }
  })

  // ---- Templates ----
  ipcMain.handle(IPC.GET_TEMPLATES, async () => {
    return getTemplates()
  })

  ipcMain.handle(IPC.SAVE_TEMPLATE, async (_event, tmpl) => {
    return saveTemplate(tmpl)
  })

  ipcMain.handle(IPC.DELETE_TEMPLATE, async (_event, id: number) => {
    deleteTemplate(id)
    return { success: true }
  })

  // ---- Settings ----
  ipcMain.handle(IPC.GET_SETTINGS, async () => {
    return getSettings()
  })

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_event, settings) => {
    saveSettings(settings)
    logger.info('settings', `Settings saved provider=${settings.providerId || '?'} model=${settings.model || '?'}`)
    return { success: true }
  })

  // ---- Log Export ----
  ipcMain.handle(IPC.LOG_EXPORT, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false }
    const result = await dialog.showSaveDialog(win, {
      title: '导出诊断日志',
      defaultPath: `footnote-writer-log-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
    })
    if (result.canceled || !result.filePath) return { success: false }

    const settings = getSettings()
    const maskedKey = settings.apiKey
      ? settings.apiKey.slice(0, 4) + '****'
      : '(未设置)'

    const header = [
      'FootNote Writer 诊断日志',
      `导出时间: ${new Date().toISOString()}`,
      `App 版本: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `OS: ${process.platform} ${process.arch} ${os.release()}`,
      `Provider: ${settings.providerId}`,
      `Model: ${settings.model}`,
      `API Key: ${maskedKey}`,
      '---',
      '',
    ].join('\n')

    const logContent = logger.getLogContent()
    fs.writeFileSync(result.filePath, header + logContent)
    return { success: true, path: result.filePath }
  })

  // ---- MiniMax API Chat ----
  ipcMain.handle(IPC.CHAT_SEND, async (_event, { messages, systemPrompt, references, templateFormat, templateGroup }) => {
    const settings = getSettings()
    if (!settings.apiKey) {
      return { error: '请先在设置中配置 API Key' }
    }

    // Build system prompt with references and template
    let fullSystemPrompt = systemPrompt || settings.systemPrompt
    if (templateGroup) {
      const citationPrompt = getCitationPrompt(templateGroup)
      if (citationPrompt) {
        fullSystemPrompt += `\n\n${citationPrompt}`
      }
    }
    if (templateFormat) {
      fullSystemPrompt += `\n\n当前脚注格式模板：${templateFormat}`
    }
    if (references && references.length > 0) {
      const maxTotalChars = settings.maxRefChars || 30000
      const perRefLimit = Math.floor(maxTotalChars / references.length)
      fullSystemPrompt += '\n\n以下是用户提供的参考文献（脚注只能引用这些文献）：\n'
      for (const ref of references) {
        const text = ref.content.length > perRefLimit
          ? ref.content.slice(0, perRefLimit) + '\n...(文献内容已截断)'
          : ref.content
        fullSystemPrompt += `\n===== 文献：${ref.title} =====\n${text}\n`
      }
    }

    // Build OpenAI-compatible messages array with system message first
    const apiMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    const provider = getProviderById(settings.providerId || 'minimax')
    const model = settings.model || provider?.models[0]?.id || 'MiniMax-M2.7'
    const apiBase = settings.apiBase || provider?.apiBase || 'https://api.minimaxi.com'
    const groupId = settings.groupId || ''
    // Use provider's API path; append GroupId for MiniMax
    let apiPath = provider?.apiPath || '/v1/chat/completions'
    if (provider?.needsGroupId && groupId) {
      apiPath += `?GroupId=${groupId}`
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: apiMessages,
    }
    if (!provider?.noTemperature) {
      requestBody.temperature = 0.3
    }
    const body = JSON.stringify(requestBody)

    logger.info('api', `Request to ${settings.providerId}/${model} msgCount=${messages.length}`)

    try {
      const result = await new Promise<{ content?: string; error?: string }>((resolve) => {
        const url = new URL(apiPath, apiBase)
        const isHttps = url.protocol === 'https:'
        const reqModule = isHttps ? https : http

        const req = reqModule.request(
          {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.apiKey}`,
            },
            ...(settings.requestTimeout > 0 ? { timeout: settings.requestTimeout * 1000 } : {}),
          },
          (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
              const statusCode = res.statusCode || 0
              logger.info('api', `Response status=${statusCode} bytes=${data.length}`)

              // Check HTTP status before JSON parsing
              if (statusCode >= 400) {
                const rawError = `HTTP ${statusCode}: ${data.slice(0, 300)}`
                const mapped = mapErrorToUserMessage(rawError, statusCode, settings.providerId)
                logger.error('api', `HTTP error: ${rawError}`)
                resolve({ error: mapped.userMessage })
                return
              }

              try {
                const json = JSON.parse(data)
                // Check for MiniMax error format
                if (json.base_resp && json.base_resp.status_code !== 0) {
                  const rawError = `MiniMax错误(${json.base_resp.status_code}): ${json.base_resp.status_msg}`
                  const mapped = mapErrorToUserMessage(rawError, statusCode, settings.providerId)
                  logger.error('api', rawError)
                  resolve({ error: mapped.userMessage })
                } else if (json.error) {
                  const rawError = json.error.message || JSON.stringify(json.error)
                  const mapped = mapErrorToUserMessage(rawError, statusCode, settings.providerId)
                  logger.error('api', `API error: ${rawError}`)
                  resolve({ error: mapped.userMessage })
                } else if (json.choices && json.choices[0]?.message) {
                  const msg = json.choices[0].message
                  let raw = msg.content || ''
                  // Strip <think>...</think> blocks that some reasoning models embed in content
                  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
                  if (!raw) {
                    const rawError = '模型未返回有效内容（content 为空）'
                    const mapped = mapErrorToUserMessage(rawError)
                    logger.error('api', rawError)
                    resolve({ error: mapped.userMessage })
                    return
                  }
                  // Clean up garbled Unicode replacement characters
                  const content = raw.replace(/\ufffd/g, '')
                  logger.info('api', `Success contentLength=${content.length}`)
                  resolve({ content })
                } else {
                  const rawError = `意外的响应格式: ${data.slice(0, 300)}`
                  const mapped = mapErrorToUserMessage(rawError)
                  logger.error('api', rawError)
                  resolve({ error: mapped.userMessage })
                }
              } catch {
                const rawError = `解析响应失败: ${data.slice(0, 300)}`
                const mapped = mapErrorToUserMessage(rawError)
                logger.error('api', rawError)
                resolve({ error: mapped.userMessage })
              }
            })
          },
        )

        req.on('timeout', () => {
          req.destroy()
          const rawError = `请求超时（${settings.requestTimeout}秒无响应）`
          const mapped = mapErrorToUserMessage(rawError)
          logger.error('api', rawError)
          resolve({ error: mapped.userMessage })
        })

        req.on('error', (err: Error) => {
          const rawError = `请求失败: ${err.message}`
          const mapped = mapErrorToUserMessage(rawError)
          logger.error('api', rawError)
          resolve({ error: mapped.userMessage })
        })


        req.write(body)
        req.end()
      })

      return result
    } catch (err: any) {
      const rawError = err.message || '调用API失败'
      const mapped = mapErrorToUserMessage(rawError)
      logger.error('api', rawError)
      return { error: mapped.userMessage }
    }
  })
}
