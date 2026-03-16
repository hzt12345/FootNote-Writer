import { IPC } from '../../shared/types'

const { ipcRenderer } = window.require('electron')

export async function openFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string[]> {
  const result = await ipcRenderer.invoke(IPC.OPEN_FILE_DIALOG, { filters })
  if (result.canceled) return []
  return result.filePaths
}

export async function readFileContent(filePath: string): Promise<{ text: string; title: string }> {
  return ipcRenderer.invoke(IPC.READ_FILE, filePath)
}

export async function importDocumentFiles(): Promise<{ text: string; title: string }[]> {
  const paths = await openFileDialog([
    { name: '文档', extensions: ['pdf', 'docx', 'txt', 'md'] },
  ])
  const results: { text: string; title: string }[] = []
  for (const p of paths) {
    const result = await readFileContent(p)
    results.push(result)
  }
  return results
}

export async function importReferenceFiles(): Promise<{ text: string; title: string; filename: string }[]> {
  const paths = await openFileDialog([
    { name: '参考文献', extensions: ['pdf', 'docx', 'txt'] },
  ])
  const results: { text: string; title: string; filename: string }[] = []
  for (const p of paths) {
    const result = await readFileContent(p)
    const filename = p.split('/').pop() || p.split('\\').pop() || p
    results.push({ ...result, filename })
  }
  return results
}
