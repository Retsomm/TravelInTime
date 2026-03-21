import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 可在此擴充 IPC API
})
