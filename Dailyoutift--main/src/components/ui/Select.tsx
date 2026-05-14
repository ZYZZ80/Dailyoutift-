import React, { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  id?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  size = 'md',
  disabled = false,
  className = '',
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const autoId = useId()
  const listId = `select-list-${id ?? autoId}`

  const selectedOption = options.find(o => o.value === value)

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open && highlighted >= 0) {
          onChange(options[highlighted].value)
          setOpen(false)
        } else {
          setOpen(o => !o)
        }
        break
      case 'Escape':
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        setHighlighted(h => Math.min(h + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlighted(h => Math.max(h - 1, 0))
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && highlighted >= 0) {
      const item = listRef.current?.children[highlighted] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted, open])

  // Reset highlight to selected option index when opening
  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value)
      setHighlighted(idx >= 0 ? idx : 0)
    }
  }, [open, value, options])

  const triggerClasses = [
    'flex items-center justify-between w-full border border-[#E8E4DF] bg-white text-charcoal rounded-xl transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush',
    open ? 'ring-2 ring-blush' : 'hover:border-blush',
    disabled ? 'opacity-50 cursor-not-allowed bg-surface-overlay' : 'cursor-pointer',
    size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-2.5 text-sm',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        className={triggerClasses}
      >
        <span className={selectedOption ? 'text-charcoal' : 'text-charcoal-muted'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={[
            'w-4 h-4 text-charcoal-muted flex-shrink-0 transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Options"
          className="absolute z-50 mt-1 w-full bg-white border border-[#E8E4DF] rounded-xl shadow-lg max-h-60 overflow-auto py-1 animate-slide-down"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            const isHighlighted = idx === highlighted
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlighted(idx)}
                className={[
                  'flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer transition-colors',
                  isHighlighted ? 'bg-surface-overlay text-charcoal' : 'text-charcoal',
                  isSelected ? 'font-medium' : '',
                ].join(' ')}
              >
                {opt.label}
                {isSelected && <Check className="w-4 h-4 text-blush-dark flex-shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
