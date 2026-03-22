import { describe, it, expect, beforeEach } from 'vitest'
import { RingBuffer, formatLogLine } from '../src/main/logger'

describe('RingBuffer', () => {
  let buf: RingBuffer<string>

  beforeEach(() => {
    buf = new RingBuffer<string>(5)
  })

  it('starts empty', () => {
    expect(buf.size).toBe(0)
    expect(buf.toArray()).toEqual([])
  })

  it('push and retrieve items in order', () => {
    buf.push('a')
    buf.push('b')
    buf.push('c')
    expect(buf.toArray()).toEqual(['a', 'b', 'c'])
    expect(buf.size).toBe(3)
  })

  it('overflow drops oldest items', () => {
    for (const ch of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      buf.push(ch)
    }
    expect(buf.size).toBe(5)
    expect(buf.toArray()).toEqual(['c', 'd', 'e', 'f', 'g'])
  })

  it('clear resets buffer', () => {
    buf.push('a')
    buf.push('b')
    buf.clear()
    expect(buf.size).toBe(0)
    expect(buf.toArray()).toEqual([])
  })

  it('single capacity buffer keeps only last item', () => {
    const tiny = new RingBuffer<number>(1)
    tiny.push(1)
    tiny.push(2)
    tiny.push(3)
    expect(tiny.toArray()).toEqual([3])
  })
})

describe('formatLogLine', () => {
  it('formats a log entry correctly', () => {
    const line = formatLogLine('INFO', 'api', 'test message')
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\] \[INFO\] \[api\] test message$/)
  })

  it('formats ERROR level', () => {
    const line = formatLogLine('ERROR', 'app', 'something broke')
    expect(line).toContain('[ERROR]')
    expect(line).toContain('[app]')
  })
})
