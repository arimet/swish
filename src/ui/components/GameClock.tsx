import { Pause, Play } from 'lucide-react'
import { useT } from '../../i18n'

export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function GameClock({ running, seconds, onToggle }: {
  running: boolean; seconds: number; onToggle: () => void
}) {
  const translate = useT()
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
      {/* Both marks are drawn, no longer pasted as characters: the pause's "❚❚" showed
          as two solid bars from whatever font happened to be there, thicker than
          everything else on the banner.
          The colours took two detours to come back here. First `emerald-700` and
          `red-600`, raw Tailwind outside the charter. Then an `--sb-*` family of the
          banner's own, on the grounds that it did not switch with the theme — except
          it should have, and now it does. The application's green and red are enough,
          and they are the only ones that adjust to the background. */}
      <button
        onClick={onToggle}
        /* No `shadow-lg`: Tailwind's shadow is a pure black, calibrated to float above
           a dark background. On the light banner it read as a smudge under the button.
           This button needs no elevation to be seen — it is the most saturated flat
           area on the screen. */
        className={`flex h-11 min-w-32 items-center justify-center gap-2 rounded-full px-5 text-xs font-bold uppercase tracking-wide transition active:scale-95 sm:min-w-36 sm:px-6 sm:text-sm ${
          running
            ? 'bg-[var(--c-danger-fill)] text-[var(--c-on-danger)]'
            : 'bg-[var(--c-green-fill)] text-[var(--c-on-green)]'
        } hover:brightness-110`}
      >
        {running
          ? <><Pause className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('chrono.arreter')}</>
          : <><Play className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('chrono.demarrer')}</>}
      </button>
    </div>
  )
}
