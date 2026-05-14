import React from 'react'

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'card'

interface SkeletonProps {
  variant?: SkeletonVariant
  width?: string
  height?: string
  lines?: number
  className?: string
}

const shimmer =
  'bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer'

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  lines = 3,
  className = '',
}: SkeletonProps) {
  const style: React.CSSProperties = {}
  if (width) style.width = width
  if (height) style.height = height

  if (variant === 'circular') {
    return (
      <span
        className={['rounded-full block', shimmer, className].join(' ')}
        style={style}
        aria-hidden="true"
      />
    )
  }

  if (variant === 'text') {
    return (
      <div className={['space-y-2', className].join(' ')} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={['h-4 rounded block', shimmer].join(' ')}
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={['bg-white rounded-2xl border border-[#E8E4DF] overflow-hidden', className].join(' ')} aria-hidden="true">
        <div className={['aspect-square w-full', shimmer].join(' ')} />
        <div className="p-3 space-y-2">
          <span className={['h-4 rounded block w-3/4', shimmer].join(' ')} />
          <span className={['h-3 rounded block w-1/2', shimmer].join(' ')} />
        </div>
      </div>
    )
  }

  return (
    <span
      className={['rounded block', shimmer, className].join(' ')}
      style={style}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <Skeleton variant="card" className={className} />
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return <Skeleton variant="text" lines={lines} className={className} />
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      variant="circular"
      width={`${size}px`}
      height={`${size}px`}
    />
  )
}
