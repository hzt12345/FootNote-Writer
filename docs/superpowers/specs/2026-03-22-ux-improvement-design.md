# FootNote Writer UX Improvement Design

**Date:** 2026-03-22
**Status:** Draft
**Author:** ZTH

## Problem Statement

FootNote Writer users (primarily Windows, primarily in China) encounter issues that are hard to diagnose and resolve:

1. **Opaque error messages** — Raw API error codes (e.g., MiniMax 2049) give users no actionable guidance
2. **No diagnostic data** — When users report problems, there's no way to see what happened
3. **Windows builds untested** — CI produces Windows .exe but no automated verification; bugs may ship undetected
4. **Download inaccessible in China** — GitHub Releases are slow/unreachable for many Chinese users

## Design

### 1. Error Message Improvement

**Location:** `src/main/ipc.ts` error handling (lines ~260-295)

Add a mapping layer between raw API errors and user-facing Chinese guidance messages. The raw error is preserved for logging; the user sees actionable steps.

**Error mapping table:**

| Raw Error | User-Facing Message |
|-----------|-------------------|
| MiniMax status_code 2049, 1004 | `API Key 无效或已过期。请检查：1) Key 是否正确复制（无多余空格）2) Group ID 是否已填写 3) Key 是否仍有效` |
| HTTP 401 / 403 | `API 认证失败，请检查 API Key 是否正确` |
| ECONNREFUSED / ETIMEDOUT / ENOTFOUND | `无法连接到 API 服务器，请检查网络连接或 API 地址是否正确` |
| Empty content (content 为空) | `模型返回了空内容，可能是输入过长或触发了内容过滤，请尝试缩短文本` |
| HTTP 429 | `请求过于频繁，请稍后再试` |
| HTTP 500+ | `API 服务器出错，请稍后重试` |

**Implementation approach:**
- Create a `mapErrorToUserMessage(rawError: string, statusCode?: number, provider?: string)` function in `src/main/ipc.ts`
- The function returns `{ userMessage: string; rawError: string }` — UI shows `userMessage`, logger records `rawError`
- Add a "复制错误详情" button next to error display in the UI, which copies `rawError` + app version + OS info to clipboard

### 2. Application Logger + Log Export

**New file:** `src/main/logger.ts`

**What gets logged:**
- **API requests:** provider, model, endpoint URL, HTTP status code, error message (NO request body, NO response body, NO API key)
- **App operations:** file open (filename + type), DOCX export (mode + success/fail), settings save (provider + model, key masked to first 4 chars)
- **App lifecycle:** app start (version, OS, arch), app quit

**What does NOT get logged:**
- User text content (body text, references, AI responses)
- Full API keys
- File contents

**Storage:**
- In-memory ring buffer: 500 entries (for quick export without disk read)
- File: `{app.getPath('userData')}/app.log`
- Rolling: max 2MB, when exceeded, truncate older half
- Format: `[2026-03-22T14:30:00] [INFO] [api] POST minimax/v1/chat status=200 model=abab6.5s-chat`

**Log export:**
- New IPC channel: `IPC.LOG_EXPORT`
- Settings page gets an "导出诊断日志" button
- Export produces a `.txt` file via save dialog
- File header contains: app version, Electron version, OS name + version, current provider + model, API key first 4 chars + masked remainder

### 3. CI Windows Smoke Test

**Location:** `.github/workflows/build.yml`, after the Package step on Windows

**Approach:** Add `--smoke-test` CLI flag support to `src/main/index.ts`.

When `--smoke-test` is passed:
1. Create the BrowserWindow as normal
2. Load the renderer (from `dist/renderer/`)
3. Wait for `did-finish-load` event
4. Verify: window exists, width > 0, height > 0
5. Exit with code 0 (success)
6. If no `did-finish-load` within 10 seconds, exit with code 1 (fail)

**CI step:**
```yaml
- name: Smoke test
  if: matrix.platform == 'win'
  shell: bash
  run: |
    npx electron ./dist/main/index.js --smoke-test
  timeout-minutes: 2
```

This validates: Electron can start, native modules (better-sqlite3) load correctly, renderer HTML/JS loads without crash.

**Limitation:** Does not test UI interactions or API calls. That's acceptable — the goal is catching build/packaging regressions, not functional testing.

### 4. Gitee Release Sync

**Location:** `.github/workflows/build.yml`, new job after `release`

**Approach:**
- New job `gitee-sync` that runs after `release`
- Uses Gitee API v5 to:
  1. Create a Release on Gitee with the same tag
  2. Upload `.exe`, `.dmg`, `.zip` artifacts as release assets
- Requires `GITEE_TOKEN` in GitHub Secrets (Gitee personal access token with `projects` scope)
- Gitee repo must be pre-created manually (one-time setup)

**Gitee API calls:**
1. `POST /api/v5/repos/{owner}/{repo}/releases` — create release
2. `POST /api/v5/repos/{owner}/{repo}/releases/{id}/attach_files` — upload each asset

**Failure handling:** Gitee sync failure should NOT fail the overall workflow. Use `continue-on-error: true`.

## File Changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/main/logger.ts` | New | Logger module with ring buffer + file output |
| `src/main/ipc.ts` | Modify | Add error mapping, add logger calls, add LOG_EXPORT handler |
| `src/main/index.ts` | Modify | Initialize logger on startup, add --smoke-test support |
| `src/renderer/components/Settings.tsx` | Modify | Add "导出诊断日志" button |
| `src/renderer/App.tsx` or `ChatPanel.tsx` | Modify | Add "复制错误详情" button next to error messages |
| `src/shared/types.ts` | Modify | Add `IPC.LOG_EXPORT` channel constant |
| `.github/workflows/build.yml` | Modify | Add smoke test step + gitee-sync job |

## Out of Scope

- In-app feedback form / remote error reporting
- Full E2E testing on Windows
- Download page website / object storage hosting
- Auto-update mechanism
