import { useEffect, useState } from 'react'
import { CloudOff, TriangleAlert } from 'lucide-react'
import { remoteEnabled, onHealth, type Health } from '../../persistence/remote'
import { useT } from '../../i18n'
import { C } from '../olive/kit'

/**
 * What sharing is doing, when it is not doing it.
 *
 * The defect it repairs: a failed send was swallowed in silence. A scorer could
 * believe spectators were following a game that no longer reached them, and a coach
 * believe their roster shared.
 *
 * THREE CHOICES THAT MATTER MORE THAN THE PICTOGRAM.
 *
 * **This is not an alert.** Nothing is lost when a send fails: the entry is in the
 * local store and the queue will leave on its own. Announcing an incident would
 * panic a volunteer mid-game over a problem that is not one — and lie, incidentally.
 * So the text says first that the entry is kept.
 *
 * **This is not a toast.** A toast fades; the condition lasts. A gym with no
 * coverage is two hours. We show a state for as long as it is true, and it
 * disappears by itself when the queue empties.
 *
 * **The count is the honest measure.** "Waiting" does not say whether it is
 * progressing; a number that grows does. It is also what tells a hiccup from an
 * outage.
 *
 * Nothing shows while all is well: on this screen, silence is information, and a
 * permanent green pill would not be.
 */
export function SyncState({ compact = false }: { compact?: boolean }) {
  const translate = useT()
  const [health, setHealth] = useState<Health>({ state: 'idle', pending: 0 })

  useEffect(() => (remoteEnabled() ? onHealth(setHealth) : undefined), [])

  // A non-empty queue right after a gesture is the NORMAL state: it empties within
  // the second. Without the condition on the state, the pill would flash on every
  // basket — in the middle of the screen people look at least.
  if (!remoteEnabled() || health.pending === 0 || health.state === 'ok' || health.state === 'idle') return null

  const blocked = health.state === 'token'
  const Icon = blocked ? TriangleAlert : CloudOff
  // The token will not fix itself, the network will: two colours, two lifetimes.
  // Amber says "it is waiting", danger says "it needs a hand".
  const tint = blocked ? { bg: C.dangerBg, ink: C.danger } : { bg: C.amberBg, ink: C.amber }

  return (
    <span
      role="status"
      title={translate(blocked ? 'sync.refuseDetail' : 'sync.horsReseauDetail')}
      aria-label={`${translate('sync.compte', { count: health.pending })} — ${translate(blocked ? 'sync.refuseDetail' : 'sync.horsReseauDetail')}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
      style={{ background: tint.bg, color: tint.ink }}
    >
      <Icon className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />
      {/* The count alone when room is short — it is what carries the information, the
          label only names it. The accessible name stays whole. */}
      <span className="nums">{health.pending}</span>
      {!compact && <span>{translate(blocked ? 'sync.refuse' : 'sync.horsReseau')}</span>}
    </span>
  )
}
