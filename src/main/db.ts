import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import type { Reference, FootnoteTemplate, AppSettings } from '../shared/types'

let db: Database.Database

export function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'footnote-writer.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS references_lib (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS footnote_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      is_preset INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migration: add group_name column if missing
  try {
    db.exec(`ALTER TABLE footnote_templates ADD COLUMN group_name TEXT DEFAULT NULL`)
  } catch {
    // Column already exists
  }

  // Update existing presets with group names if null
  const ungrouped = db.prepare('SELECT COUNT(*) as c FROM footnote_templates WHERE is_preset = 1 AND group_name IS NULL').get() as { c: number }
  if (ungrouped.c > 0) {
    db.exec(`UPDATE footnote_templates SET group_name = '法学引注手册' WHERE is_preset = 1 AND group_name IS NULL`)
  }
  // Seed new presets if they don't exist yet
  const totalPresets = db.prepare('SELECT COUNT(*) as c FROM footnote_templates WHERE is_preset = 1').get() as { c: number }
  if (totalPresets.c < 15) {
    const newPresets = [
      { name: '专著', format: '[{序号}] {作者}.{书名}[M].{出版地}:{出版者},{出版年}:{页码}.', group: 'GB/T 7714' },
      { name: '期刊文章', format: '[{序号}] {作者}.{文章题名}[J].{期刊名},{年},{卷}({期}):{页码}.', group: 'GB/T 7714' },
      { name: '学位论文', format: '[{序号}] {作者}.{题名}[D].{保存地点}:{保存单位},{年份}.', group: 'GB/T 7714' },
      { name: '网络文献', format: '[{序号}] {作者}.{题名}[EB/OL].({发表日期})[{引用日期}].{URL}.', group: 'GB/T 7714' },
      { name: 'Book', format: '{Author}, {Initials}. ({Year}). *{Title}*. {Publisher}.', group: 'APA 7th' },
      { name: 'Journal Article', format: '{Author}, {Initials}. ({Year}). {Title}. *{Journal}*, *{Volume}*({Issue}), {Pages}.', group: 'APA 7th' },
      { name: 'Note (脚注式)', format: '{Author}, *{Title}* ({Place}: {Publisher}, {Year}), {Page}.', group: 'Chicago' },
      { name: 'Bibliography (书目式)', format: '{Author}. *{Title}*. {Place}: {Publisher}, {Year}.', group: 'Chicago' },
    ]
    const stmtNew = db.prepare('INSERT INTO footnote_templates (name, format, is_preset, group_name) VALUES (?, ?, 1, ?)')
    for (const p of newPresets) {
      stmtNew.run(p.name, p.format, p.group)
    }
  }

  // Seed preset templates if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM footnote_templates WHERE is_preset = 1').get() as { c: number }
  if (count.c === 0) {
    seedPresetTemplates()
  }
}

function seedPresetTemplates() {
  const presets: { name: string; format: string; group: string }[] = [
    // 法学引注手册
    { name: '中文著作', format: '{作者}：《{书名}》，{出版社}{年份}年版，第{页码}页。', group: '法学引注手册' },
    { name: '中文期刊', format: '{作者}：《{文章名}》，载《{期刊名}》{年份}年第{期号}期。', group: '法学引注手册' },
    { name: '外文著作', format: '{Author}, {Title} ({Publisher}, {Year}), p. {Page}.', group: '法学引注手册' },
    { name: '外文期刊', format: '{Author}, "{Title}", {Journal}, Vol.{Volume}, No.{Issue} ({Year}).', group: '法学引注手册' },
    { name: '法律法规', format: '《{法规名}》第{条款}条。', group: '法学引注手册' },
    { name: '司法解释', format: '《{文件名}》（{文号}）第{条款}条。', group: '法学引注手册' },
    { name: '案例', format: '{案件名}，{法院}（{案号}）。', group: '法学引注手册' },
    // GB/T 7714
    { name: '专著', format: '[{序号}] {作者}.{书名}[M].{出版地}:{出版者},{出版年}:{页码}.', group: 'GB/T 7714' },
    { name: '期刊文章', format: '[{序号}] {作者}.{文章题名}[J].{期刊名},{年},{卷}({期}):{页码}.', group: 'GB/T 7714' },
    { name: '学位论文', format: '[{序号}] {作者}.{题名}[D].{保存地点}:{保存单位},{年份}.', group: 'GB/T 7714' },
    { name: '网络文献', format: '[{序号}] {作者}.{题名}[EB/OL].({发表日期})[{引用日期}].{URL}.', group: 'GB/T 7714' },
    // APA 第 7 版
    { name: 'Book', format: '{Author}, {Initials}. ({Year}). *{Title}*. {Publisher}.', group: 'APA 7th' },
    { name: 'Journal Article', format: '{Author}, {Initials}. ({Year}). {Title}. *{Journal}*, *{Volume}*({Issue}), {Pages}.', group: 'APA 7th' },
    // Chicago
    { name: 'Note (脚注式)', format: '{Author}, *{Title}* ({Place}: {Publisher}, {Year}), {Page}.', group: 'Chicago' },
    { name: 'Bibliography (书目式)', format: '{Author}. *{Title}*. {Place}: {Publisher}, {Year}.', group: 'Chicago' },
  ]
  const stmt = db.prepare('INSERT INTO footnote_templates (name, format, is_preset, group_name) VALUES (?, ?, 1, ?)')
  for (const p of presets) {
    stmt.run(p.name, p.format, p.group)
  }
}

