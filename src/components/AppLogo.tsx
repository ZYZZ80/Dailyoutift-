interface Props {
  className?: string
}

export default function AppLogo({ className = 'w-8 h-8' }: Props) {
  return (
    <img
      src="/logo.svg"
      alt="Daily Outfit"
      className={`${className} rounded-[22%] object-cover shadow-sm`}
      decoding="async"
    />
  )
}
