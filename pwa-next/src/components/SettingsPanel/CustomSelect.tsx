import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import styles from './CustomSelect.module.css'

interface SelectOption { label: string; value: string }

interface CustomSelectProps {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  ariaLabel?: string
  borderCol: string
  inkCol: string
  ink3Col: string
  paperBg: string
  paperBg2: string
}

const CustomSelect = ({
  value, options, onChange, ariaLabel,
  borderCol, inkCol, ink3Col, paperBg, paperBg2,
}: CustomSelectProps) => {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const listboxId = useId()
  const getOptionId = (i: number) => `${listboxId}-option-${i}`

  const openDropdown = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedH = Math.min(options.length * 32 + 8, 240)
    const showAbove = spaceBelow < estimatedH && rect.top > estimatedH
    setDropdownStyle({
      position: 'fixed', left: rect.left, width: rect.width,
      ...(showAbove ? { bottom: window.innerHeight - rect.top, top: 'auto' } : { top: rect.bottom, bottom: 'auto' }),
      zIndex: 9999,
    })
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const commitActive = (index: number) => {
    const opt = options[index]
    if (!opt) return
    onChange(opt.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commitActive(activeIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        style={{ '--paper-bg-2': paperBg2, '--border-col': borderCol, '--ink-col': inkCol, '--ink3-col': ink3Col } as CSSProperties}
        onClick={() => open ? setOpen(false) : openDropdown()}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? getOptionId(activeIndex) : undefined}
      >
        <span className={styles.triggerLabel}>{selected?.label ?? ''}</span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listboxId}
          className={styles.listbox}
          style={{ ...dropdownStyle, '--paper-bg': paperBg, '--paper-bg-2': paperBg2, '--border-col': borderCol, '--ink-col': inkCol, '--ink3-col': ink3Col } as CSSProperties}
          role="listbox"
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              id={getOptionId(i)}
              role="option"
              aria-selected={o.value === value}
              className={styles.option}
              data-selected={o.value === value || undefined}
              data-active={i === activeIndex || undefined}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CustomSelect
