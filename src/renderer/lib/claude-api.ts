import type { ChatMessage, Reference } from '../../shared/types'
import { IPC } from '../../shared/types'

const { ipcRenderer } = window.require('electron')

export async function sendChatMessage(
  messages: ChatMessage[],
  options?: {
    systemPrompt?: string
    references?: Reference[]
    templateFormat?: string
    templateGroup?: string
  }
): Promise<{ content?: string; error?: string }> {
  return ipcRenderer.invoke(IPC.CHAT_SEND, {
    messages,
    systemPrompt: options?.systemPrompt,
    references: options?.references,
    templateFormat: options?.templateFormat,
    templateGroup: options?.templateGroup,
  })
}
