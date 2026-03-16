import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../lib/store'
import { sendChatMessage } from '../lib/claude-api'
import { Send, Trash2, ArrowDownToLine, Loader2 } from 'lucide-react'

export default function ChatPanel() {
  const {
    chatMessages, addChatMessage, clearChat,
    chatLoading, setChatLoading,
    references, templates, selectedTemplateId,
  } = useStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || chatLoading) return

    const userMsg = { role: 'user' as const, content: text }
    addChatMessage(userMsg)
    setInput('')
    setChatLoading(true)

    const allMessages = [...chatMessages, userMsg]

    // Get selected template format
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    const templateFormat = selectedTemplate?.format

    const result = await sendChatMessage(allMessages, {
      references: references.length > 0 ? references : undefined,
      templateFormat,
    })

    setChatLoading(false)

    if (result.error) {
      addChatMessage({ role: 'assistant', content: `**错误**: ${result.error}` })
    } else if (result.content) {
      addChatMessage({ role: 'assistant', content: result.content })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Apply the last assistant message to editor
  const applyToEditor = (content: string) => {
    window.dispatchEvent(new CustomEvent('apply-to-editor', { detail: content }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <span className="text-sm font-semibold">AI 对话</span>
        <button
          onClick={clearChat}
          className="p-1 rounded hover:bg-gray-100 text-gray-400"
          title="清空对话"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>发送消息开始对话</p>
            <p className="mt-1 text-xs">例如："帮我给这段话补充脚注..."</p>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm chat-message ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              {msg.role === 'assistant' && (
                <button
                  onClick={() => applyToEditor(msg.content)}
                  className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <ArrowDownToLine size={12} /> 应用到编辑器
                </button>
              )}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> 思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 bg-white">
        {references.length > 0 && (
          <div className="text-xs text-gray-400 mb-1">
            已加载 {references.length} 篇参考文献
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={chatLoading || !input.trim()}
            className="self-end p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
