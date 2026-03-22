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

## Implementation Order

Logger (Section 2) must be implemented first, as Error Mapping (Section 1) depends on it for recording raw errors. Sections 3 and 4 (CI changes) are independent and can be done in any order.

## Design

### 1. Error Message Improvement

**Location:** `src/main/ipc.ts` error handling (lines 242-303)

Add a mapping layer between raw API errors and user-facing Chinese guidance messages. The raw error is preserved for logging; the user sees actionable steps.

**Implementation requirement:** The current code does not check `res.statusCode` for HTTP-level errors (401/403/429/500). The implementation must add HTTP status code checking **before** JSON parsing, because some providers return non-JSON responses for these status codes.

**Error mapping table:**

| Raw Error | User-Facing Message |
|-----------|-------------------|
| MiniMax status_code 2049, 1004 | `API Key 无效或已过期。请检查：1) Key 是否正确复制（无多余空格）2) Group ID 是否已填写 3) Key 是否仍有效` |
| HTTP 400 | `请求参数有误，请检查模型名称是否正确` |
| HTTP 401 / 403 | `API 认证失败，请检查 API Key 是否正确` |
| HTTP 429 | `请求过于频繁，请稍后再试` |
| HTTP 500+ | `API 服务器出错，请稍后重试` |
| ECONNREFUSED / ETIMEDOUT / ENOTFOUND | `无法连接到 API 服务器，请检查网络连接或 API 地址是否正确` |
| Request timeout (30s) | `请求超时，请检查网络连接或稍后重试` |
| Empty content (content 为空) | `模型返回了空内容，可能是输入过长或触发了内容过滤，请尝试缩短文本` |

**Implementation approach:**
- Create a `mapErrorToUserMessage(rawError: string, statusCode?: number, provider?: string)` function in `src/main/ipc.ts`
- The function returns `{ userMessage: string; rawError: string }` — UI shows `userMessage`, logger records `rawError`
- Add a 30-second request timeout to the HTTP request (currently no timeout is set)
- Add a "复制错误详情" button next to error display in `src/renderer/App.tsx` (line 239, the `setStatus` error display). The current status is a simple string; add an `isError` flag to differentiate error status from informational status, so the copy button only renders for errors.

**Unit tests:** Add tests for `mapErrorToUserMessage()` covering all error types in the mapping table.

### 2. Application Logger + Log Export

**New file:** `src/main/logger.ts`

**What gets logged:**
- **API requests** `[api]`: provider, model, endpoint URL, HTTP status code, error message (NO request body, NO response body, NO API key)
- **App operations** `[file]`: file open (filename + type), DOCX export (mode + success/fail)
- **Settings** `[settings]`: settings save (provider + model, key masked to first 4 chars)
- **App lifecycle** `[app]`: app start (version, OS, arch), app quit
- **Database** `[db]`: DB init, migration errors

**What does NOT get logged:**
- User text content (body text, references, AI responses)
- Full API keys
- File contents

**Storage:**
- In-memory ring buffer: 500 entries (for fast access during current session)
- File: `{app.getPath('userData')}/app.log`
- Log rotation: when file exceeds 2MB, rename `app.log` → `app.log.1` (overwrite any existing `.1`), then create fresh `app.log`. Simple, safe, avoids mid-line truncation and Windows file locking issues.
- Format: `[2026-03-22T14:30:00] [INFO] [api] POST minimax/v1/chat status=200 model=abab6.5s-chat`

**Log export:**
- New IPC channel: `IPC.LOG_EXPORT`
- Handler in main process: reads from **file** (not ring buffer), so crash logs are preserved. Opens `dialog.showSaveDialog()` to let user choose save location, then writes the `.txt` file.
- Settings page gets an "导出诊断日志" button that calls `ipcRenderer.invoke(IPC.LOG_EXPORT)`
- Export file header contains: app version, Electron version, OS name + version, current provider + model, API key first 4 chars + masked remainder

**Unit tests:** Add tests for ring buffer (push, overflow, export) and log rotation logic.

### 3. CI Windows Smoke Test

**Location:** `.github/workflows/build.yml`, after the Package step

**Scope clarification:** This smoke test runs the **compiled source** (`dist/main/index.js`), NOT the packaged installer (`.exe`). It validates that compiled code + native modules load and the renderer renders. It does NOT catch ASAR packaging issues. This is an acceptable trade-off — it catches the majority of build regressions (TypeScript errors, missing dependencies, native module compilation failures) at low cost.

**Approach:** Add `--smoke-test` CLI flag support to `src/main/index.ts`.

When `--smoke-test` is passed:
1. Call `initDB()` as normal (creates a temporary DB on CI — acceptable)
2. Create the BrowserWindow as normal
3. Load the renderer (from `dist/renderer/`)
4. Wait for `did-finish-load` event
5. Then execute `webContents.executeJavaScript('document.getElementById("root").children.length > 0')` to verify React actually rendered (not just HTML loaded)
6. Capture `webContents.on('console-message')` output — print to stdout so CI logs are useful on failure
7. Exit with code 0 (success)
8. If no successful verification within 15 seconds, exit with code 1 (fail)

