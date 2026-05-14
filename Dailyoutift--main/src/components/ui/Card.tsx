import React from 'react'

type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardProps {
  hoverable?: boolean
  padding?: CardPadding
  className?: string
  children: React.ReactNode
  onClick?: () => void
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({
  hoverable = false,
  padding = 'md',
  className = '',
  children,
  onClick,
}: CardProps) {
  const base = 'bg-white rounded-2xl border border-[#E8E4DF] shadow-sm'
  const hover = hoverable
    ? 'transition-shadow duration-150 hover:shadow-md cursor-pointer'
    : ''

  return (
    <div
      className={[base, hover, paddingClasses[padding], className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={['px-5 pt-5 pb-0', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export function CardBody({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={['p-5', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export function CardFooter({
  className = '',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={[
        'px-5 pb-5 pt-0 border-t border-[#E8E4DF] mt-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
