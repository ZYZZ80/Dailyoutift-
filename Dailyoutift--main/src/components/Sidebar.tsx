import React from 'react'
import { Sparkles, X, Settings, LogOut } from 'lucide-react'
import { Avatar } from './ui'
import { SUPABASE_ENABLED } from '../lib/supabase'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

interface SidebarProps {
  tab: string
  onTabChange: (id: string) => void
  userName: string
  userPhoto: string | null
  userEmail: string
  providerLabel: string
  navItems: NavItem[]
  onReset: () => void
  onSignOut: () => void
  onClose?: () => void
}

export default function Sidebar({
  tab,
  onTabChange,
  userName,
  userPhoto,
  userEmail,
  providerLabel,
  navItems,
  onReset,
  onSignOut,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Logo header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 bg-blush/30 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-blush" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-none">Daily Stylist</p>
          <p className="text-xs text-white/40 mt-0.5">{providerLabel}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="p-2 hover:bg-white/10 rounded-lg flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        )}
      </div>

      {/* User profile */}
      <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Avatar src={userPhoto} name={userName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-white/40 truncate">{userEmail}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto"
      >
        {navItems.map((item) => {
          const isActive = item.id === tab
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80',
              ].join(' ')}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blush rounded-r-full"
                />
              )}
              {item.icon}
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-blush/70 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 space-y-0.5 flex-shrink-0">
        <button
          onClick={onReset}
          aria-label="Change AI provider"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
          Change Provider
        </button>
        {SUPABASE_ENABLED && (
          <button
            onClick={onSignOut}
            aria-label="Sign out of your account"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-white/40 hover:bg-white/5 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sign Out
          </button>
        )}
      </div>
    </>
  )
}
