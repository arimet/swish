import { Pause, Play } from 'lucide-react'

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
          low ? 'text-[var(--c-danger)]' : 'text-[var(--c-text)]'
        }`}
      >
        {fmt(seconds)}
      </div>
      {/* Les deux repères sont tracés, plus collés en caractères : le « ❚❚ » de la
          pause s'affichait en deux barres pleines d'une police au hasard, plus
          épaisses que tout le reste du bandeau.
          Les couleurs, elles, ont pris deux détours pour revenir ici. D'abord
          `emerald-700` et `red-600`, du Tailwind brut hors charte. Puis une famille
          `--sb-*` propre au bandeau, au motif qu'il ne basculait pas avec le thème —
          sauf qu'il aurait dû, et il le fait maintenant. Le vert et le rouge de
          l'application suffisent, et ce sont les seuls à s'ajuster au fond. */}
      <button
        onClick={onToggle}
        /* Pas de `shadow-lg` : l'ombre de Tailwind est un noir pur, calibrée pour
           flotter au-dessus d'un fond sombre. Sur le bandeau clair elle se lisait
           comme une salissure sous le bouton. Ce bouton n'a pas besoin d'élévation
           pour se voir — c'est l'aplat le plus saturé de l'écran. */
        className={`flex h-11 min-w-32 items-center justify-center gap-2 rounded-full px-5 text-xs font-bold uppercase tracking-wide transition active:scale-95 sm:min-w-36 sm:px-6 sm:text-sm ${
          running
            ? 'bg-[var(--c-danger-fill)] text-[var(--c-on-danger)]'
            : 'bg-[var(--c-green-fill)] text-[var(--c-on-green)]'
        } hover:brightness-110`}
      >
        {running
          ? <><Pause className="h-4 w-4 shrink-0" strokeWidth={2.5} />Arrêter</>
          : <><Play className="h-4 w-4 shrink-0" strokeWidth={2.5} />Démarrer</>}
      </button>
    </div>
  )
}
