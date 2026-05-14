interface Tab {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div
      role="tablist"
      className={[
        'flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tabs.map(tab => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={[
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush',
              isActive
                ? 'bg-charcoal text-white shadow-sm'
                : 'bg-surface-overlay text-charcoal-muted hover:bg-[#E8E4DF] hover:text-charcoal',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={[
                  'text-2xs font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                  isActive ? 'bg-white/20 text-white' : 'bg-charcoal/10 text-charcoal-muted',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
