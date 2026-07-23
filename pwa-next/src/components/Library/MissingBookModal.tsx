import { SERIF } from '@/components/Library/coverStyles'

interface Props {
  bookTitle: string
  onReimport: () => void
  onCancel: () => void
}

// 書本檔案不見了（本機儲存可能被清除，但書庫清單/進度/書籤/註記還在）時的提示。
// 因為書本 id 是內容 hash，重新匯入同一份 epub 會自動接回這筆既有紀錄。
const MissingBookModal = ({ bookTitle, onReimport, onCancel }: Props) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl p-6 w-80 max-w-full mx-4" onClick={(e) => e.stopPropagation()}>
      <h2 style={{ fontFamily: SERIF }} className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-2">找不到書本內容</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
        《{bookTitle}》的檔案內容不見了，可能是瀏覽器儲存被清除。<br />
        請重新匯入同一份 epub 檔案，閱讀進度、書籤、註記都還在，不會遺失。
      </p>
      <div className="flex gap-3 justify-end">
        <button className="px-4 py-2 rounded-xl text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition" onClick={onCancel}>取消</button>
        <button className="px-4 py-2 rounded-xl text-sm font-medium bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-800 hover:opacity-90 transition" onClick={onReimport}>重新匯入</button>
      </div>
    </div>
  </div>
)

export default MissingBookModal
