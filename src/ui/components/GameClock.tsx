export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function GameClock({ running, seconds, onToggle }: {
  running: boolean; seconds: number; onToggle: () => void
}) {
  const low = seconds <= 60 && running
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`nums font-mono text-[2.75rem] font-bold leading-none tabular-nums sm:text-7xl ${
          low ? 'text-red-400' : 'text-[var(--scoreboard-fg)]'
        }`}
      >
        {fmt(seconds)}
      </div>
      <button
        onClick={onToggle}
        className={`min-w-28 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-lg transition active:scale-95 sm:min-w-32 sm:px-6 sm:py-2.5 sm:text-sm ${
          running
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-emerald-700 text-white hover:bg-emerald-800'
        }`}
      >
        {running ? '❚❚ Arrêter' : '▶ Démarrer'}
      </button>
    </div>
  )
}
