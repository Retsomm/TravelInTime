let replaceCssRejectionGuardInstalled = false

// epub.js bug 修補（保底）：book.destroy() 後 this.resources 變成 undefined，若此時
// book.js 內部有任何非同步鏈（目前已知至少 replacements()、store() 兩處）仍在跑到
// `this.resources.replaceCss()` 這一行，就會丟出未被接住的 "Cannot read properties of
// undefined (reading 'replaceCss')"。patchBookPrototype 只包住 replacements() 這一個路徑，
// 為了不用逐一找出 book.js 裡所有可能踩到的內部呼叫點，這裡改成直接攔截這個特定、已知無害
// （book 已經沒人在乎的舊實例）的 unhandledrejection，避免它被 Next.js dev overlay 當成
// 當機錯誤擋住畫面。只裝一次，多次呼叫是安全的。
export const suppressReplaceCssRejection = () => {
  if (replaceCssRejectionGuardInstalled || typeof window === 'undefined') return
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof TypeError && /reading 'replaceCss'/.test(event.reason.message)) {
      event.preventDefault()
    }
  })
  replaceCssRejectionGuardInstalled = true
}

export const patchBookPrototype = (bookProto: any) => {
  if (!bookProto.replacements || bookProto._replacementsGuard) return
  const orig = bookProto.replacements
  bookProto.replacements = new Proxy(orig, {
    apply(target, thisArg: { resources?: unknown }, args: unknown[]) {
      // epub.js bug 修補：book.destroy() 後 this.resources 會變成 undefined，
      // 若此時 replacements()/replaceCss() 的非同步鏈仍在跑，會噴
      // "Cannot read properties of undefined (reading 'replaceCss')"。
      // book 已經 destroy 時代表這個結果已經沒人在乎了，靜默吞掉即可。
      return (target.apply(thisArg, args) as Promise<unknown>).catch((e: unknown) => {
        if (!thisArg.resources) return
        throw e
      })
    },
  })
  bookProto._replacementsGuard = true
}

export const patchRenditionPrototype = (renditionProto: any) => {
  if (!renditionProto.injectIdentifier || renditionProto._injectIdentifierGuard) return
  const orig = renditionProto.injectIdentifier
  renditionProto.injectIdentifier = new Proxy(orig, {
    apply(target, thisArg: { book?: { packaging?: unknown } }, args: [Document, unknown]) {
      if (!thisArg.book?.packaging) return args[0]
      return target.apply(thisArg, args)
    },
  })
  renditionProto._injectIdentifierGuard = true
}

export const patchIframeViewPrototype = (proto: Record<string, unknown>) => {
  if (!proto._nullRangeGuard) {
    const origUnderline = proto.underline
    if (typeof origUnderline === 'function') {
      proto.underline = new Proxy(origUnderline as (...a: unknown[]) => unknown, {
        apply(target, thisArg: Record<string, unknown>, args: unknown[]) {
          if (!thisArg.contents) return null
          // 必須先確認 range 非 null 才可建立 Underline；
          // 若讓 null range 進入 Underline constructor，pane.render() 時
          // getClientRects() 會 crash，導致整個 pane 的 SVG 全部消失
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const range = (thisArg.contents as any).range?.(args[0])
          if (!range) return null
          return target.apply(thisArg, args)
        },
      })
    }
    proto._nullRangeGuard = true
  }
  if (!proto._reframeGuard) {
    const origReframe = proto.reframe as ((...a: unknown[]) => unknown) | undefined
    if (typeof origReframe === 'function') {
      proto.reframe = new Proxy(origReframe, {
        apply(target, thisArg: unknown, args: unknown[]) {
          try { return target.apply(thisArg, args) } catch (e) {
            console.warn('[epubjs] reframe null range 異常，已略過:', e)
          }
        },
      })
    }
    proto._reframeGuard = true
  }
}
