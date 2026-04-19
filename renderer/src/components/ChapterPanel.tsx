import { useState } from 'react'

export interface TocItem {
  id: string
  href: string
  label: string
  subitems?: TocItem[]
}

const SERIF = '"Source Serif 4", "Noto Serif TC", Georgia, serif'
const MONO  = '"JetBrains Mono", ui-monospace, monospace'

interface RowProps {
  item: TocItem
  depth: number
  index: number
  currentHref: string
  onNavigate: (href: string) => void
  inkCol: string
  ink2Col: string
  ink3Col: string
  paperBg2: string
  accentCol: string
}

const TocRow = ({ item, depth, index, currentHref, onNavigate, inkCol, ink2Col, ink3Col, paperBg2, accentCol }: RowProps) => {
  const [open, setOpen] = useState(true)
  const hasChildren = (item.subitems?.length ?? 0) > 0
  const isActive = item.href.split('#')[0] === currentHref

  return (
    <>
      <li>
        <button
          style={{
            display: 'flex', alignItems: 'center', width: '100%',
            padding: `10px ${16 + depth * 12}px 10px 20px`,
            textAlign: 'left',
            background: isActive ? paperBg2 : 'transparent',
            color: isActive ? inkCol : depth > 0 ? ink3Col : ink2Col,
            transition: 'background .12s',
          }}
          onClick={() => onNavigate(item.href)}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = paperBg2 }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          {/* Leading indicator */}
          {isActive ? (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentCol, flexShrink: 0, marginRight: 12 }} />
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, width: 18, textAlign: 'right', marginRight: 10, flexShrink: 0, letterSpacing: '0.04em' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
          )}

          {hasChildren && (
            <button
              style={{ marginRight: 4, color: ink3Col, fontSize: 10, lineHeight: 1, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
              aria-label={open ? '收合' : '展開'}
            >
              {open ? '▾' : '▸'}
            </button>
          )}

          <span style={{ flex: 1, fontFamily: SERIF, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>

          {isActive && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.06em', flexShrink: 0, marginLeft: 8 }}>
              正在閱讀
            </span>
          )}
        </button>
      </li>
      {hasChildren && open &&
        item.subitems!.map((sub, si) => (
          <TocRow
            key={sub.id || sub.href}
            item={sub}
            depth={depth + 1}
            index={si}
            currentHref={currentHref}
            onNavigate={onNavigate}
            inkCol={inkCol} ink2Col={ink2Col} ink3Col={ink3Col}
            paperBg2={paperBg2} accentCol={accentCol}
          />
        ))
      }
    </>
  )
}

interface Props {
  toc: TocItem[]
  currentHref: string
  onNavigate: (href: string) => void
  darkMode?: boolean
}

const ChapterPanel = ({ toc, currentHref, onNavigate, darkMode }: Props) => {
  const paperBg   = darkMode ? '#1a1816' : '#f9f7f2'
  const paperBg2  = darkMode ? '#231f1c' : '#f1ede4'
  const borderCol = darkMode ? '#3a3430' : '#e4ddd0'
  const inkCol    = darkMode ? '#e8e0d4' : '#2a2420'
  const ink2Col   = darkMode ? '#b8afa4' : '#5a4e44'
  const ink3Col   = darkMode ? '#7a706a' : '#9a8f80'
  const accentCol = 'oklch(0.62 0.14 40)'

  return (
    <div style={{
      width: 320, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>
          目錄
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>
          {toc.length} 章節
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {toc.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: ink3Col, fontFamily: SERIF }}>此書籍無目錄資料</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
            {toc.map((item, i) => (
              <TocRow
                key={item.id || item.href}
                item={item}
                depth={0}
                index={i}
                currentHref={currentHref}
                onNavigate={onNavigate}
                inkCol={inkCol} ink2Col={ink2Col} ink3Col={ink3Col}
                paperBg2={paperBg2} accentCol={accentCol}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ChapterPanel
