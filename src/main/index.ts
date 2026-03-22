import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDB } from './db'
import { registerIPC } from './ipc'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'FootNote Writer — 学术写作脚注助手',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // In development (with Vite dev server), load from localhost; otherwise load built files
  if (process.env.VITE_DEV_SERVER === 'true') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  // Uncomment for debugging:
  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  const isSmokeTest = process.argv.includes('--smoke-test')

  logger.init(app.getPath('userData'))
  logger.info('app', `FootNote Writer ${app.getVersion()} started on ${process.platform} ${process.arch}`)

  initDB()
  registerIPC()
  createWindow()

  if (isSmokeTest && mainWindow) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log(`[renderer] ${message}`)
    })

    const timeout = setTimeout(() => {
      console.error('Smoke test FAILED: timed out after 15s')
      app.exit(1)
    }, 15000)

    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const hasContent = await mainWindow!.webContents.executeJavaScript(
          'document.getElementById("root").children.length > 0'
        )
        if (hasContent) {
          console.log('Smoke test PASSED: renderer loaded, React rendered')
          clearTimeout(timeout)
          app.exit(0)
        } else {
          console.error('Smoke test FAILED: root element has no children')
          clearTimeout(timeout)
          app.exit(1)
        }
      } catch (err) {
        console.error('Smoke test FAILED:', err)
        clearTimeout(timeout)
        app.exit(1)
      }
    })
  } else {
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  }
})

app.on('window-all-closed', () => {
  logger.info('app', 'All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
