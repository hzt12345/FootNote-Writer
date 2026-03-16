import React, { useCallback, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import { useStore } from '../lib/store'
import { parseFootnotes } from '../lib/footnote-parser'
import { importDocumentFiles } from '../lib/file-import'
import { sendChatMessage } from '../lib/claude-api'
import { FileUp, Download, Bold, Italic, Heading1, Heading2, Type, Sparkles, Loader2 } from 'lucide-react'

const { ipcRenderer } = window.require('electron')

// Custom Tiptap node for footnote markers
const FootnoteMarker = TiptapNode.create({
  name: 'footnoteMarker',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      footnoteId: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span.footnote-marker' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'footnote-marker',
        'data-footnote-id': HTMLAttributes.footnoteId,
      }),
      `[${HTMLAttributes.footnoteId}]`,
    ]
  },
})

/** Extract plain text from editor HTML, preserving existing footnote markers */
function editorHtmlToPlainText(html: string, footnotes: Map<number, string>): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const blocks = doc.body.querySelectorAll('p, h1, h2, h3')
  const lines: string[] = []
  for (const block of blocks) {
    let text = ''
    for (const node of block.childNodes) {
      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement && node.classList.contains('footnote-marker')) {
        const fnId = node.getAttribute('data-footnote-id')
        text += `[^${fnId}]`
      } else {
        text += node.textContent || ''
      }
    }
    lines.push(text)
  }
  let result = lines.join('\n')
  // Append existing footnote definitions
  if (footnotes.size > 0) {
    result += '\n'
    for (const [id, content] of footnotes) {
      result += `\n[^${id}]: ${content}`
    }
  }
  return result
}

