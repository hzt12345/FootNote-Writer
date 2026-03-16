/**
 * Footnote Parser Engine
 *
 * Parses two common AI output formats:
 *
 * Format A (inline [N] + endnotes):
 *   收入同比增长15%[1]，使用调整后指标[2]。
 *   [1] 参见2024年度报告第32页。
 *   [2] 非GAAP指标定义见附录A。
 *
 * Format B (Markdown [^N] + definitions):
 *   收入同比增长15%[^1]，使用调整后指标[^2]。
 *   [^1]: 参见2024年度报告第32页。
 *   [^2]: 非GAAP指标定义见附录A。
 */

export interface ParseResult {
  /** Body text with footnote markers as {{FN:id}} */
  body: string
  /** Footnote id -> content */
  footnotes: Map<number, string>
}

/**
 * Parse text containing footnote markers and footnote definitions.
 * Returns body text with {{FN:id}} placeholders and a footnote map.
 */
export function parseFootnotes(text: string): ParseResult {
  const footnotes = new Map<number, string>()

  // Try to detect and split body vs footnote definitions
  const lines = text.split('\n')

  // Collect footnote definitions (from the end of the text)
  // Format B: [^N]: content
  const defRegexB = /^\[\^(\d+)\]:\s*(.+)$/
  // Format A: [N] content (at start of line, as definition)
  const defRegexA = /^\[(\d+)\]\s+(.+)$/

  // Scan ALL lines for footnote definitions, not just from the end
  // This handles cases where definitions are mixed with blank lines
  const defLines = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    let match = defRegexB.exec(line)
    if (match) {
      footnotes.set(parseInt(match[1], 10), match[2].trim())
      defLines.add(i)
      continue
    }
    match = defRegexA.exec(line)
    if (match) {
      footnotes.set(parseInt(match[1], 10), match[2].trim())
      defLines.add(i)
    }
  }

  // Body = all lines that are NOT footnote definitions
  let body = lines.filter((_line, i) => !defLines.has(i)).join('\n').trimEnd()

  // Replace inline markers with {{FN:id}} placeholders
  // Handle [^N] format (Markdown)
  body = body.replace(/\[\^(\d+)\]/g, (_match, num) => `{{FN:${num}}}`)
  // Handle [N] format (plain), but only if not already replaced and it's a number
  body = body.replace(/(?<!\{FN:)\[(\d+)\](?!:)/g, (_match, num) => `{{FN:${num}}}`)

  // Fix English quotes back to Chinese quotes in footnote content
  // AI often converts "" to "" in Chinese text
  for (const [id, content] of footnotes) {
    footnotes.set(id, fixChineseQuotes(content))
  }

  return { body, footnotes }
}

/**
 * Convert English double quotes to Chinese double quotes in Chinese text context.
 * Pairs quotes: odd " becomes left ", even " becomes right ".
 */
function fixChineseQuotes(text: string): string {
  // Only fix if text contains Chinese characters (indicating Chinese context)
  if (!/[\u4e00-\u9fff]/.test(text)) return text

  // Replace paired straight double quotes with Chinese quotes
  let count = 0
  let result = text.replace(/"/g, () => {
    count++
    return count % 2 === 1 ? '\u201c' : '\u201d' // "" pair
  })

  // Same for single quotes in Chinese context
  let sCount = 0
  result = result.replace(/'/g, () => {
    sCount++
    return sCount % 2 === 1 ? '\u2018' : '\u2019' // '' pair
  })

  return result
}

/**
 * Convert body text with {{FN:id}} markers back to display text with [^N] markers.
 */
export function bodyToDisplayText(body: string, footnotes: Map<number, string>): string {
  let display = body.replace(/\{\{FN:(\d+)\}\}/g, (_m, num) => `[^${num}]`)
  if (footnotes.size > 0) {
    display += '\n\n'
    for (const [id, content] of footnotes) {
      display += `[^${id}]: ${content}\n`
    }
  }
  return display
}

/**
 * Convert editor HTML content to export-ready paragraphs.
 * Extracts text and footnote markers from the Tiptap HTML.
 */
export function htmlToExportParagraphs(html: string): { text: string; heading?: 'h1' | 'h2' | 'h3'; bold?: boolean; italic?: boolean }[] {
  // Simple HTML -> paragraph extraction
  const paragraphs: { text: string; heading?: 'h1' | 'h2' | 'h3'; bold?: boolean; italic?: boolean }[] = []

  // Parse using DOMParser (available in renderer)
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const blocks = doc.body.querySelectorAll('p, h1, h2, h3')
  for (const block of blocks) {
    const heading = block.tagName.toLowerCase() as 'h1' | 'h2' | 'h3' | 'p'

    // Extract text, preserving footnote-marker spans as {{FN:id}}
    let text = ''
    for (const node of block.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.classList.contains('footnote-marker')) {
          const fnId = node.getAttribute('data-footnote-id')
          text += `{{FN:${fnId}}}`
        } else {
          text += node.textContent || ''
        }
      }
    }

    paragraphs.push({
      text,
      heading: heading !== 'p' ? heading : undefined,
    })
  }

  return paragraphs
}
