import { useId } from 'react'
import { SERIF } from '@/components/Library/coverStyles'
import { useModalA11y } from '@/hooks/useModalA11y'

const ConfirmModal = ({ bookTitle, onConfirm, onCancel }: { bookTitle: string; onConfirm: () => void; onCancel: () => void }) => {
  const titleId = useId()
  const containerRef = useModalA11y(onCancel)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl p-6 w-80 max-w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} style={{ fontFamily: SERIF }} className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-2">確認刪除書籍</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
          確定要刪除《{bookTitle}》？<br />書籍與所有相關註解將一併移除，無法復原。
        </p>
        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 rounded-xl text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition" onClick={onCancel}>取消</button>
          <button className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition" onClick={onConfirm}>確認刪除</button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
