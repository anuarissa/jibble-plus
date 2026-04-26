import { iniciales, colorAvatar } from '../../utils/format'

export function Avatar({ name, id, size = 'md', src }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
  }
  if (src) {
    return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover ring-1 ring-white/10`} />
  }
  const bg = colorAvatar(id || name)
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white ring-1 ring-white/10 shrink-0`}
      style={{ background: `linear-gradient(135deg, ${bg}, ${bg}aa)` }}
    >
      {iniciales(name)}
    </div>
  )
}
