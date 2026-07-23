interface NumStepperProps {
  value: string
  onDec: () => void
  onInc: () => void
}

const NumStepper = ({ value, onDec, onInc }: NumStepperProps) => (
  <div className="inline-flex items-center border border-border rounded-lg overflow-hidden h-7.5 bg-paper">
    <button
      onClick={onDec}
      className="w-7.5 h-7.5 text-ink-3 text-sm font-[inherit] cursor-pointer transition-colors duration-120 hover:bg-paper-2"
    >−</button>
    <span className="w-14.5 text-center text-[13px] text-ink font-ui-mono border-l border-r border-border h-7.5 inline-flex items-center justify-center tracking-[0.02em]">
      {value}
    </span>
    <button
      onClick={onInc}
      className="w-7.5 h-7.5 text-ink-3 text-sm font-[inherit] cursor-pointer transition-colors duration-120 hover:bg-paper-2"
    >＋</button>
  </div>
)

export default NumStepper
