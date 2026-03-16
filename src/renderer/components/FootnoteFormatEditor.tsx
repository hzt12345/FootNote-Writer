import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '../lib/store'
import { IPC, FootnoteTemplate } from '../../shared/types'
import { Plus, Trash2, Check, FileText } from 'lucide-react'

const { ipcRenderer } = window.require('electron')

export default function FootnoteFormatEditor() {
  const { templates, setTemplates, selectedTemplateId, setSelectedTemplateId } = useStore()
  const [newName, setNewName] = useState('')
  const [newFormat, setNewFormat] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    ipcRenderer.invoke(IPC.GET_TEMPLATES).then((tmpls: FootnoteTemplate[]) => {
      setTemplates(tmpls)
    })
  }, [setTemplates])

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newFormat.trim()) return
    await ipcRenderer.invoke(IPC.SAVE_TEMPLATE, { name: newName, format: newFormat })
    const fresh = await ipcRenderer.invoke(IPC.GET_TEMPLATES)
    setTemplates(fresh)
    setNewName('')
    setNewFormat('')
    setShowAdd(false)
  }, [newName, newFormat, setTemplates])

  const handleDelete = useCallback(async (id: number) => {
    await ipcRenderer.invoke(IPC.DELETE_TEMPLATE, id)
    const fresh = await ipcRenderer.invoke(IPC.GET_TEMPLATES)
    setTemplates(fresh)
    if (selectedTemplateId === id) setSelectedTemplateId(null)
  }, [setTemplates, selectedTemplateId, setSelectedTemplateId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <span className="text-sm font-semibold">脚注格式</span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus size={12} /> 新建模板
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {/* Add new template form */}
        {showAdd && (
          <div className="p-3 bg-blue-50 rounded border border-blue-200 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="模板名称"
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <textarea
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value)}
              placeholder="格式模板，如：{作者}：《{书名}》，{出版社}{年份}年版。"
              className="w-full border rounded px-2 py-1 text-sm"
              rows={2}
            />
            <button
              onClick={handleAdd}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              添加
            </button>
          </div>
        )}

        {templates.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <FileText size={24} className="mx-auto mb-2 text-gray-300" />
            <p>加载中...</p>
          </div>
        )}

        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
              selectedTemplateId === tmpl.id
                ? 'bg-blue-50 border-blue-300'
                : 'bg-gray-50 hover:bg-gray-100'
            }`}
            onClick={() => setSelectedTemplateId(selectedTemplateId === tmpl.id ? null : tmpl.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">{tmpl.name}</span>
                {tmpl.isPreset && (
                  <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">预设</span>
                )}
                {selectedTemplateId === tmpl.id && (
                  <Check size={14} className="text-blue-600" />
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 break-all">{tmpl.format}</div>
            </div>
            {!tmpl.isPreset && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(tmpl.id) }}
                className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