// ---- References ----
export function addReference(ref: Omit<Reference, 'id' | 'createdAt'>): Reference {
  const stmt = db.prepare('INSERT INTO references_lib (title, author, filename, content) VALUES (?, ?, ?, ?)')
  const info = stmt.run(ref.title, ref.author, ref.filename, ref.content)
  return {
    id: info.lastInsertRowid as number,
    title: ref.title,
    author: ref.author,
    filename: ref.filename,
    content: ref.content,
    createdAt: new Date().toISOString(),
  }
}

export function getReferences(): Reference[] {
  return db.prepare('SELECT id, title, author, filename, content, created_at as createdAt FROM references_lib ORDER BY id DESC').all() as Reference[]
}

export function deleteReference(id: number): void {
  db.prepare('DELETE FROM references_lib WHERE id = ?').run(id)
}

// ---- Templates ----
export function getTemplates(): FootnoteTemplate[] {
  return db.prepare('SELECT id, name, format, is_preset as isPreset, group_name as "group" FROM footnote_templates ORDER BY is_preset DESC, group_name, id ASC').all() as FootnoteTemplate[]
}

export function saveTemplate(tmpl: Omit<FootnoteTemplate, 'id' | 'isPreset'>): FootnoteTemplate {
  const stmt = db.prepare('INSERT INTO footnote_templates (name, format, is_preset) VALUES (?, ?, 0)')
  const info = stmt.run(tmpl.name, tmpl.format)
  return { id: info.lastInsertRowid as number, name: tmpl.name, format: tmpl.format, isPreset: false, group: tmpl.group ?? null }
}

export function deleteTemplate(id: number): void {
  db.prepare('DELETE FROM footnote_templates WHERE id = ? AND is_preset = 0').run(id)
}

// ---- Settings ----
export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map = new Map(rows.map(r => [r.key, r.value]))
  return {
    providerId: map.get('providerId') || 'minimax',
    apiKey: map.get('apiKey') || '',
    apiBase: map.get('apiBase') || 'https://api.minimaxi.com',
    groupId: map.get('groupId') || '',
    model: map.get('model') || 'MiniMax-M2.5',
    systemPrompt: map.get('systemPrompt') || getDefaultSystemPrompt(),
    defaultTemplateId: map.has('defaultTemplateId') ? Number(map.get('defaultTemplateId')) : null,
    exportFont: map.get('exportFont') || '宋体',
    exportFontSize: Number(map.get('exportFontSize') || '12'),
    maxRefChars: Number(map.get('maxRefChars') || '30000'),
    requestTimeout: Number(map.get('requestTimeout') || '0'),
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  const txn = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        stmt.run(key, String(value))
      }
    }
  })
  txn()
}

function getDefaultSystemPrompt(): string {
  return `你是一位学术写作助手，帮助用户为论文补充脚注。

任务：阅读用户提供的参考文献，找到与正文相关的内容，为正文添加脚注引用。

规则：
1. 使用 [^数字] 格式标注脚注位置（如 [^1]、[^2]）
2. 在文末用 [^数字]: 内容 的格式列出脚注内容
3. 只能使用用户提供的参考文献，禁止编造文献
4. 正文可能是中文、文献可能是英文（或反之），要理解语义匹配
5. 积极为正文中的观点寻找参考文献支撑并添加脚注
6. 直接返回带脚注的完整正文，不要加解释、不要道歉

脚注格式（《法学引注手册》规范）：
- 中文著作：作者：《书名》，出版社出版年版，第X页。
- 中文期刊：作者：《文章名》，载《期刊名》年第X期。
- 中文文集：作者：《文章名》，载主编者主编：《文集名》，出版社出版年版，第X页。
- 外文著作：Author, *Title* (Publisher Year), p. X.
- 外文期刊：Author, "Article Title", *Journal* Vol. X, No. X (Year).
- 法律法规：《法规名》第X条。
- 司法案例：案件名，法院（案号）。
- 网络资源：作者：《标题》，载网站名年月日，URL。`
}
