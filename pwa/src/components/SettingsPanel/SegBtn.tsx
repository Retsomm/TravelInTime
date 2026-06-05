interface SegBtnProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  paperBg: string
  inkCol: string
  ink3Col: string
}

const SegBtn = ({ active, onClick, children, paperBg, inkCol, ink3Col }: SegBtnProps) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, height: 26, borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
      background: active ? paperBg : 'transparent',
      color: active ? inkCol : ink3Col,
      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      cursor: 'pointer', transition: 'all .12s',
    }}
  >
    {children}
  </button>
)

export default SegBtn
