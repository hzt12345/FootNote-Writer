import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from './lib/store'
import { sendChatMessage } from './lib/claude-api'
import { parseFootnotes } from './lib/footnote-parser'
import { importDocumentFiles, importReferenceFiles } from './lib/file-import'
import Settings from './components/Settings'
import { IPC, Reference } from '../shared/types'
import {
  Settings as SettingsIcon,
  FileUp, BookOpen, Sparkles, Download,
  Loader2, X, ArrowLeft, Trash2,
} from 'lucide-react'

const { ipcRenderer } = window.require('electron')

/**
 * Graft footnote markers from AI output onto the original text.
 * AI may have altered wording, but we want to keep original text intact
 * and only take the footnote marker positions.
 */
function graftFootnotesOntoOriginal(original: string, aiBody: string): string {
  // Extract footnote markers and their preceding context from AI output
  const markerRegex = /\[\^?(\d+)\]/g
  const markers: { id: string; beforeText: string; afterChar: string }[] = []
  let lastEnd = 0
  let match: RegExpExecArray | null

  while ((match = markerRegex.exec(aiBody)) !== null) {
    // Get text chunk before this marker (between previous marker and this one)
    const before = aiBody.slice(lastEnd, match.index)
    // Strip any other markers from the before-text to get pure text
    const cleanBefore = before.replace(/\[\^?\d+\]/g, '')
    // Take last N chars as anchor context
    const anchor = cleanBefore.slice(-20)
    // Get char right after marker for additional context
    const afterIdx = match.index + match[0].length
    const afterChar = aiBody[afterIdx] || ''
    markers.push({ id: match[1], beforeText: anchor, afterChar })
    lastEnd = afterIdx
  }

  if (markers.length === 0) return original

  // For each marker, find best insertion point in original text
  // Work backwards to preserve positions
  let result = original
  const insertions: { pos: number; marker: string }[] = []

  for (const m of markers) {
    const anchor = m.beforeText.replace(/\s+/g, '')
    if (!anchor) continue

    // Scan original to find the anchor text
    let bestPos = -1
    let bestLen = 0
    // Try matching increasingly shorter suffixes of anchor
    for (let len = anchor.length; len >= Math.min(3, anchor.length); len--) {
      const suffix = anchor.slice(-len)
      // Search in original (normalized), map back to original position
      let oi = 0 // position in original
      let ni = 0 // position in normalized (no whitespace) view
      const origNorm = result.replace(/\s+/g, '')

      const idx = origNorm.indexOf(suffix, 0)
      if (idx === -1) continue

      // Map normalized position back to original position
      const targetNormEnd = idx + suffix.length
      let normCount = 0
      let origPos = 0
      for (origPos = 0; origPos < result.length && normCount < targetNormEnd; origPos++) {
        if (!/\s/.test(result[origPos])) normCount++
      }

      bestPos = origPos
      bestLen = len
      break
    }

    if (bestPos >= 0) {
      insertions.push({ pos: bestPos, marker: `[^${m.id}]` })
    }
  }

  // Sort by position descending so insertions don't shift earlier positions
  insertions.sort((a, b) => b.pos - a.pos)
  // Deduplicate: if multiple markers at same position, keep all (append)
  for (const ins of insertions) {
    result = result.slice(0, ins.pos) + ins.marker + result.slice(ins.pos)
  }

  return result
}

