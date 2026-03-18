import { describe, it, expect } from 'vitest'
import { IPC } from '../src/shared/types'
import type { AppSettings, FootnoteTemplate, LLMProvider, ExportMode } from '../src/shared/types'

describe('IPC constants', () => {
  it('should have all required channel names', () => {
    expect(IPC.EXPORT_DOCX).toBe('export-docx')
    expect(IPC.READ_FILE).toBe('read-file')
    expect(IPC.CHAT_SEND).toBe('chat-send')
    expect(IPC.GET_SETTINGS).toBe('get-settings')
    expect(IPC.SAVE_SETTINGS).toBe('save-settings')
    expect(IPC.GET_TEMPLATES).toBe('get-templates')
    expect(IPC.SAVE_TEMPLATE).toBe('save-template')
    expect(IPC.DELETE_TEMPLATE).toBe('delete-template')
    expect(IPC.GET_REFERENCES).toBe('get-references')
    expect(IPC.ADD_REFERENCE).toBe('add-reference')
    expect(IPC.DELETE_REFERENCE).toBe('delete-reference')
    expect(IPC.OPEN_FILE_DIALOG).toBe('open-file-dialog')
  })
})

describe('Type structure verification', () => {
  it('AppSettings should accept providerId', () => {
    const settings: AppSettings = {
      providerId: 'deepseek',
      apiKey: 'test',
      apiBase: 'https://api.deepseek.com',
      groupId: '',
      model: 'deepseek-chat',
      systemPrompt: '',
      defaultTemplateId: null,
      exportFont: '宋体',
      exportFontSize: 12,
      maxRefChars: 30000,
    }
    expect(settings.providerId).toBe('deepseek')
  })

  it('FootnoteTemplate should accept group field', () => {
    const template: FootnoteTemplate = {
      id: 1,
      name: 'Test',
      format: '{Author}',
      isPreset: true,
      group: 'APA 7th',
    }
    expect(template.group).toBe('APA 7th')
  })

  it('FootnoteTemplate group can be null', () => {
    const template: FootnoteTemplate = {
      id: 1,
      name: 'Custom',
      format: '{test}',
      isPreset: false,
      group: null,
    }
    expect(template.group).toBeNull()
  })

  it('LLMProvider type should have correct shape', () => {
    const provider: LLMProvider = {
      id: 'test',
      name: 'Test Provider',
      apiBase: 'https://api.test.com',
      apiPath: '/v1/chat/completions',
      models: [{ id: 'model-1', name: 'Model 1' }],
    }
    expect(provider.models).toHaveLength(1)
    expect(provider.needsGroupId).toBeUndefined()
  })

  it('ExportMode should accept valid values', () => {
    const modes: ExportMode[] = ['footnote', 'endnote', 'bibliography']
    expect(modes).toHaveLength(3)
  })
})
