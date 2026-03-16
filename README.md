# FootNote Writer — 学术写作脚注助手

AI 辅助为论文补充脚注，一键导出带**原生 Word 脚注**的 DOCX 文件。

## 痛点

用 AI 辅助写论文时，AI 能帮你补脚注，但输出的是纯文本（`[1]` 标记 + 文末列表）。粘贴到 Word 后：

- 不是原生脚注，无法自动编号
- 插入新脚注后序号不会调整
- 无法在页脚显示，无法尾注/脚注互转

FootNote Writer 解决最后一步：**把 AI 生成的脚注变成 Word 原生脚注**。

## 使用方法

4 步完成：

1. **导入正文** — 上传 PDF / Word / TXT，或直接粘贴
2. **上传参考文献** — 上传 PDF / Word（可多选），AI 只从你的文献中引用
3. **AI 自动补脚注** — 一键生成，AI 基于参考文献为正文添加脚注
4. **导出 Word** — 得到带原生脚注的 DOCX，在 Word 中可编辑、可重新编号

## 功能特性

- **原生 Word 脚注** — 导出的 DOCX 使用 Word 原生脚注格式，完全可编辑
- **参考文献管理** — 上传 PDF/Word 文献，AI 只从你的文献中生成引用，不会编造
- **中英文混合** — 正文中文、文献英文（或反之）都能语义匹配
- **《法学引注手册》格式** — 内置中文著作、期刊、外文著作、法律法规等格式规范
- **斜体支持** — 外文文献名在 Word 中正确显示为斜体
- **上下文可控** — 可设置发送给 AI 的参考文献字符上限，避免超出模型上下文窗口
- **多 API 支持** — 默认 MiniMax，也兼容其他 OpenAI 格式的 API

## 下载安装

前往 [Releases](https://github.com/hzt12345/FootNote-Writer/releases) 下载：

| 平台 | 文件 |
|------|------|
| Windows | `FootNote Writer Setup x.x.x.exe` |
| Mac (Apple Silicon) | `FootNote Writer-x.x.x-arm64.dmg` |

安装后打开，在设置中配置 API Key 即可使用。

## API 配置

默认使用 [MiniMax](https://platform.minimax.io) API：

1. 注册 MiniMax 账号，获取 API Key 和 Group ID
2. 打开 FootNote Writer → 右上角设置
3. 填入 API Key、Group ID
4. API 地址默认 `https://api.minimaxi.com`，无需修改

也支持其他兼容 OpenAI Chat Completions 格式的 API，修改 API 地址和模型名即可。

## 本地开发

```bash
# 安装依赖
npm install

# 重建原生模块（better-sqlite3）
npx electron-rebuild -f -w better-sqlite3

# 启动开发模式
npm run dev

# 另一个终端启动 Electron
npm start

# 构建
npm run build

# 打包安装包
npm run pack
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Electron + React + TypeScript |
| 样式 | TailwindCSS |
| DOCX 生成 | [docx](https://www.npmjs.com/package/docx)（原生 Word 脚注） |
| PDF 提取 | pdf-parse |
| Word 提取 | mammoth |
| 本地存储 | better-sqlite3 |
| 状态管理 | Zustand |
| 打包 | electron-builder |
| CI | GitHub Actions（自动构建 Windows + Mac） |

## 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── index.ts          # 入口
│   ├── ipc.ts            # IPC 通信 + API 调用
│   ├── db.ts             # SQLite 数据库
│   ├── docx-export.ts    # DOCX 导出（脚注核心）
│   └── file-reader.ts    # PDF/Word 文本提取
├── renderer/             # React 前端
│   ├── App.tsx           # 主界面（4步流程）
│   ├── components/
│   │   └── Settings.tsx  # 设置页面
│   └── lib/
│       ├── claude-api.ts       # API 封装
│       ├── footnote-parser.ts  # 脚注解析引擎
│       ├── file-import.ts      # 文件导入
│       └── store.ts            # Zustand 状态
└── shared/
    └── types.ts          # 共享类型定义
```

## License

MIT
