// Formateo de moneda (Bs), fechas y horas — locale es-BO.
// Zona forzada America/La_Paz (UTC-4) para que sea consistente sin importar
// el runtime (browser local, headless CI, deploy serverless, etc.)

import { parseISO } from 'date-fns'
import { format as fmtTz } from 'date-fns-tz'

const TZ = 'America/La_Paz'

function fmt(d, pattern) {
  const date = typeof d === 'string' ? parseISO(d) : d
  return fmtTz(date, pattern, { timeZone: TZ })
}

const moneyFmt = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatBs(n) {
  if (n == null || isNaN(n)) return 'Bs 0,00'
  return `Bs ${moneyFmt.format(n)}`
}

export function formatHoras(n) {
  if (n == null || isNaN(n)) return '0h'
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatFecha(d) {
  return fmt(d, 'dd/MM/yyyy')
}

export function formatFechaCorta(d) {
  return fmt(d, 'dd MMM')
}

export function formatHora(d) {
  if (!d) return '—'
  return fmt(d, 'HH:mm')
}

export function iniciales(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Color determinista de avatar por id de persona (cuando no hay foto).
const avatarColors = ['#ff6b35', '#dc2626', '#0ea5e9', '#eab308', '#a855f7', '#10b981', '#ec4899', '#f97316']
export function colorAvatar(id) {
  if (!id) return avatarColors[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return avatarColors[Math.abs(h) % avatarColors.length]
}
