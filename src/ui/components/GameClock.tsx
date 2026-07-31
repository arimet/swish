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
        className={`nums font-mono text-6xl font-bold leading-none tabular-nums sm:text-7xl ${
          low ? 'text-red-400' : 'text-[var(--scoreboard-fg)]'
        }`}
      >
        {fmt(seconds)}
      </div>
      <button
        onClick={onToggle}
        className={`min-w-32 rounded-full px-6 py-2.5 text-sm font-bold uppercase tracking-wide shadow-lg transition active:scale-95 ${
          running
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-emerald-500 text-white hover:bg-emerald-600'
        }`}
      >
        {running ? '❚❚ Arrêter' : '▶ Démarrer'}
      </button>
    </div>
  )
}
