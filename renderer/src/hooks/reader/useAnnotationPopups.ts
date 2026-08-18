import { useCallback, useState } from 'react'
import type { Rendition } from 'epubjs'
import type { Annotation } from '@/hooks/reader/useAnnotations'
import { copyTextToClipboard } from '@/components/Reader/annotationUtils'
import { DEBUG_ANNOTATIONS } from '@/constants/debug'

export type PopupState = { x: number; y: number; cfi: string; text: string } | null
export type EditPopupState = { x: number; y: number; annotationId: string } | null

export const useAnnotationPopups = (params: {
  renditionRef: React.RefObject<Rendition | null>
  viewerRef: React.RefObject<HTMLDivElement | null>
  lastIframeClickRef: React.RefObject<{ x: number; y: number }>
  getChapterTitle: () => string
  annotations: Annotation[]
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt'>) => string
  updateColor: (id: string, color: string) => void
  removeAnnotation: (id: string) => void
}) => {
  const { renditionRef, viewerRef, lastIframeClickRef, getChapterTitle, annotations, addAnnotation, updateColor, removeAnnotation } = params
  const [popup, setPopup] = useState<PopupState>(null)
  const [editPopup, setEditPopup] = useState<EditPopupState>(null)

  // 除錯用：檢查 g.ann-{id} line 元素「存在於 DOM」不等於「畫面上看得到」，
  // 這裡把實際的線段座標、bounding rect、computed style 一起印出來，
  // 用來分辨是「元素根本沒建立」還是「元素建立了但座標/樣式導致看不到」。
  const logAnnotationGeometry = (id: string, label: string) => {
    if (!DEBUG_ANNOTATIONS) return
    const g = document.querySelector(`g.ann-${id}`)
    const line = document.querySelector(`g.ann-${id} line`)
    if (!g || !line) {
      console.log('[Annotation] geometry', label, { id, gFound: !!g, lineFound: !!line })
      return
    }
    const rect = (line as SVGLineElement).getBoundingClientRect()
    const svg = line.closest('svg')
    const svgRect = svg?.getBoundingClientRect()
    const cs = window.getComputedStyle(line as Element)
    console.log('[Annotation] geometry', label, {
      id,
      x1: line.getAttribute('x1'), y1: line.getAttribute('y1'),
      x2: line.getAttribute('x2'), y2: line.getAttribute('y2'),
      lineRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      svgRect: svgRect ? { left: svgRect.left, top: svgRect.top, width: svgRect.width, height: svgRect.height } : null,
      stroke: cs.stroke, strokeOpacity: cs.strokeOpacity, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
    })
  }

  // 建立 annotation SVG 標記的 helper（使用 epub.js 內建 annotations，不修改 DOM 文字節點）
  const addEpubAnnotation = useCallback((
    rendition: Rendition,
    ann: { cfi: string; color: string; id: string }
  ) => {
    const annotationId = ann.id // closure 確保 id 可用，不依賴 callback 參數
    if (DEBUG_ANNOTATIONS) console.log('[Annotation] addEpubAnnotation 呼叫', { id: ann.id, cfi: ann.cfi, color: ann.color, viewCount: rendition.views().length })
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
          setEditPopup({ x, y, annotationId })
        },
        `ann-${ann.id}`,
        { stroke: ann.color, 'stroke-opacity': '1', 'stroke-width': '1.5', fill: 'none' }
      )
      if (DEBUG_ANNOTATIONS) console.log('[Annotation] rendition.annotations.add() 成功', { id: ann.id })
    } catch (err) {
      if (DEBUG_ANNOTATIONS) console.log('[Annotation] rendition.annotations.add() 拋出例外', { id: ann.id, err })
    }
    if (DEBUG_ANNOTATIONS) {
      logAnnotationGeometry(ann.id, 'add() 呼叫後立即檢查（同步 tick）')
      setTimeout(() => logAnnotationGeometry(ann.id, '50ms 後'), 50)
    }
    // hooks.render 比 contents 就緒早，可能 inject 失敗；延遲以 clear+inject 補渲染
    setTimeout(() => {
      try {
        const found = !!document.querySelector(`g.ann-${ann.id} line`)
        if (DEBUG_ANNOTATIONS) {
          console.log('[Annotation] addEpubAnnotation 300ms 自我修復檢查', { id: ann.id, foundInDom: found, viewCount: rendition.views().length })
          logAnnotationGeometry(ann.id, '300ms 檢查點')
        }
        if (!found) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const annApi = rendition.annotations as any
          rendition.views().forEach((view: unknown) => {
            annApi.clear(view)
            annApi.inject(view)
          })
          if (DEBUG_ANNOTATIONS) {
            const foundAfter = !!document.querySelector(`g.ann-${ann.id} line`)
            console.log('[Annotation] addEpubAnnotation 300ms clear+inject 後', { id: ann.id, foundAfter })
            logAnnotationGeometry(ann.id, '300ms clear+inject 後')
          }
        }
      } catch (err) {
        if (DEBUG_ANNOTATIONS) console.log('[Annotation] 300ms 自我修復拋出例外（rendition 可能已銷毀）', { id: ann.id, err })
      }
    }, 300)
    if (DEBUG_ANNOTATIONS) setTimeout(() => logAnnotationGeometry(ann.id, '1000ms 後（確認是否事後自行修正）'), 1000)
  }, [lastIframeClickRef])

  const handleHighlight = (color: string) => {
    if (!popup) return
    const iframe = viewerRef.current?.querySelector('iframe')
    const win = iframe?.contentWindow
    if (win) win.getSelection()?.removeAllRanges()

    const ann = { cfi: popup.cfi, text: popup.text, color, chapter: getChapterTitle() }
    const id = addAnnotation(ann)
    if (DEBUG_ANNOTATIONS) {
      const iframe = viewerRef.current?.querySelector('iframe')
      const iframeRect = iframe?.getBoundingClientRect()
      const iframeStyle = iframe ? window.getComputedStyle(iframe) : null
      console.log('[Annotation] handleHighlight 新增', {
        id, cfi: popup.cfi, hasRendition: !!renditionRef.current,
        popupXY: { x: popup.x, y: popup.y },
        iframeRect: iframeRect ? { left: iframeRect.left, top: iframeRect.top, width: iframeRect.width, height: iframeRect.height } : null,
        iframeTransform: iframeStyle?.transform,
      })
    }

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
    window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setPopup(null)
  }

  const handleCopySelectedText = async () => {
    if (!popup) return
    const text = popup.text.trim()
    if (!text) return

    const iframe = viewerRef.current?.querySelector('iframe')
    iframe?.contentWindow?.getSelection()?.removeAllRanges()
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
    renditionRef.current?.display(cfi).catch((err: unknown) => {
      console.warn('[Reader] 跳轉至註記失敗（No Section Found？）:', err)
    })
  }

  return {
    popup, setPopup,
    editPopup, setEditPopup,
    addEpubAnnotation,
    handleHighlight,
    handleSearchSelectedText,
    handleCopySelectedText,
    handleChangeColor,
    handleDeleteMark,
    handleEditColor,
    handleNavigateToAnnotation,
  }
}