export default function App() {
  const {
    settings, setSettings,
    references, setReferences,
    templates, setTemplates, selectedTemplateId, setSelectedTemplateId,
  } = useStore()

  const [view, setView] = useState<'main' | 'settings'>('main')
  const [bodyText, setBodyText] = useState('')
  const [resultText, setResultText] = useState('')
  const [footnotes, setFootnotes] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  // Load settings, references, templates on mount
  useEffect(() => {
    ipcRenderer.invoke(IPC.GET_SETTINGS).then(setSettings)
    ipcRenderer.invoke(IPC.GET_REFERENCES).then(setReferences)
    ipcRenderer.invoke(IPC.GET_TEMPLATES).then(setTemplates)
  }, [setSettings, setReferences, setTemplates])

  // Check if API key is configured
  const hasApiKey = settings?.apiKey && settings.apiKey.length > 0

  // ===== Step 1: 导入正文 =====
  const handleImportBody = useCallback(async () => {
    const files = await importDocumentFiles()
    if (files.length === 0) return
    setBodyText(files[0].text)
    setResultText('')
    setFootnotes(new Map())
    setStatus(`已导入正文: ${files[0].title}`)
  }, [])

  // ===== Step 2: 上传参考文献 =====
  const handleUploadRefs = useCallback(async () => {
    const files = await importReferenceFiles()
    if (files.length === 0) return
    for (const file of files) {
      await ipcRenderer.invoke(IPC.ADD_REFERENCE, {
        title: file.title,
        author: '',
        filename: file.filename,
        content: file.text,
      })
    }
    const fresh = await ipcRenderer.invoke(IPC.GET_REFERENCES)
    setReferences(fresh)
    setStatus(`已添加 ${files.length} 篇参考文献，共 ${fresh.length} 篇`)
  }, [setReferences])

  // Delete a reference
  const handleDeleteRef = useCallback(async (id: number) => {
    await ipcRenderer.invoke(IPC.DELETE_REFERENCE, id)
    const fresh = await ipcRenderer.invoke(IPC.GET_REFERENCES)
    setReferences(fresh)
  }, [setReferences])

  // ===== Step 3: AI 补脚注 =====
  const handleAIFootnote = useCallback(async () => {
    if (!bodyText.trim()) {
      alert('请先导入或粘贴正文')
      return
    }
    if (!hasApiKey) {
      setView('settings')
      return
    }

    setLoading(true)
    setStatus('AI 正在分析正文并补充脚注...')

    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

    const result = await sendChatMessage(
      [{ role: 'user', content: `请为以下正文补充脚注。严格要求：\n1. 绝对不能修改原文的任何文字，包括标点符号、措辞、语序，一个字都不能改\n2. 只能在需要标注的位置插入脚注标记如[^1]\n3. 只使用我提供的参考文献，不要编造任何文献\n4. 在正文末尾列出脚注定义\n\n直接返回带脚注标记的完整正文。\n\n${bodyText}` }],
      {
        references: references.length > 0 ? references : undefined,
        templateFormat: selectedTemplate?.format,
      },
    )

    setLoading(false)

    if (result.error) {
      setStatus(`错误: ${result.error}`)
    } else if (result.content) {
      const parsed = parseFootnotes(result.content)
      // Convert body with markers back to display text
      const aiBody = parsed.body.replace(/\{\{FN:(\d+)\}\}/g, (_m, num) => `[^${num}]`)

      // === Auto-recovery: graft footnote markers onto original text ===
      // Strip footnote markers from AI output to get the "AI's version" of plain text
      const stripMarkers = (s: string) => s.replace(/\[\^?\d+\]/g, '')
      const aiPlain = stripMarkers(aiBody)
      const originalPlain = bodyText

      // Normalize for comparison (ignore whitespace differences)
      const norm = (s: string) => s.replace(/\s+/g, '').trim()

      let finalBody: string
      if (norm(aiPlain) === norm(originalPlain)) {
        // AI didn't modify the text — use AI output directly
        finalBody = aiBody
        setStatus(`完成！生成了 ${parsed.footnotes.size} 个脚注，原文内容未被修改 ✓`)
      } else {
        // AI modified the text — graft footnote markers back onto original
        // Strategy: walk through AI output char by char, extract marker positions
        // relative to surrounding text, then insert into original
        finalBody = graftFootnotesOntoOriginal(originalPlain, aiBody)
        setStatus(`完成！生成了 ${parsed.footnotes.size} 个脚注（已自动恢复原文，AI的修改已被丢弃）`)
      }

      setResultText(finalBody)
      setFootnotes(parsed.footnotes)
    }
  }, [bodyText, hasApiKey, references, templates, selectedTemplateId])

  // ===== Step 4: 导出 DOCX =====
  const handleExport = useCallback(async () => {
    if (!resultText && !bodyText) {
      alert('没有内容可导出')
      return
    }

    const text = resultText || bodyText
    // Build paragraphs
    const lines = text.split('\n').filter(l => l.trim())
    const paragraphs = lines.map(line => {
      // Replace [^N] with {{FN:N}}
      const processed = line.replace(/\[\^(\d+)\]/g, (_m, num) => `{{FN:${num}}}`)
      return { text: processed }
    })

    const fnObj: Record<number, string> = {}
    for (const [id, content] of footnotes) {
      fnObj[id] = content
    }

    const result = await ipcRenderer.invoke(IPC.EXPORT_DOCX, {
      paragraphs,
      footnotes: fnObj,
      font: settings?.exportFont || '宋体',
      fontSize: (settings?.exportFontSize || 12) * 2,
    })

    if (result.success) {
      setStatus(`导出成功: ${result.path}`)
    }
  }, [resultText, bodyText, footnotes, settings])

  // ===== Settings view =====
  if (view === 'settings') {
    return <Settings onBack={() => setView('main')} />
  }

  // ===== Main view =====
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-700">FN</span>
          <span className="font-semibold">FootNote Writer</span>
        </div>
        <button onClick={() => setView('settings')} className="p-2 rounded hover:bg-gray-100" title="设置">
          <SettingsIcon size={18} className="text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* API Key warning */}
          {!hasApiKey && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              请先点击右上角设置，配置 MiniMax API Key
            </div>
          )}

          {/* Step 1 + 2: Import row */}
          <div className="grid grid-cols-2 gap-4">
            {/* 导入正文 */}
            <button
              onClick={handleImportBody}
              className="flex flex-col items-center gap-3 p-6 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <FileUp size={32} className="text-blue-500" />
              <div className="text-center">
                <div className="font-semibold">1. 导入正文</div>
                <div className="text-xs text-gray-400 mt-1">PDF / Word / TXT</div>
              </div>
            </button>

            {/* 上传参考文献 */}
            <button
              onClick={handleUploadRefs}
              className="flex flex-col items-center gap-3 p-6 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors"
            >
              <BookOpen size={32} className="text-green-500" />
              <div className="text-center">
                <div className="font-semibold">2. 上传参考文献</div>
                <div className="text-xs text-gray-400 mt-1">PDF / Word（可多选）</div>
              </div>
            </button>
          </div>

          {/* Reference list */}
          {references.length > 0 && (
            <div className="bg-white rounded-lg border p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">已上传 {references.length} 篇参考文献</div>
              <div className="space-y-1">
                {references.map(ref => (
                  <div key={ref.id} className="flex items-center justify-between text-sm py-1 px-2 bg-gray-50 rounded">
                    <span className="truncate">{ref.title}</span>
                    <button onClick={() => handleDeleteRef(ref.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body text area */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-2 border-b text-sm font-semibold text-gray-500">正文</div>
            <textarea
              value={bodyText}
              onChange={(e) => { setBodyText(e.target.value); setResultText(''); setFootnotes(new Map()) }}
              placeholder="导入文件后正文会显示在这里，也可以直接粘贴..."
              className="w-full px-4 py-3 text-sm resize-none focus:outline-none"
              rows={10}
            />
          </div>

          {/* Step 3: AI button */}
          <button
            onClick={handleAIFootnote}
            disabled={loading || !bodyText.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
            {loading ? 'AI 补脚注中...' : '3. AI 自动补脚注'}
          </button>

          {/* Result */}
          {resultText && (
            <div className="bg-white rounded-lg border">
              <div className="px-4 py-2 border-b text-sm font-semibold text-gray-500">结果（已补脚注）</div>
              <div className="px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">{resultText}</div>
              {footnotes.size > 0 && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">脚注列表 ({footnotes.size})</div>
                  {Array.from(footnotes.entries()).map(([id, content]) => {
                    // Render *text* as italic, strip remaining markdown
                    const parts = content.split(/\*(.*?)\*/g)
                    return (
                      <div key={id} className="text-sm mb-1">
                        <span className="text-blue-600 font-semibold">[{id}]</span>{' '}
                        <span className="text-gray-700">
                          {parts.map((part, i) => i % 2 === 1 ? <em key={i}>{part}</em> : part)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Export */}
          {(resultText || bodyText) && (
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Download size={24} />
              4. 导出 Word（原生脚注）
            </button>
          )}

          {/* Status bar */}
          {status && (
            <div className="text-center text-sm text-gray-500 py-2">{status}</div>
          )}
        </div>
      </div>
    </div>
  )
}
