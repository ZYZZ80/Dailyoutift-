import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  compact?: boolean
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4 gap-2' : 'py-16 px-6 gap-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={[
          'rounded-2xl bg-surface-overlay flex items-center justify-center text-charcoal-muted',
          compact ? 'w-12 h-12' : 'w-16 h-16',
        ].join(' ')}
      >
        <Icon className={compact ? 'w-5 h-5' : 'w-7 h-7'} strokeWidth={1.5} />
      </div>

      <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
        <p
          className={[
            'font-semibold text-charcoal',
            compact ? 'text-sm' : 'text-base',
          ].join(' ')}
        >
          {title}
        </p>
        {description && (
          <p
            className={[
              'text-charcoal-muted',
              compact ? 'text-xs' : 'text-sm',
            ].join(' ')}
          >
            {description}
          </p>
        )}
      </div>

      {action && (
        <Button
          variant="primary"
          size={compact ? 'sm' : 'md'}
          onClick={action.onClick}
          className="mt-1"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
