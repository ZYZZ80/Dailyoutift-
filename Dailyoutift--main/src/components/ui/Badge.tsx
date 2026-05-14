import React from 'react'
import type { ClothingCategory } from '../../types'

type BadgeVariant =
  | ClothingCategory
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'

type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  // Category variants
  top: 'bg-blue-50 text-blue-700',
  bottom: 'bg-purple-50 text-purple-700',
  dress: 'bg-pink-50 text-pink-700',
  shoes: 'bg-amber-50 text-amber-700',
  accessory: 'bg-green-50 text-green-700',
  outerwear: 'bg-gray-100 text-gray-700',
  // Status variants
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
  info: 'bg-info-bg text-info-text',
  neutral: 'bg-gray-100 text-gray-600',
}

const dotColors: Record<BadgeVariant, string> = {
  top: 'bg-blue-500',
  bottom: 'bg-purple-500',
  dress: 'bg-pink-500',
  shoes: 'bg-amber-500',
  accessory: 'bg-green-500',
  outerwear: 'bg-gray-500',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-gray-400',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
}

export function Badge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center font-medium rounded-full',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && (
        <span
          className={['w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant]].join(' ')}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
