import { describe, it, expect } from 'vitest'
import { parseFootnotes, bodyToDisplayText } from '../src/renderer/lib/footnote-parser'

describe('parseFootnotes', () => {
  // === Format B: Markdown [^N] ===
  it('should parse standard [^N] markers and definitions', () => {
    const text = `正文内容[^1]，更多内容[^2]。

[^1]: 参见报告第32页。
[^2]: 非GAAP指标定义见附录A。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.footnotes.get(1)).toContain('参见报告第32页')
    expect(result.footnotes.get(2)).toContain('非GAAP指标定义见附录A')
    expect(result.body).toContain('{{FN:1}}')
    expect(result.body).toContain('{{FN:2}}')
    expect(result.body).not.toContain('[^1]')
  })

  // === Format A: Plain [N] ===
  it('should parse plain [N] markers and definitions', () => {
    const text = `收入同比增长15%[1]，使用调整后指标[2]。

[1] 参见2024年度报告第32页。
[2] 非GAAP指标定义见附录A。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.footnotes.get(1)).toContain('参见2024年度报告第32页')
    expect(result.body).toContain('{{FN:1}}')
  })

  // === Format C: Inline long bracket ===
  it('should extract inline long-bracket footnotes with Chinese content', () => {
    const text = `正式请求与中国磋商[《关于争端解决规则与程序的谅解》第1条："相关规定"；参见报告第1页。]。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(1)
    // Should have extracted the long bracket content as a footnote
    const fn = result.footnotes.get(1)
    expect(fn).toContain('关于争端解决规则与程序的谅解')
    expect(result.body).toContain('{{FN:1}}')
    // Original bracket content should be replaced
    expect(result.body).not.toContain('《关于争端解决规则与程序的谅解》')
  })

  // === Non-standard markers (v1.1.0 fix) ===
  it('should handle [^footnoteN] format', () => {
    const text = `正文内容[^footnote0]，更多内容[^footnote1]。

[^footnote0]: 第一个脚注。
[^footnote1]: 第二个脚注。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.footnotes.get(0)).toContain('第一个脚注')
    expect(result.footnotes.get(1)).toContain('第二个脚注')
    expect(result.body).toContain('{{FN:0}}')
    expect(result.body).toContain('{{FN:1}}')
  })

  it('should handle [^fn_N] format', () => {
    const text = `正文内容[^fn_1]，更多[^fn_2]。

[^fn_1]: 脚注一。
[^fn_2]: 脚注二。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.body).toContain('{{FN:1}}')
    expect(result.body).toContain('{{FN:2}}')
  })

  it('should handle [^fn-N] format', () => {
    const text = `正文内容[^fn-1]，更多[^fn-2]。

[^fn-1]: 脚注一。
[^fn-2]: 脚注二。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.body).toContain('{{FN:1}}')
    expect(result.body).toContain('{{FN:2}}')
  })

  it('should handle mixed standard and non-standard markers', () => {
    const text = `段落一[^1]，段落二[^footnote2]。

[^1]: 标准脚注。
[^footnote2]: 非标准脚注。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(2)
    expect(result.footnotes.get(1)).toContain('标准脚注')
    expect(result.footnotes.get(2)).toContain('非标准脚注')
  })

  // === Edge cases ===
  it('should return empty footnotes for text without any markers', () => {
    const text = '这是一段没有脚注的正文。'
    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(0)
    expect(result.body).toBe('这是一段没有脚注的正文。')
  })

  it('should not treat short bracket content as inline footnotes', () => {
    const text = '加入了WTO[WTO]之后。'
    const result = parseFootnotes(text)
    // [WTO] is too short (<15 chars) to be an inline footnote
    expect(result.footnotes.size).toBe(0)
  })

  it('should remove duplicate superscript markers', () => {
    const text = `正文内容[^1]¹，更多内容。

[^1]: 脚注内容。`

    const result = parseFootnotes(text)
    expect(result.footnotes.size).toBe(1)
    // The superscript ¹ after the marker should be removed
    expect(result.body).not.toContain('¹')
    expect(result.body).toContain('{{FN:1}}')
  })
})

describe('bodyToDisplayText', () => {
  it('should convert {{FN:N}} markers back to [^N] format', () => {
    const body = '正文{{FN:1}}，更多{{FN:2}}。'
    const footnotes = new Map<number, string>([
      [1, '脚注一'],
      [2, '脚注二'],
    ])
    const display = bodyToDisplayText(body, footnotes)
    expect(display).toContain('[^1]')
    expect(display).toContain('[^2]')
    expect(display).toContain('[^1]: 脚注一')
    expect(display).toContain('[^2]: 脚注二')
  })

  it('should return body as-is when no footnotes', () => {
    const body = '没有脚注的正文。'
    const footnotes = new Map<number, string>()
    const display = bodyToDisplayText(body, footnotes)
    expect(display).toBe('没有脚注的正文。')
  })
})
