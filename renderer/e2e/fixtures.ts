import { test as base } from '@playwright/test'

// 在 Vite preview 環境中注入空的 electronAPI mock，
// 模擬 Electron contextBridge 的行為
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // @ts-ignore
      window.electronAPI = {}
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'
