interface SectTitleProps {
  children: React.ReactNode
}

const SectTitle = ({ children }: SectTitleProps) => (
  <div className="font-ui-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 mb-2.5">
    {children}
  </div>
)

export default SectTitle
