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
import type { ExportMode } from '../shared/types'

interface ExportOptions {
  /** Array of paragraph objects with text and optional footnote markers */
  paragraphs: ExportParagraph[]
  /** Footnote map: id -> content */
  footnotes: Record<number, string>
  /** Font name */
  font?: string
  /** Font size in half-points (24 = 12pt) */
  fontSize?: number
  /** Export mode: footnote (native Word), endnote (trailing list), bibliography (reference list) */
  mode?: ExportMode
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

/**
 * Convert English quotes to Chinese quotes in Chinese text context.
 */
function fixChineseQuotes(text: string): string {
  if (!/[\u4e00-\u9fff]/.test(text)) return text
  let count = 0
  let result = text.replace(/"/g, () => {
    count++
    return count % 2 === 1 ? '\u201c' : '\u201d'
  })
  let sCount = 0
  result = result.replace(/'/g, () => {
    sCount++
    return sCount % 2 === 1 ? '\u2018' : '\u2019'
  })
  return result
}

const SUPERSCRIPT_DIGITS = ['\u2070','\u00B9','\u00B2','\u00B3','\u2074','\u2075','\u2076','\u2077','\u2078','\u2079']
function toSuperscript(n: number): string {
  return String(n).split('').map(d => SUPERSCRIPT_DIGITS[parseInt(d)]).join('')
}

/**
 * Build a paragraph for endnote/bibliography modes.
 * Replaces {{FN:N}} with superscript text instead of FootnoteReferenceRun.
 */
function buildParagraphWithSuperscript(
  para: ExportParagraph,
  font: string,
  fontSize: number,
  mode: 'endnote' | 'bibliography',
): Paragraph {
  const children: TextRun[] = []
  const text = para.text
  const regex = /\{\{FN:(\d+)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      children.push(new TextRun({
        text: text.slice(lastIndex, match.index),
        font, size: fontSize,
        bold: para.bold, italics: para.italic,
      }))
    }
    const fnId = parseInt(match[1], 10)
    const marker = mode === 'endnote' ? toSuperscript(fnId) : `[${fnId}]`
    children.push(new TextRun({
      text: marker,
      font, size: fontSize,
      superScript: true,
    }))
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    children.push(new TextRun({
      text: text.slice(lastIndex),
      font, size: fontSize,
      bold: para.bold, italics: para.italic,
    }))
  }

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
  const mode = options.mode || 'footnote'

  // Fix Chinese quotes in paragraphs before export
  for (const p of options.paragraphs) {
    p.text = fixChineseQuotes(p.text)
  }

  // === Diagnostic logging ===
  console.log('[DOCX Export] Mode:', mode)
  console.log('[DOCX Export] Paragraphs:', options.paragraphs.length)
  console.log('[DOCX Export] Footnotes:', Object.keys(options.footnotes).length, 'IDs:', Object.keys(options.footnotes).join(','))
  for (const p of options.paragraphs) {
    const markers = p.text.match(/\{\{FN:\d+\}\}/g)
    if (markers) {
      console.log('[DOCX Export] Paragraph has markers:', markers.join(', '), '| Text preview:', p.text.slice(0, 80))
    }
  }

  if (mode === 'footnote') {
    // ---- Native Word footnote mode (original behavior) ----
    const footnotes: Record<number, { children: Paragraph[] }> = {}
    for (const [idStr, rawContent] of Object.entries(options.footnotes)) {
      const id = parseInt(idStr, 10)
      const content = fixChineseQuotes(rawContent)
      // Parse *text* into italic runs
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

    // Check for unmatched markers
    const definedIds = new Set(Object.keys(footnotes).map(Number))
    for (const p of options.paragraphs) {
      const markers = p.text.match(/\{\{FN:(\d+)\}\}/g) || []
      for (const mk of markers) {
        const id = parseInt(mk.replace(/\{\{FN:|}\}/g, ''), 10)
        if (!definedIds.has(id)) {
          console.warn('[DOCX Export] WARNING: Marker FN:', id, 'has no footnote definition!')
        }
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
  } else {
    // ---- Endnote / Bibliography mode (trailing list) ----
    const sectionChildren: Paragraph[] = options.paragraphs.map((p) =>
      buildParagraphWithSuperscript(p, font, fontSize, mode),
    )

    // Add heading
    const headingText = mode === 'endnote' ? '注释' : '参考文献'
    sectionChildren.push(new Paragraph({
      children: [new TextRun({ text: headingText, font, size: fontSize, bold: true })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400 },
    }))

    // Add numbered items
    const sortedIds = Object.keys(options.footnotes).map(Number).sort((a, b) => a - b)
    for (const id of sortedIds) {
      const content = fixChineseQuotes(options.footnotes[id])
      const prefix = mode === 'endnote' ? `${id}. ` : `[${id}] `
      // Parse *text* for italics
      const runs: TextRun[] = []
      runs.push(new TextRun({ text: prefix, font, size: fontSize - 4, bold: true }))
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
      sectionChildren.push(new Paragraph({ children: runs }))
    }

    const doc = new Document({
      sections: [{ children: sectionChildren }],
    })

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(savePath, buffer)
  }
}
