import { IconMoon, IconSun } from '@/components/Library/icons'
import { MONO, SERIF } from '@/components/Library/coverStyles'

interface Props {
  darkMode: boolean
  onToggleDark: () => void
}

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: '簡介',
    paragraphs: [
      '歡迎使用 Travel in Time（以下稱「本應用」或「本服務」）。我們重視使用者隱私與資料安全，特此說明本應用如何收集、使用、儲存及刪除資料。本政策適用於你使用本應用（包含行動 App、PWA 與桌面版本）。',
    ],
  },
  {
    title: '我們蒐集哪些資料',
    paragraphs: [
      '使用者提供（必要、由你上傳或建立）：電子書檔案（epub 等）、書籍檔名、書籍封面；使用者建立的內容（註記、書籤、閱讀進度、收藏等）；使用者在應用內輸入的文字。',
      '裝置與應用狀態（僅本機保存）：本機設定與偏好（字體、字型大小、主題、TTS 設定等）；程式版本資訊。',
      '第三方連線（非個人資料，但會與第三方伺服器通訊）：Google Fonts（載入遠端字型）；Electron 版自動更新機制檢查更新時會向更新服務發送請求。',
      '目前本應用並未整合任何分析/追蹤套件、廣告 SDK、地理位置 API、相機或麥克風授權，也未將使用者書籍或註記自動上傳到外部伺服器。',
    ],
  },
  {
    title: '資料用途',
    paragraphs: [
      '提供基本功能：在本機儲存電子書、展示封面、顯示與管理註記、書籤及閱讀進度等。',
      '檢查更新：Electron 的自動更新機制會檢查是否有新版，僅為版本更新用途。',
      '運行字型載入：載入 Google Fonts 以改善字型顯示。',
    ],
  },
  {
    title: '資料儲存與保存地點',
    paragraphs: [
      '多數資料僅儲存在使用者裝置上（例如 IndexedDB、localStorage、SQLite、App 沙盒檔案系統），不會自動上傳至我們的伺服器，除非你特別啟用或未來新增雲端備份功能。',
      '第三方請求（如 Google Fonts、更新伺服器）會在載入或檢查更新時發出 HTTPS 請求，可能使第三方接收到裝置的 IP 位址與相關連線資訊。',
    ],
  },
  {
    title: '資料分享與第三方',
    paragraphs: [
      '目前我們不會將使用者的書籍或註記分享或出售給第三方。若未來需與第三方分享資料，會在功能啟用前明確告知並取得使用者同意。',
      '第三方清單：Google Fonts（fonts.googleapis.com / fonts.gstatic.com）；更新伺服器（electron-updater 連線之主機）。',
    ],
  },
  {
    title: 'Cookie 與類似技術（PWA / 網頁版）',
    paragraphs: [
      '本 PWA 使用瀏覽器儲存（IndexedDB、Cache Storage、localStorage）來保存使用者書籍與設定；不會設置第三方追蹤 cookie。',
      '若你透過瀏覽器使用 PWA，瀏覽器與第三方資源（例如 Google Fonts）仍會進行標準的 HTTP 請求。',
    ],
  },
  {
    title: '資料安全',
    paragraphs: [
      '我們採取合理的技術與組織措施以保護本機儲存資料的安全（例如限制檔案讀取權限、使用 HTTPS 進行外部請求）。',
      '由於應用目前以本地為主，建議使用者妥善保管裝置與備份；若裝置遺失或被破解，本地資料亦有被他人存取的風險。',
    ],
  },
  {
    title: '資料保留',
    paragraphs: [
      '在本地儲存的資料會一直保留，除非使用者主動刪除或清除應用資料。若日後加入雲端備份功能，會另行說明保留期限與刪除機制。',
    ],
  },
  {
    title: '如何刪除資料',
    paragraphs: [
      'App（書庫）：長按或選擇該書 → 點「刪除」，即可移除該書及其本機註記/進度。',
      '刪除整個應用資料：Android 於設定 > 應用程式 > 儲存空間 > 清除資料；iOS 刪除 App 並重新安裝。',
      'PWA（瀏覽器）：於瀏覽器設定 > 隱私與安全性 > 清除瀏覽資料中移除本站資料。',
      '桌面版（Electron）：刪除系統中應用資料資料夾（macOS: ~/Library/Application Support/…）。',
      '若你啟用了任何會上傳至伺服器的功能，請聯絡 112182ssss@gmail.com 要求協助刪除，我們將於 30 天內回應處理。',
    ],
  },
  {
    title: '兒童隱私',
    paragraphs: [
      '本應用並非針對 13 歲以下兒童設計。若你為家長並發現兒童上傳個人資訊，請聯絡我們以便進行資料刪除。',
    ],
  },
  {
    title: '隱私權政策變更',
    paragraphs: [
      '本政策可能會隨著功能更新與法規變動而修訂；任何重大變更會在應用內公告或更新本頁面的生效日期。建議定期查看此政策。',
    ],
  },
  {
    title: '聯絡方式',
    paragraphs: [
      '若對本隱私權政策有疑問或想行使資料刪除權、查詢權，請聯絡：112182ssss@gmail.com',
    ],
  },
]

const Privacy = ({ darkMode, onToggleDark }: Props) => {
  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink3Col   = darkMode ? '#8a7f74' : '#9a8f80'

  return (
    <div className="flex flex-col min-h-screen" style={{ background: paperBg, color: inkCol }}>
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${borderCol}`, paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500 }}>隱私權政策</span>
        <button className="p-2 rounded-full transition ml-auto" style={{ color: ink3Col }} onClick={onToggleDark}>
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-y-auto px-4 py-10">
        <div
          style={{
            width: '100%', maxWidth: 640,
            background: paperBg2, border: `1px solid ${borderCol}`,
            borderRadius: 12, padding: '32px 28px',
          }}
        >
          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, marginBottom: 6, textAlign: 'center' }}>
            隱私權政策
          </h1>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: ink3Col, textAlign: 'center', marginBottom: 28 }}>
            TRAVEL IN TIME · 生效日期 2026-07-07
          </p>

          {SECTIONS.map((section) => (
            <div key={section.title} style={{ marginBottom: 22 }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                {section.title}
              </h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: 13, lineHeight: 1.75, color: inkCol, marginBottom: 8 }}>
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Privacy
