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
    if (typeof origUnderline === 'function') proto.underline = new Proxy(origUnderline as (...a: unknown[]) => unknown, {
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

