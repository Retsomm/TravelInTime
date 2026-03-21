import { test, expect } from './fixtures'

test.describe('無障礙基礎檢查', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('頁面 title 不應為空', async ({ page }) => {
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('深色模式按鈕應有 aria-label', async ({ page }) => {
    const btn = page.getByRole('button', { name: /切換深色模式|切換淺色模式/ })
    await expect(btn).toHaveAttribute('aria-label')
  })

  test('匯入按鈕不應在初始狀態下被 disabled', async ({ page }) => {
    const btn = page.getByRole('button', { name: '匯入 ePub 書籍' })
    await expect(btn).not.toBeDisabled()
  })
})
