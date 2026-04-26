export function Skeleton({ className = '', ...rest }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-bg-700 via-bg-600 to-bg-700 bg-[length:200%_100%] rounded-lg ${className}`}
      style={{ animation: 'shimmer 1.6s linear infinite' }}
      {...rest}
    />
  )
}

// Inyectar keyframes una vez (no contamina si ya existe)
if (typeof document !== 'undefined' && !document.getElementById('shimmer-style')) {
  const s = document.createElement('style')
  s.id = 'shimmer-style'
  s.textContent = `@keyframes shimmer { 0% {background-position: 200% 0} 100% {background-position: -200% 0} }`
  document.head.appendChild(s)
}
