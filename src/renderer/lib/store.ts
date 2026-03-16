import { create } from 'zustand'
import type { ChatMessage, Reference, FootnoteTemplate, AppSettings } from '../../shared/types'

interface AppState {
  // Active tab/view
  activeView: 'editor' | 'settings'
  setActiveView: (view: 'editor' | 'settings') => void

  // Right panel
  rightPanel: 'chat' | 'references' | 'formats'
  setRightPanel: (panel: 'chat' | 'references' | 'formats') => void

  // Editor content (serialized HTML from Tiptap)
  editorContent: string
  setEditorContent: (content: string) => void

  // Footnotes tracked in editor
  footnotes: Map<number, string>
  setFootnotes: (fn: Map<number, string>) => void
  nextFootnoteId: number
  setNextFootnoteId: (id: number) => void

  // Chat
  chatMessages: ChatMessage[]
  addChatMessage: (msg: ChatMessage) => void
  clearChat: () => void
  chatLoading: boolean
  setChatLoading: (loading: boolean) => void

  // References
  references: Reference[]
  setReferences: (refs: Reference[]) => void

  // Templates
  templates: FootnoteTemplate[]
  setTemplates: (tmpls: FootnoteTemplate[]) => void
  selectedTemplateId: number | null
  setSelectedTemplateId: (id: number | null) => void

  // Settings
  settings: AppSettings | null
  setSettings: (s: AppSettings) => void
}

export const useStore = create<AppState>((set) => ({
  activeView: 'editor',
  setActiveView: (view) => set({ activeView: view }),

  rightPanel: 'chat',
  setRightPanel: (panel) => set({ rightPanel: panel }),

  editorContent: '',
  setEditorContent: (content) => set({ editorContent: content }),

  footnotes: new Map(),
  setFootnotes: (fn) => set({ footnotes: fn }),
  nextFootnoteId: 1,
  setNextFootnoteId: (id) => set({ nextFootnoteId: id }),

  chatMessages: [],
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),
  chatLoading: false,
  setChatLoading: (loading) => set({ chatLoading: loading }),

  references: [],
  setReferences: (refs) => set({ references: refs }),

  templates: [],
  setTemplates: (tmpls) => set({ templates: tmpls }),
  selectedTemplateId: null,
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),

  settings: null,
  setSettings: (s) => set({ settings: s }),
}))
