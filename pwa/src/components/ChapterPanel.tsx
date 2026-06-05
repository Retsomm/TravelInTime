import { useState } from 'react'
import { SERIF, MONO } from '@/constants/fonts'
import { useThemeColors } from '@/hooks/useThemeColors'

export interface TocItem {
  id: string
  href: string
  label: string
  subitems?: TocItem[]
}

interface RowProps {
  item: TocItem
  depth: number
  index: number
  activeHref: string | null
  onNavigate: (href: string) => void
  inkCol: string
  ink2Col: string
  ink3Col: string
  paperBg2: string
  accentCol: string
}

const findBestMatch = (items: TocItem[], file: string): string | null => {
  for (const item of items) {
    if (item.href.split('#')[0] === file) return item.href
    if (item.subitems?.length) {
      const sub = findBestMatch(item.subitems, file)
      if (sub) return sub
    }
  }
  return null
}

const TocRow = ({ item, depth, index, activeHref, onNavigate, inkCol, ink2Col, ink3Col, paperBg2, accentCol }: RowProps) => {
  const [open, setOpen] = useState(true)
  const hasChildren = (item.subitems?.length ?? 0) > 0
  const isActive = item.href === activeHref

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
          {isActive ? (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentCol, flexShrink: 0, marginRight: 12 }} />
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, width: 18, textAlign: 'right', marginRight: 10, flexShrink: 0, letterSpacing: '0.04em' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          {hasChildren && (
            <span
              role="button"
              tabIndex={-1}
              style={{ marginRight: 4, color: ink3Col, fontSize: 10, lineHeight: 1, flexShrink: 0, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
              aria-label={open ? '收合' : '展開'}
            >
              {open ? '▾' : '▸'}
            </span>
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
            item={sub} depth={depth + 1} index={si}
            activeHref={activeHref} onNavigate={onNavigate}
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
  embedded?: boolean
}

const ChapterPanel = ({ toc, currentHref, onNavigate, darkMode, embedded }: Props) => {
  const activeHref = findBestMatch(toc, currentHref)
  const { paperBg, paperBg2, borderCol, inkCol, ink2Col, ink3Col, accentCol } = useThemeColors(darkMode)

  const listContent = (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {toc.length === 0 ? (
        <p style={{ padding: 20, fontSize: 13, color: ink3Col, fontFamily: SERIF }}>此書籍無目錄資料</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {toc.map((item, i) => (
            <TocRow
              key={item.id || item.href}
              item={item} depth={0} index={i}
              activeHref={activeHref} onNavigate={onNavigate}
              inkCol={inkCol} ink2Col={ink2Col} ink3Col={ink3Col}
              paperBg2={paperBg2} accentCol={accentCol}
            />
          ))}
        </ul>
      )}
    </div>
  )

  if (embedded) return listContent

  return (
    <div style={{
      width: 320, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${borderCol}`,
      background: paperBg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderCol}`, flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, letterSpacing: '0.01em', color: inkCol }}>目錄</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: ink3Col, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>
          {toc.length} 章節
        </div>
      </div>
      {listContent}
    </div>
  )
}

export default ChapterPanel
