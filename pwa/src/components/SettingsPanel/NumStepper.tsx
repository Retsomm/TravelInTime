import { MONO } from '@/constants/fonts'

interface NumStepperProps {
  value: string
  onDec: () => void
  onInc: () => void
  borderCol: string
  inkCol: string
  ink3Col: string
  paperBg: string
  paperBg2: string
}

const NumStepper = ({ value, onDec, onInc, borderCol, inkCol, ink3Col, paperBg, paperBg2 }: NumStepperProps) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center',
    border: `1px solid ${borderCol}`, borderRadius: 8, overflow: 'hidden', height: 30,
    background: paperBg,
  }}>
    <button
      onClick={onDec}
      style={{ width: 30, height: 30, color: ink3Col, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', transition: 'background .12s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >−</button>
    <span style={{
      width: 58, textAlign: 'center', fontSize: 13, color: inkCol,
      fontFamily: MONO, borderLeft: `1px solid ${borderCol}`, borderRight: `1px solid ${borderCol}`,
      height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: '0.02em',
    }}>{value}</span>
    <button
      onClick={onInc}
      style={{ width: 30, height: 30, color: ink3Col, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', transition: 'background .12s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = paperBg2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >＋</button>
  </div>
)

export default NumStepper
