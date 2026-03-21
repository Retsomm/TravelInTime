import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as path from 'path'
import { autoUpdater } from 'electron-updater'

const isDev = process.env.NODE_ENV === 'development'

const iconPath = path.join(app.getAppPath(), 'electron/assets/logo.png')

const setupAutoUpdater = (win: BrowserWindow) => {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', () => {
    win.webContents.send('update-status', 'downloading')
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '有新版本可用',
      message: '新版本已下載完成，重新啟動後將自動安裝。',
      buttons: ['立即重啟', '稍後'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.checkForUpdatesAndNotify()
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    if (!isDev) setupAutoUpdater(win)
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/dist/index.html'))
  }
}

ipcMain.handle('get-app-version', () => app.getVersion())

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(iconPath)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