export default function Editor() {
  const {
    footnotes, setFootnotes,
    nextFootnoteId, setNextFootnoteId,
    setEditorContent,
    references, templates, selectedTemplateId,
  } = useStore()

  const [aiLoading, setAiLoading] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '在这里输入或粘贴正文...' }),
      FootnoteMarker,
    ],
    content: '<p></p>',
    onUpdate({ editor }) {
      setEditorContent(editor.getHTML())
    },
  })

  // Helper: apply text with footnotes to editor
  const applyTextToEditor = useCallback((text: string) => {
    if (!editor) return
    const parsed = parseFootnotes(text)
    let html = ''
    const bodyLines = parsed.body.split('\n')
    for (const line of bodyLines) {
      if (line.trim()) {
        let htmlLine = line.replace(/\{\{FN:(\d+)\}\}/g, (_m, num) => {
          return `<span class="footnote-marker" data-footnote-id="${num}">[${num}]</span>`
        })
        html += `<p>${htmlLine}</p>`
      }
    }
    editor.commands.setContent(html)

    const newFootnotes = new Map(footnotes)
    let maxId = nextFootnoteId - 1
    for (const [id, content] of parsed.footnotes) {
      newFootnotes.set(id, content)
      if (id > maxId) maxId = id
    }
    setFootnotes(newFootnotes)
    setNextFootnoteId(maxId + 1)
  }, [editor, footnotes, nextFootnoteId, setFootnotes, setNextFootnoteId])

  // ===== AI 自动补脚注 =====
  const handleAIFootnote = useCallback(async () => {
    if (!editor || aiLoading) return

    // Get full editor text
    const html = editor.getHTML()
    const plainText = editorHtmlToPlainText(html, footnotes)

    if (!plainText.trim()) {
      alert('请先输入或导入正文')
      return
    }

    setAiLoading(true)

    // Get selected template format
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    const templateFormat = selectedTemplate?.format

    const result = await sendChatMessage(
      [{ role: 'user', content: `请为以下正文补充脚注。直接返回带脚注标记的完整正文，不要解释。\n\n${plainText}` }],
      {
        references: references.length > 0 ? references : undefined,
        templateFormat,
      },
    )

    setAiLoading(false)

    if (result.error) {
      alert(`AI 错误: ${result.error}`)
    } else if (result.content) {
      applyTextToEditor(result.content)
    }
  }, [editor, aiLoading, footnotes, references, templates, selectedTemplateId, applyTextToEditor])

  // Import document file
  const handleImport = useCallback(async () => {
    const files = await importDocumentFiles()
    if (files.length === 0) return
    const { text } = files[0]

    const parsed = parseFootnotes(text)
    if (parsed.footnotes.size > 0) {
      let html = ''
      const bodyLines = parsed.body.split('\n')
      for (const line of bodyLines) {
        if (line.trim()) {
          let htmlLine = line.replace(/\{\{FN:(\d+)\}\}/g, (_m, num) => {
            return `<span class="footnote-marker" data-footnote-id="${num}">[${num}]</span>`
          })
          html += `<p>${htmlLine}</p>`
        }
      }
      editor?.commands.setContent(html)

      const newFootnotes = new Map(footnotes)
      let maxId = nextFootnoteId - 1
      for (const [id, content] of parsed.footnotes) {
        newFootnotes.set(id, content)
        if (id > maxId) maxId = id
      }
      setFootnotes(newFootnotes)
      setNextFootnoteId(maxId + 1)
    } else {
      const html = text.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('')
      editor?.commands.setContent(html)
    }
  }, [editor, footnotes, nextFootnoteId, setFootnotes, setNextFootnoteId])

  // Apply AI output from chat panel
  useEffect(() => {
    const handler = ((e: CustomEvent) => applyTextToEditor(e.detail)) as EventListener
    window.addEventListener('apply-to-editor' as any, handler)
    return () => { window.removeEventListener('apply-to-editor' as any, handler) }
  }, [applyTextToEditor])

  // Export DOCX
  const handleExport = useCallback(async () => {
    if (!editor) return

    const html = editor.getHTML()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const blocks = doc.body.querySelectorAll('p, h1, h2, h3')

    const paragraphs: { text: string; heading?: string }[] = []
    for (const block of blocks) {
      const heading = block.tagName.toLowerCase()
      let text = ''
      for (const node of block.childNodes) {
        if (node.nodeType === globalThis.Node.TEXT_NODE) {
          text += node.textContent || ''
        } else if (node instanceof HTMLElement && node.classList.contains('footnote-marker')) {
          const fnId = node.getAttribute('data-footnote-id')
          text += `{{FN:${fnId}}}`
        } else {
          text += node.textContent || ''
        }
      }
      paragraphs.push({
        text,
        heading: heading !== 'p' ? heading : undefined,
      })
    }

    const fnObj: Record<number, string> = {}
    for (const [id, content] of footnotes) {
      fnObj[id] = content
    }

    const result = await ipcRenderer.invoke('export-docx', {
      paragraphs,
      footnotes: fnObj,
    })

    if (result.success) {
      alert(`导出成功: ${result.path}`)
    }
  }, [editor, footnotes])

  if (!editor) return null

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-white">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded hover:bg-gray-100 ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
          title="粗体"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded hover:bg-gray-100 ${editor.isActive('italic') ? 'bg-gray-200' : ''}`}
          title="斜体"
        >
          <Italic size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded hover:bg-gray-100 ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : ''}`}
          title="标题1"
        >
          <Heading1 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded hover:bg-gray-100 ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : ''}`}
          title="标题2"
        >
          <Heading2 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={`p-1.5 rounded hover:bg-gray-100 ${editor.isActive('paragraph') ? 'bg-gray-200' : ''}`}
          title="正文"
        >
          <Type size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* AI 自动补脚注 */}
        <button
          onClick={handleAIFootnote}
          disabled={aiLoading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          title="AI自动补脚注（对全文生效）"
        >
          {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {aiLoading ? 'AI补脚注中...' : 'AI补脚注'}
        </button>

        <div className="flex-1" />
        <button
          onClick={handleImport}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded hover:bg-gray-100"
          title="导入文件"
        >
          <FileUp size={14} /> 导入
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          title="导出DOCX"
        >
          <Download size={14} /> 导出DOCX
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="max-w-none" />
      </div>

      {/* Footnote list */}
      {footnotes.size > 0 && (
        <div className="border-t bg-gray-50 px-4 py-3 max-h-48 overflow-auto">
          <div className="text-xs font-semibold text-gray-500 mb-2">脚注列表</div>
          {Array.from(footnotes.entries()).map(([id, content]) => (
            <div key={id} className="text-sm mb-1">
              <span className="text-blue-600 font-semibold">[{id}]</span>{' '}
              <span className="text-gray-700">{content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
