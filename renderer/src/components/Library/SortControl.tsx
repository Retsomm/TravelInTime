import { MONO, SERIF } from '@/components/Library/coverStyles'

export type SortKey = 'recent' | 'title' | 'progress'

interface Props {
  count: number
  sort: SortKey
  paperBg: string
  paperBg2: string
  borderCol: string
  inkCol: string
  ink3Col: string
  onSortChange: (sort: SortKey) => void
}

const SortControl = ({ count, sort, paperBg, paperBg2, borderCol, inkCol, ink3Col, onSortChange }: Props) => (
  <div className="flex items-baseline justify-between flex-wrap gap-3" style={{ padding: '22px 40px 14px' }}>
    <div>
      <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, letterSpacing: '-0.005em' }}>書庫</span>
      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', marginLeft: 10, color: ink3Col }}>
        {String(count).padStart(2, '0')} {count === 1 ? 'VOLUME' : 'VOLUMES'}
      </span>
    </div>

    <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: paperBg2, border: `1px solid ${borderCol}` }}>
      {(['recent', 'title', 'progress'] as SortKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onSortChange(key)}
          style={{ height: 26, padding: '0 10px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: sort === key ? paperBg : 'transparent', color: sort === key ? inkCol : ink3Col, boxShadow: sort === key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', transition: 'all .15s' }}
        >
          {key === 'recent' ? '最近閱讀' : key === 'title' ? '書名' : '進度'}
        </button>
      ))}
    </div>
  </div>
)

export default SortControl
