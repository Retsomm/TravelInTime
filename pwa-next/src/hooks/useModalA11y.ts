import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// 開啟時把焦點移進對話框、Tab 循環鎖在對話框內、Esc 關閉、關閉時把焦點還給開啟前的元素。
// 背景元素在視覺上被遮罩擋住滑鼠點擊，但鍵盤 Tab 預設不受遮罩限制，所以要靠這個 focus trap
// 確保鍵盤使用者在對話框開啟期間也碰不到背景控制項。
export const useModalA11y = (onClose: () => void) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    focusable?.[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return containerRef
}
