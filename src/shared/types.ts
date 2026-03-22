// ---- Footnote types ----
export interface Footnote {
  id: number
  content: string
}

export interface ParsedDocument {
  /** Body text with footnote markers replaced by {{FN:id}} placeholders */
  body: string
  /** Parsed footnotes keyed by id */
  footnotes: Map<number, string>
}

// ---- Reference library ----
export interface Reference {
  id: number
  title: string
  author: string
  filename: string
  content: string
  createdAt: string
}

// ---- Footnote format templates ----
export interface FootnoteTemplate {
  id: number
  name: string
  /** Template string with {placeholders} */
  format: string
  /** Whether this is a built-in preset */
  isPreset: boolean
  /** Group name for categorizing templates (e.g. "法学引注手册", "GB/T 7714") */
  group: string | null
}

// ---- LLM Providers ----
export interface LLMProvider {
  id: string
  name: string
  apiBase: string
  apiPath: string
  models: { id: string; name: string }[]
  needsGroupId?: boolean
  /** Max output tokens supported by this provider (default 4096) */
  maxTokens?: number
  /** Whether to omit temperature from request (some models only accept temperature=1) */
  noTemperature?: boolean
}

// ---- Export modes ----
export type ExportMode = 'footnote' | 'endnote' | 'bibliography'

// ---- Chat ----
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---- Settings ----
export interface AppSettings {
  providerId: string
  apiKey: string
  apiBase: string
  groupId: string
  model: string
  systemPrompt: string
  defaultTemplateId: number | null
  exportFont: string
  exportFontSize: number
  /** Max total reference chars sent to AI (default 30000) */
  maxRefChars: number
}

// ---- IPC channel names ----
export const IPC = {
  // DOCX export
  EXPORT_DOCX: 'export-docx',
  // File reading
  READ_FILE: 'read-file',
  // References
  ADD_REFERENCE: 'add-reference',
  GET_REFERENCES: 'get-references',
  DELETE_REFERENCE: 'delete-reference',
  // Templates
  GET_TEMPLATES: 'get-templates',
  SAVE_TEMPLATE: 'save-template',
  DELETE_TEMPLATE: 'delete-template',
  // Settings
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  // MiniMax API
  CHAT_SEND: 'chat-send',
  // File dialog
  OPEN_FILE_DIALOG: 'open-file-dialog',
  SAVE_FILE_DIALOG: 'save-file-dialog',
  // Diagnostics
  LOG_EXPORT: 'log-export',
} as const
