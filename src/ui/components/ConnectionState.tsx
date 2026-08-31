import { useEffect, useState } from 'react'
import { CloudOff, TriangleAlert } from 'lucide-react'
import { onState, type State } from '../../persistence/api'
import { useT } from '../../i18n'
import { C } from '../olive/kit'

/**
 * The link with the database, when there is not one.
 *
 * There is no local store and no queue behind these screens: the database is the only
 * place the data lives. So a pill here does not announce a delay — it means the last
 * action did **not** happen, and the next one will not either.
 *
 * TWO CHOICES THAT MATTER MORE THAN THE PICTOGRAM.
 *
 * **This is not a toast.** A toast fades; the condition lasts. A gym with no
 * coverage is two hours. We show a state for as long as it is true, and it
 * disappears by itself when the next exchange succeeds.
 *
 * **The wording does not reassure.** Saying "nothing is lost" would be false, and
 * false in the direction that costs a scorer their last basket.
 *
 * Nothing shows while all is well: on this screen, silence is information, and a
 * permanent green pill would not be.
 */
export function ConnectionState({ compact = false }: { compact?: boolean }) {
  const translate = useT()
  const [state, setState] = useState<State>('idle')

  useEffect(() => onState(setState), [])

  if (state === 'ok' || state === 'idle') return null

  const blocked = state === 'token'
  const Icon = blocked ? TriangleAlert : CloudOff
  // The token will not fix itself, the network will: two colours, two lifetimes.
  // Amber says "wait for it", danger says "it needs a hand".
  const tint = blocked ? { bg: C.dangerBg, ink: C.danger } : { bg: C.amberBg, ink: C.amber }
  const key = blocked ? 'connection.refused' : 'connection.lost'
  const detail = blocked ? 'connection.refusedDetail' : 'connection.lostDetail'

  return (
    <span
      role="status"
      title={translate(detail)}
      aria-label={`${translate(key)} — ${translate(detail)}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
      style={{ background: tint.bg, color: tint.ink }}
    >
      <Icon className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />
      {/* The icon alone when room is short: the accessible name stays whole, and the
          `title` carries what to do about it. */}
      {!compact && <span>{translate(key)}</span>}
    </span>
  )
}
