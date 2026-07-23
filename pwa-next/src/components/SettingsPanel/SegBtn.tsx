interface SegBtnProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

const SegBtn = ({ active, onClick, children }: SegBtnProps) => (
  <button
    onClick={onClick}
    className={`flex-1 h-6.5 rounded-md text-xs font-[inherit] cursor-pointer transition-all duration-120 ${
      active ? 'bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'bg-transparent text-ink-3 shadow-none'
    }`}
  >
    {children}
  </button>
)

export default SegBtn
