import React, { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { IPC, AppSettings } from '../../shared/types'
import { Save, ArrowLeft, Eye, EyeOff } from 'lucide-react'

const { ipcRenderer } = window.require('electron')

export default function Settings({ onBack }: { onBack?: () => void }) {
  const { settings, setSettings, setActiveView } = useStore()
  const [local, setLocal] = useState<AppSettings>({
    apiKey: '',
    apiBase: 'https://api.minimaxi.com',
    groupId: '',
    model: 'MiniMax-M2.5',
    systemPrompt: '',
    defaultTemplateId: null,
    exportFont: '宋体',
    exportFontSize: 12,
    maxRefChars: 30000,
  })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ipcRenderer.invoke(IPC.GET_SETTINGS).then((s: AppSettings) => {
      setSettings(s)
      setLocal(s)
    })
  }, [setSettings])

  const handleSave = async () => {
    await ipcRenderer.invoke(IPC.SAVE_SETTINGS, local)
    setSettings(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (key: keyof AppSettings, value: any) => {
    setLocal({ ...local, [key]: value })
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onBack ? onBack() : setActiveView('editor')}
          className="p-1.5 rounded hover:bg-gray-100"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold">设置</h1>
      </div>

      <div className="space-y-6">
        {/* API Settings */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">MiniMax API</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={local.apiKey}
                onChange={(e) => update('apiKey', e.target.value)}
                placeholder="eyJh..."
                className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="p-2 border rounded hover:bg-gray-50"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              在 <a href="https://platform.minimax.io" className="text-blue-500 underline">platform.minimax.io</a> 获取 API Key
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Group ID</label>
            <input
              value={local.groupId}
              onChange={(e) => update('groupId', e.target.value)}
              placeholder="在控制台基本信息页获取"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">API 地址</label>
            <input
              value={local.apiBase}
              onChange={(e) => update('apiBase', e.target.value)}
              placeholder="https://api.minimaxi.com"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              默认 https://api.minimaxi.com，也支持其他兼容 OpenAI 格式的 API
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">模型</label>
            <select
              value={local.model}
              onChange={(e) => update('model', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="MiniMax-M2.5">MiniMax-M2.5 (推荐)</option>
              <option value="MiniMax-M2.5-highspeed">MiniMax-M2.5-highspeed (快速)</option>
              <option value="MiniMax-M2.1">MiniMax-M2.1</option>
              <option value="MiniMax-M2.1-highspeed">MiniMax-M2.1-highspeed</option>
              <option value="MiniMax-M2">MiniMax-M2</option>
            </select>
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">系统提示词</h2>
          <textarea
            value={local.systemPrompt}
            onChange={(e) => update('systemPrompt', e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={8}
          />
        </div>

        {/* Export settings */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">导出设置</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">字体</label>
              <input
                value={local.exportFont}
                onChange={(e) => update('exportFont', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">字号 (pt)</label>
              <input
                type="number"
                value={local.exportFontSize}
                onChange={(e) => update('exportFontSize', parseInt(e.target.value) || 12)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Context settings */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">参考文献上下文</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">最大参考文献字符数</label>
            <input
              type="number"
              value={local.maxRefChars}
              onChange={(e) => update('maxRefChars', parseInt(e.target.value) || 30000)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              发送给AI的参考文献总字符上限，默认30000。文献太大会被截断。
            </p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Save size={16} />
          {saved ? '已保存' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
