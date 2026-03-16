import React, { useEffect, useCallback } from 'react'
import { useStore } from '../lib/store'
import { importReferenceFiles } from '../lib/file-import'
import { IPC, Reference } from '../../shared/types'
import { Plus, Trash2, BookOpen } from 'lucide-react'

const { ipcRenderer } = window.require('electron')

export default function ReferencePanel() {
  const { references, setReferences } = useStore()

  // Load references on mount
  useEffect(() => {
    ipcRenderer.invoke(IPC.GET_REFERENCES).then((refs: Reference[]) => {
      setReferences(refs)
    })
  }, [setReferences])

  const handleUpload = useCallback(async () => {
    const files = await importReferenceFiles()
    for (const file of files) {
      const ref = await ipcRenderer.invoke(IPC.ADD_REFERENCE, {
        title: file.title,
        author: '',
        filename: file.filename,
        content: file.text,
      })
      setReferences([ref, ...references])
    }
    // Reload from DB to get fresh data
    const fresh = await ipcRenderer.invoke(IPC.GET_REFERENCES)
    setReferences(fresh)
  }, [references, setReferences])

  const handleDelete = useCallback(async (id: number) => {
    await ipcRenderer.invoke(IPC.DELETE_REFERENCE, id)
    setReferences(references.filter(r => r.id !== id))
  }, [references, setReferences])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <span className="text-sm font-semibold">参考文献库</span>
        <button
          onClick={handleUpload}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus size={12} /> 上传文献
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {references.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <BookOpen size={24} className="mx-auto mb-2 text-gray-300" />
            <p>暂无参考文献</p>
            <p className="text-xs mt-1">上传PDF/Word文件作为参考</p>
          </div>
        )}
        {references.map((ref) => (
          <div key={ref.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded border">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{ref.title}</div>
              <div className="text-xs text-gray-400 truncate">{ref.filename}</div>
              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{ref.content.slice(0, 100)}...</div>
            </div>
            <button
              onClick={() => handleDelete(ref.id)}
              className="p-1 text-gray-400 hover:text-red-500 shrink-0"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
