/**
 * Reading a play: the board at full size, one step at a time, stepped through by
 * hand. No code is asked for to read — a player goes over the play at home. Only
 * "Edit" writes: it demands administrator access, and only shows for whoever has
 * it. The animated viewer lives on its own screen; here, the finger advances.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Play } from '../../domain/plays'
import { getPlay } from '../../persistence/repositories'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { SharePlay } from '../components/SharePlay'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function PlayView() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const { can, guard } = useAuth()
  const navigate = useNavigate()
  const [play, setPlay] = useState<Play | null | undefined>(undefined)
  const [index, setIndex] = useState(0)
  const [sharing, setSharing] = useState(false)

  useEffect(() => { if (id) getPlay(id).then((s) => setPlay(s ?? null)) }, [id])

  if (!id) return null
  if (play === undefined) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (play === null) return (
    <div className="p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        {translate('play.notFound')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{translate('team.back')}</Link>
      </p>
    </div>
  )

  const last = play.steps.length - 1
  // Stepping is clamped, it does not wrap: returning to the first step after the
  // last would suggest there is more to see.
  const go = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)))
  const edit = () => guard('manage', () => navigate(`/schemas/${id}/edit`))

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/schemas" aria-label={translate('play.backToPlays')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ border: bd, color: C.muted }}>←</Link>
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{play.name}</h1>
          {/* The same marks as on the library card: you recognise at a glance the
              play you have just opened. */}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] font-bold" style={{ color: C.muted }}>
            <span className="rounded-md px-1.5 py-0.5" style={{ background: C.card2 }}>
              {translate(play.court === 'half' ? 'play.halfCourt' : 'play.fullCourt')}
            </span>
            <span>{translate('play.stepCount', { count: play.steps.length })}</span>
            {play.defense && <span>{translate('play.defence')}</span>}
          </p>
        </div>
        {/* One filled button per screen: "Play", which is what you come to the
            sideline for, and it is ungated. Sharing is too — nothing is modified, a
            player must be able to send the play to a team-mate; it stays outlined,
            like Edit — which keeps its administrator code and only renders for
            whoever holds it. */}
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setSharing(true)} className="h-11 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}>{translate('play.share')}</button>
          {can('manage') && <button onClick={edit} className="h-11 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}>{translate('common.editCaps')}</button>}
          <Link to={`/schemas/${id}/lecteur`} className="flex h-11 items-center rounded-xl px-4 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('play.play')}</Link>
        </div>
      </div>

      {/* The step shown is the one the image will take up: you share what you look at. */}
      <SharePlay play={play} stepIndex={index} open={sharing} onClose={() => setSharing(false)} />

      {play.note && <p className="mb-4 rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{play.note}</p>}

      {/* The same width bound as the editor: it is the viewBox's ratio that must
          hold, otherwise the half court overflows on a wide screen. */}
      <div className="select-none" style={{ maxWidth: courtWidth(play.court) }}>
        <PlayBoard play={play} stepIndex={index} />
      </div>

      {/* Stepping through the play, aligned on the width of the court it drives, and
          doubled by a gauge: a counter says where you are, the gauge says how much is
          left — two questions asked at the same time. */}
      <div className="mt-3 select-none" style={{ maxWidth: courtWidth(play.court) }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => go(-1)} aria-label={translate('viewer.previous')} disabled={index === 0}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-black disabled:opacity-30" style={{ background: C.card, border: bd, color: C.text }}
          >
            ◀
          </button>
          <span className="flex-1 text-center text-sm font-extrabold">{translate('play.step', { n: index + 1, total: play.steps.length })}</span>
          <button
            onClick={() => go(1)} aria-label={translate('viewer.next')} disabled={index === last}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-black disabled:opacity-30" style={{ background: C.card, border: bd, color: C.text }}
          >
            ▶
          </button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {play.steps.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full transition" style={{ background: i <= index ? C.accent : C.card2 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
