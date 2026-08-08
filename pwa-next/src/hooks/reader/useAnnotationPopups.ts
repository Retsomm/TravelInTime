import { useCallback, useRef, useState } from 'react'
import type { Rendition } from 'epubjs'
import type { Annotation } from '@/hooks/reader/useAnnotations'
import { copyTextToClipboard } from '@/components/Reader/annotationUtils'

export type PopupState = { left: number; top: number; cfi: string; text: string } | null
export type EditPopupState = { left: number; top: number; annotationId: string } | null

export const useAnnotationPopups = (params: {
  renditionRef: React.RefObject<Rendition | null>
  viewerRef: React.RefObject<HTMLDivElement | null>
  lastIframeClickRef: React.RefObject<{ x: number; y: number }>
  getChapterTitle: () => string
  annotations: Annotation[]
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateColor: (id: string, color: string) => void
  removeAnnotation: (id: string) => void
}) => {
  const { renditionRef, viewerRef, lastIframeClickRef, getChapterTitle, annotations, addAnnotation, updateColor, removeAnnotation } = params
  const [popup, setPopup] = useState<PopupState>(null)
  const [editPopup, setEditPopup] = useState<EditPopupState>(null)
  const pendingAnnotationCfiRef = useRef<string | null>(null)

  // 建立 annotation SVG 標記的 helper（使用 epub.js 內建 annotations，不修改 DOM 文字節點）
  const addEpubAnnotation = useCallback((
    rendition: Rendition,
    ann: { cfi: string; color: string; id: string }
  ) => {
    const annotationId = ann.id // closure 確保 id 可用，不依賴 callback 參數
    try {
      rendition.annotations.add(
        'underline',
        ann.cfi,
        { id: ann.id },
        // 不依賴 epubjs callback 傳入的 event（版本差異大，可能為 undefined）
        // 改為直接從 iframe DOM 找到該 annotation 的 SVG 元素，計算其位置
        () => {
          // marks-pane 的 SVG 在 outer document，直接用 document.querySelector
          const annEl = document.querySelector(`.ann-${annotationId}`)
          let x: number
          let y: number
          if (annEl) {
            const r = annEl.getBoundingClientRect()
            x = r.left + r.width / 2
            y = r.top
          } else {
            x = lastIframeClickRef.current?.x ?? 0
            y = lastIframeClickRef.current?.y ?? 0
          }

          setPopup(null)
          setEditPopup({
            left: Math.min(Math.max(x, 115), window.innerWidth - 115),
            top: y - 52 >= 8 ? y - 52 : Math.min(y + 8, window.innerHeight - 52),
            annotationId,
          })
        },
        `ann-${ann.id}`,
        { stroke: ann.color, 'stroke-opacity': '1', 'stroke-width': '1.5', fill: 'none' }
      )
    } catch { /* ignore */ }
    // hooks.render 比 contents 就緒早，可能 inject 失敗；延遲以 clear+inject 補渲染
    setTimeout(() => {
      if (!document.querySelector(`g.ann-${ann.id} line`)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const annApi = rendition.annotations as any
        rendition.views().forEach((view: unknown) => {
          annApi.clear(view)
          annApi.inject(view)
        })
      }
    }, 300)
  }, [lastIframeClickRef])

  const addPendingAnnotation = useCallback((rendition: Rendition, cfi: string) => {
    if (pendingAnnotationCfiRef.current) {
      try { rendition.annotations.remove(pendingAnnotationCfiRef.current, 'underline') } catch {}
    }
    pendingAnnotationCfiRef.current = cfi
    try {
      rendition.annotations.add('underline', cfi, {}, undefined, 'tit-pending',
        { stroke: '#6366f1', 'stroke-opacity': '0.8', 'stroke-width': '2.5', fill: 'none' })
    } catch {}
  }, [])

  const removePendingAnnotation = useCallback((rendition: Rendition) => {
    if (!pendingAnnotationCfiRef.current) return
    try { rendition.annotations.remove(pendingAnnotationCfiRef.current, 'underline') } catch {}
    pendingAnnotationCfiRef.current = null
  }, [])

  const handleHighlight = (color: string) => {
    if (!popup) return
    const iframe = viewerRef.current?.querySelector('iframe')
    const win = iframe?.contentWindow
    if (win) win.getSelection()?.removeAllRanges()
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)

    const ann = { cfi: popup.cfi, text: popup.text, color, chapter: getChapterTitle() }
    const id = addAnnotation(ann)

    if (renditionRef.current) {
      addEpubAnnotation(renditionRef.current, { cfi: popup.cfi, color, id })
    }

    setPopup(null)
  }

  const handleSearchSelectedText = () => {
    if (!popup) return
    const text = popup.text.trim()
    if (!text) return

    const iframe = viewerRef.current?.querySelector('iframe')
    iframe?.contentWindow?.getSelection()?.removeAllRanges()
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setPopup(null)
  }

  const handleCopySelectedText = async () => {
    if (!popup) return
    const text = popup.text.trim()
    if (!text) return

    const iframe = viewerRef.current?.querySelector('iframe')
    iframe?.contentWindow?.getSelection()?.removeAllRanges()
    if (renditionRef.current) removePendingAnnotation(renditionRef.current)
    await copyTextToClipboard(text)
    setPopup(null)
  }

  const handleChangeColor = (id: string, color: string) => {
    const ann = annotations.find((a) => a.id === id)
    if (ann && renditionRef.current) {
      try { renditionRef.current.annotations.remove(ann.cfi, 'underline') } catch { /* ignore */ }
      addEpubAnnotation(renditionRef.current, { cfi: ann.cfi, color, id })
    }
    updateColor(id, color)
  }

  const handleDeleteMark = (id: string) => {
    const ann = annotations.find((a) => a.id === id)
    if (ann) {
      try { renditionRef.current?.annotations.remove(ann.cfi, 'underline') } catch { /* ignore */ }
    }
    removeAnnotation(id)
    setEditPopup(null)
  }

  const handleEditColor = (id: string, color: string) => {
    handleChangeColor(id, color)
    setEditPopup(null)
  }

  const handleNavigateToAnnotation = (cfi: string) => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.display(cfi)
      .then(() => {
        // epub.js 的 Annotations 只在 hooks.render 觸發（新章節第一次渲染）時，才會依
        // sectionIndex 自動把已註冊的 SVG 標記重新掛回 view 上（見 epubjs annotations.js
        // 的 constructor：this.rendition.hooks.render.register(this.inject)）。跳到「同一
        // 章節內的不同位置」時 epub.js 可能重複使用既有 view、不會重新觸發 hooks.render，
        // 導致這個章節既有的劃線標記沒有被補畫出來。這裡延遲一小段時間讓 view 穩定後，
        // 強制對目前所有 view 重新 clear + inject 一次，跟 addEpubAnnotation 的自我修復
        // 邏輯是同一招。
        setTimeout(() => {
          const currentRendition = renditionRef.current
          if (!currentRendition) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annApi = currentRendition.annotations as any
          currentRendition.views().forEach((view: unknown) => {
            annApi.clear(view)
            annApi.inject(view)
          })
        }, 300)
      })
      .catch((err: unknown) => {
        console.warn('[Reader] 跳轉至註記失敗（No Section Found？）:', err)
      })
  }

  return {
    popup, setPopup,
    editPopup, setEditPopup,
    pendingAnnotationCfiRef,
    addEpubAnnotation,
    addPendingAnnotation,
    removePendingAnnotation,
    handleHighlight,
    handleSearchSelectedText,
    handleCopySelectedText,
    handleChangeColor,
    handleDeleteMark,
    handleEditColor,
    handleNavigateToAnnotation,
  }
}
