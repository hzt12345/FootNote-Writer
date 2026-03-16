import fs from 'fs'
import path from 'path'

export async function extractTextFromFile(filePath: string): Promise<{ text: string; title: string }> {
  const ext = path.extname(filePath).toLowerCase()
  const basename = path.basename(filePath, ext)

  if (ext === '.pdf') {
    return { text: await extractPDF(filePath), title: basename }
  } else if (ext === '.docx') {
    return { text: await extractWord(filePath), title: basename }
  } else if (ext === '.txt' || ext === '.md') {
    return { text: fs.readFileSync(filePath, 'utf-8'), title: basename }
  }

  throw new Error(`不支持的文件格式: ${ext}`)
}

async function extractPDF(filePath: string): Promise<string> {
  // pdf-parse requires dynamic import in CommonJS
  const pdfParse = require('pdf-parse')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

async function extractWord(filePath: string): Promise<string> {
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}
