import { test, expect } from './fixtures'

test.describe('書庫頁面（空書庫）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('應顯示 Travel in Time 標題', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Travel in Time' })).toBeVisible()
  })

  test('應顯示「匯入 ePub 書籍」按鈕', async ({ page }) => {
    await expect(page.getByRole('button', { name: '匯入 ePub 書籍' })).toBeVisible()
  })

  test('檔案選擇器只接受 .epub 格式', async ({ page }) => {
    const input = page.locator('input[type="file"]')
    await expect(input).toHaveAttribute('accept', '.epub')
  })

  test('應顯示深色模式切換按鈕', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /切換深色模式|切換淺色模式/ })
    ).toBeVisible()
  })
})

test.describe('書庫頁面（深色模式）', () => {
  test('點擊深色模式按鈕後根元素應套用 dark class', async ({ page }) => {
    await page.goto('/')
    const toggleBtn = page.getByRole('button', { name: /切換深色模式/ })
    await toggleBtn.click()
    // App 的根 div 會加上 dark class
    const rootDiv = page.locator('div.dark').first()
    await expect(rootDiv).toBeVisible()
  })

  test('深色模式下背景應使用 dark 色系', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /切換深色模式/ }).click()
    const mainDiv = page.locator('.dark\\:bg-gray-900').first()
    await expect(mainDiv).toBeVisible()
  })
})
