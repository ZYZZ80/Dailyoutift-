import { Menu, Sparkles } from 'lucide-react'
import { Avatar } from './ui'

interface MobileHeaderProps {
  title: string
  providerLabel: string
  userPhoto: string | null
  userName: string
  onMenuOpen: () => void
}

export default function MobileHeader({
  title,
  providerLabel,
  userPhoto,
  userName,
  onMenuOpen,
}: MobileHeaderProps) {
  return (
    <header className="bg-white border-b border-[#E8E4DF] sticky top-0 z-30 safe-top">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onMenuOpen}
            aria-label="Open navigation menu"
            className="p-2.5 hover:bg-surface-overlay rounded-xl mr-0.5 transition-colors"
          >
            <Menu className="w-5 h-5 text-charcoal-muted" />
          </button>
          <div className="w-7 h-7 bg-charcoal rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-charcoal text-sm">{title}</span>
          <span className="text-xs bg-surface-overlay text-charcoal-muted px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">
            {providerLabel}
          </span>
        </div>
        <Avatar src={userPhoto} name={userName} size="sm" />
      </div>
    </header>
  )
}