**CI step (runs on both platforms):**
```yaml
- name: Smoke test
  shell: bash
  run: |
    npx electron ./dist/main/index.js --smoke-test
  timeout-minutes: 2
  env:
    ELECTRON_ENABLE_LOGGING: 1
```

**Note:** GitHub Actions Windows runners have a desktop session; macOS runners also support GUI. No `xvfb` needed.

**Limitation:** Does not test the packaged installer or UI interactions. The goal is catching build/compilation regressions, not functional testing.

### 4. Gitee Release Sync

**Location:** `.github/workflows/build.yml`, new job after `release`

**Prerequisites (one-time manual setup):**
- Create Gitee repo (e.g., `https://gitee.com/{owner}/FootNote-Writer`)
- Generate Gitee personal access token with `projects` scope
- Add `GITEE_TOKEN` and `GITEE_OWNER` / `GITEE_REPO` to GitHub Secrets

**Workflow job skeleton:**
```yaml
gitee-sync:
  needs: release
  if: startsWith(github.ref, 'refs/tags/v')
  runs-on: ubuntu-latest
  continue-on-error: true  # Gitee failure should not fail the pipeline
  steps:
    - name: Download all artifacts
      uses: actions/download-artifact@v4
      with:
        path: artifacts

    - name: Get tag name
      id: tag
      run: echo "TAG=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

    - name: Create Gitee Release
      id: create_release
      continue-on-error: true  # May already exist on re-run
      run: |
        RESPONSE=$(curl -s -X POST \
          "https://gitee.com/api/v5/repos/${{ secrets.GITEE_OWNER }}/${{ secrets.GITEE_REPO }}/releases" \
          -H "Content-Type: application/json" \
          -d '{
            "access_token": "${{ secrets.GITEE_TOKEN }}",
            "tag_name": "${{ steps.tag.outputs.TAG }}",
            "name": "${{ steps.tag.outputs.TAG }}",
            "body": "See GitHub Release for details."
          }')
        # Extract release ID (works for both new and existing)
        RELEASE_ID=$(echo "$RESPONSE" | jq -r '.id')
        if [ "$RELEASE_ID" = "null" ]; then
          # Release may already exist, fetch it
          RESPONSE=$(curl -s \
            "https://gitee.com/api/v5/repos/${{ secrets.GITEE_OWNER }}/${{ secrets.GITEE_REPO }}/releases/tags/${{ steps.tag.outputs.TAG }}?access_token=${{ secrets.GITEE_TOKEN }}")
          RELEASE_ID=$(echo "$RESPONSE" | jq -r '.id')
        fi
        echo "RELEASE_ID=$RELEASE_ID" >> $GITHUB_OUTPUT

    - name: Upload assets to Gitee
      continue-on-error: true  # Per-file, so partial uploads are OK
      run: |
        shopt -s globstar nullglob
        for file in artifacts/**/*.exe artifacts/**/*.dmg artifacts/**/*.zip; do
          [ -f "$file" ] || continue
          echo "Uploading $file..."
          curl -s -X POST \
            "https://gitee.com/api/v5/repos/${{ secrets.GITEE_OWNER }}/${{ secrets.GITEE_REPO }}/releases/${{ steps.create_release.outputs.RELEASE_ID }}/attach_files" \
            -H "Content-Type: multipart/form-data" \
            -F "access_token=${{ secrets.GITEE_TOKEN }}" \
            -F "file=@$file"
        done
```

**Idempotency:** If re-run, the create release step handles the case where the release already exists by fetching the existing release ID. File uploads use `continue-on-error: true` per step so partial failures don't block other uploads.

**Gitee file size note:** Free Gitee repos have a ~100MB per-file limit. Current installers are well under this. If future builds exceed this, the upload will fail gracefully (logged, not fatal).

## File Changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/main/logger.ts` | New | Logger module with ring buffer + file rotation |
| `src/main/ipc.ts` | Modify | Add error mapping with HTTP status checks, add logger calls, add LOG_EXPORT handler, add 30s request timeout |
| `src/main/index.ts` | Modify | Initialize logger on startup, add --smoke-test support |
| `src/renderer/App.tsx` | Modify | Add `isError` flag to status, add "复制错误详情" button for error states |
| `src/renderer/components/Settings.tsx` | Modify | Add "导出诊断日志" button |
| `src/shared/types.ts` | Modify | Add `IPC.LOG_EXPORT` channel constant |
| `.github/workflows/build.yml` | Modify | Add smoke test step + gitee-sync job |
| `tests/logger.test.ts` | New | Unit tests for logger ring buffer and rotation |
| `tests/error-mapping.test.ts` | New | Unit tests for mapErrorToUserMessage |

## Out of Scope

- In-app feedback form / remote error reporting
- Full E2E testing on Windows
- Testing the packaged installer (only compiled source is smoke-tested)
- Download page website / object storage hosting
- Auto-update mechanism
