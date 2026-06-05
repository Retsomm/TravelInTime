import { MONO } from '@/constants/fonts'

interface SectTitleProps {
  children: React.ReactNode
  ink3Col: string
}

const SectTitle = ({ children, ink3Col }: SectTitleProps) => (
  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink3Col, marginBottom: 10 }}>
    {children}
  </div>
)

export default SectTitle
