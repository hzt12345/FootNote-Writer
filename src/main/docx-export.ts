import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  FootnoteReferenceRun,
  AlignmentType,
  HeadingLevel,
} from 'docx'
import fs from 'fs'

interface ExportOptions {
  /** Array of paragraph objects with text and optional footnote markers */
  paragraphs: ExportParagraph[]
  /** Footnote map: id -> content */
  footnotes: Record<number, string>
  /** Font name */
  font?: string
  /** Font size in half-points (24 = 12pt) */
  fontSize?: number
}

interface ExportParagraph {
  text: string
  heading?: 'h1' | 'h2' | 'h3'
  bold?: boolean
  italic?: boolean
}

/**
 * Parse editor content into paragraphs with footnote references.
 * Footnotes are marked as {{FN:id}} in the text.
 */
function buildParagraph(
  para: ExportParagraph,
  font: string,
  fontSize: number,
): Paragraph {
  const children: (TextRun | FootnoteReferenceRun)[] = []
  const text = para.text
  // Split on {{FN:number}} markers
  const regex = /\{\{FN:(\d+)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before the marker
    if (match.index > lastIndex) {
      children.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          font,
          size: fontSize,
          bold: para.bold,
          italics: para.italic,
        }),
      )
    }
    // Footnote reference
    const fnId = parseInt(match[1], 10)
    children.push(new FootnoteReferenceRun(fnId))
    lastIndex = regex.lastIndex
  }

  // Remaining text
  if (lastIndex < text.length) {
    children.push(
      new TextRun({
        text: text.slice(lastIndex),
        font,
        size: fontSize,
        bold: para.bold,
        italics: para.italic,
      }),
    )
  }

  // If no children at all, add empty text
  if (children.length === 0) {
    children.push(new TextRun({ text: '', font, size: fontSize }))
  }

  const headingMap: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
  }

  return new Paragraph({
    children,
    heading: para.heading ? headingMap[para.heading] : undefined,
    alignment: AlignmentType.JUSTIFIED,
  })
}

export async function exportToDocx(options: ExportOptions, savePath: string): Promise<void> {
  const font = options.font || '宋体'
  const fontSize = options.fontSize || 24 // 12pt = 24 half-points

  // Build footnotes object for Document constructor
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  for (const [idStr, content] of Object.entries(options.footnotes)) {
    const id = parseInt(idStr, 10)
    // Parse *text* into italic runs using regex to find *...* spans
    const runs: TextRun[] = []
    const italicRegex = /\*([^*]+)\*/g
    let lastIdx = 0
    let m: RegExpExecArray | null
    while ((m = italicRegex.exec(content)) !== null) {
      if (m.index > lastIdx) {
        runs.push(new TextRun({ text: content.slice(lastIdx, m.index), font, size: fontSize - 4 }))
      }
      runs.push(new TextRun({ text: m[1], font, size: fontSize - 4, italics: true }))
      lastIdx = italicRegex.lastIndex
    }
    if (lastIdx < content.length) {
      runs.push(new TextRun({ text: content.slice(lastIdx), font, size: fontSize - 4 }))
    }
    if (runs.length === 0) {
      runs.push(new TextRun({ text: content, font, size: fontSize - 4 }))
    }
    footnotes[id] = {
      children: [new Paragraph({ children: runs })],
    }
  }

  const doc = new Document({
    footnotes,
    sections: [
      {
        children: options.paragraphs.map((p) => buildParagraph(p, font, fontSize)),
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(savePath, buffer)
}
