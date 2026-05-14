type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: AvatarSize
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 text-2xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = sizeClasses[size]

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'User avatar'}
        className={[
          sizeClass,
          'rounded-full object-cover flex-shrink-0',
          className,
        ].join(' ')}
      />
    )
  }

  return (
    <div
      aria-label={name ?? 'User'}
      className={[
        sizeClass,
        'rounded-full bg-blush/40 flex items-center justify-center font-semibold text-charcoal flex-shrink-0 select-none',
        className,
      ].join(' ')}
    >
      {getInitials(name)}
    </div>
  )
}
