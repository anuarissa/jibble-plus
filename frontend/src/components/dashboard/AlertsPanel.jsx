import { AlertCircle, AlertTriangle, BellOff } from 'lucide-react'

export function AlertsPanel({ alerts }) {
  if (!alerts?.length) {
    return (
      <div className="surface p-5 grain">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-good/15 text-good flex items-center justify-center">
            <BellOff size={15} />
          </div>
          <h3 className="font-display font-semibold">Alertas</h3>
        </div>
        <p className="text-sm text-ink-200">Todo en orden. Sin alertas activas.</p>
      </div>
    )
  }

  return (
    <div className="surface p-5 grain">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-bad/15 text-bad flex items-center justify-center">
            <AlertCircle size={15} />
          </div>
          <h3 className="font-display font-semibold">Alertas</h3>
        </div>
        <span className="badge bg-bad/20 text-bad">{alerts.length}</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto scrollbar-thin pr-1">
        {alerts.map(a => (
          <div
            key={a.id}
            className={`p-3 rounded-xl border text-sm ${
              a.severity === 'bad'
                ? 'bg-bad/10 border-bad/30'
                : 'bg-warn/10 border-warn/30'
            }`}
          >
            <div className="flex items-start gap-2">
              {a.severity === 'bad' ? <AlertCircle size={14} className="text-bad mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />}
              <div>
                <div className="font-medium text-ink-50">{a.title}</div>
                <div className="text-xs text-ink-200 mt-0.5">{a.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
