import { Loader2 } from 'lucide-react'

type SpinnerSize = 'sm' | 'md' | 'lg'
type SpinnerColor = 'default' | 'white' | 'blush'

interface SpinnerProps {
  size?: SpinnerSize
  color?: SpinnerColor
  className?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

const colorClasses: Record<SpinnerColor, string> = {
  default: 'text-charcoal-muted',
  white: 'text-white',
  blush: 'text-blush-dark',
}

export function Spinner({ size = 'md', color = 'default', className = '' }: SpinnerProps) {
  return (
    <Loader2
      className={[sizeClasses[size], colorClasses[color], 'animate-spin', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    />
  )
}
