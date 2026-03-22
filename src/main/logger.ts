import fs from 'fs'
import path from 'path'

const MAX_LOG_SIZE = 2 * 1024 * 1024 // 2MB

export class RingBuffer<T> {
  private buf: (T | undefined)[]
  private head = 0
  private count = 0

  constructor(private capacity: number) {
    this.buf = new Array(capacity)
  }

  push(item: T): void {
    this.buf[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  toArray(): T[] {
    if (this.count === 0) return []
    const start = (this.head - this.count + this.capacity) % this.capacity
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      result.push(this.buf[(start + i) % this.capacity] as T)
    }
    return result
  }

  clear(): void {
    this.buf = new Array(this.capacity)
    this.head = 0
    this.count = 0
  }

  get size(): number {
    return this.count
  }
}

export function formatLogLine(level: string, category: string, message: string): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '')
  return `[${ts}] [${level}] [${category}] ${message}`
}

class Logger {
  private ring = new RingBuffer<string>(500)
  private logFilePath: string | null = null

  init(userDataPath: string): void {
    this.logFilePath = path.join(userDataPath, 'app.log')
  }

  info(category: string, message: string): void {
    this.write('INFO', category, message)
  }

  error(category: string, message: string): void {
    this.write('ERROR', category, message)
  }

  private write(level: string, category: string, message: string): void {
    const line = formatLogLine(level, category, message)
    this.ring.push(line)
    if (this.logFilePath) {
      try {
        this.rotateIfNeeded()
        fs.appendFileSync(this.logFilePath, line + '\n')
      } catch {
        // Swallow file write errors — logging must not crash the app
      }
    }
  }

  private rotateIfNeeded(): void {
    if (!this.logFilePath) return
    try {
      const stat = fs.statSync(this.logFilePath)
      if (stat.size >= MAX_LOG_SIZE) {
        const backup = this.logFilePath + '.1'
        fs.renameSync(this.logFilePath, backup)
      }
    } catch {
      // File may not exist yet — that's fine
    }
  }

  getLogContent(): string {
    if (!this.logFilePath) return ''
    try {
      let content = ''
      const backup = this.logFilePath + '.1'
      if (fs.existsSync(backup)) {
        content += fs.readFileSync(backup, 'utf-8')
      }
      if (fs.existsSync(this.logFilePath)) {
        content += fs.readFileSync(this.logFilePath, 'utf-8')
      }
      return content
    } catch {
      return ''
    }
  }

  static maskKey(key: string): string {
    if (!key || key.length <= 4) return '****'
    return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 4, 20))
  }
}

export const logger = new Logger()
