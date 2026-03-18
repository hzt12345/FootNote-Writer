import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDB } from './db'
import { registerIPC } from './ipc'

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

app.whenReady().then(() => {
  initDB()
  registerIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
