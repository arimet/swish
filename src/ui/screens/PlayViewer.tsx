/**
 * The time-out viewer: the play runs, outside the shell, on the phone five players
 * are looking at from arm's length. Everything is cut for that moment — the court
 * fills the screen, you advance a step by touching half of it, and the way out stays
 * visible. Reading is never gated.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { snapshot } from '../../domain/anim'
import { usePlay } from '../../persistence/queries'
import { SharePlay } from '../components/SharePlay'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { usePlayback } from '../components/usePlayback'
import { C, bd } from '../olive/kit'
import { useT } from '../../i18n'
import { Pause, Play as PlayIcon, X } from 'lucide-react'

export function PlayViewer() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const { data: play } = usePlay(id)
  // The position, the transport and the three rules that keep the loop honest live in
  // `usePlayback`, shared with the editor — which plays a play without leaving it.
  const { pos, setPos, playing, setPlaying, looping, setLooping, slow, setSlow, last, go, start: startPlayback } = usePlayback(play)
  // The paths during playback. Off by default: without them, the bare animation,
  // which is what the viewer has always shown. Nothing is remembered from one
  // opening to the next, like looping and slow motion — one setting out of three
  // that remembered would be the most confusing of the three.
  const [paths, setPaths] = useState(false)
  const [sharing, setSharing] = useState(false)

  if (!id) return null
  if (play === undefined) return <Screen><p style={{ color: C.muted }}>{translate('common.loading')}</p></Screen>
  if (play === null) return (
    <Screen>
      <p style={{ color: C.muted }}>
        {translate('play.notFound')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{translate('team.back')}</Link>
      </p>
    </Screen>
  )

  const current = Math.round(pos)

  // Stopped on a whole step, we show the step as drawn, arrows included: the
  // animation replaces them while it runs, but at a pause it is the notebook you are
  // re-reading — and the last step states its intent only through its strokes, since
  // no step follows it.
  // Stopped **between** two steps, the drawn arrows are not shown: they start from
  // the drawn positions, not from where the markers are at that instant, and the
  // offset would read as an error. A stop mid-gesture shows where the players are;
  // that is already what you came to see.
  // The paths toggle lifts that reservation: the path it draws is refitted onto the
  // real positions, so it reads mid-gesture too.
  const step = !playing && Number.isInteger(pos)
    ? play.steps[pos]
    : snapshot(play, { step: Math.floor(pos), part: pos - Math.floor(pos) }, paths)
  // The viewer takes the room available, but no more than `courtWidth` allows: on a
  // phone held at arm's length every centimetre counts, on a desktop screen a
  // thousand-pixel court does not read better, it reads worse. The SVG fits itself in
  // its box (`preserveAspectRatio`), without distortion, and nothing here converts
  // coordinates — we read, we do not draw.
  const boardWidth = courtWidth(play.court)

  return (
    <Screen>
      <div className="flex min-h-dvh flex-col gap-2 p-3">
        {/* The header does not contend with the court for room: the way out is a
            square on the left, where the thumb looks for it, the name takes all the
            rest, and "Share" stays outlined — the viewer's only filled button is
            "Play", at the bottom. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={`/schemas/${id}`} aria-label={translate('play.leaveViewer')} title={translate('play.leaveViewer')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-black" style={{ border: bd, color: C.muted }}
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight">{play.name}</h1>
          {/* Playback stops during a share: we do not build an image of the step we
              are in the middle of leaving. */}
          <button
            onClick={() => { setPlaying(false); setSharing(true) }}
            className="h-10 shrink-0 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}
          >
            {translate('play.share')}
          </button>
        </div>
        <SharePlay play={play} stepIndex={current} open={sharing} onClose={() => setSharing(false)} />

        {/* The court, and over it the two half-screens: during a time-out nobody aims
            at a forty-pixel button. They stop above the controls, which stay
            reachable. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="h-full w-full select-none" style={{ maxWidth: boardWidth }}>
            <PlayBoard play={play} stepIndex={0} step={step} fills />
          </div>
          <HalfScreen side="left" label={translate('viewer.previous')} chevron="‹" onClick={() => go(-1)} disabled={current === 0} />
          <HalfScreen side="right" label={translate('viewer.next')} chevron="›" onClick={() => go(1)} disabled={current === last} />
        </div>

        <div className="mx-auto flex w-full shrink-0 flex-col gap-2" style={{ maxWidth: boardWidth }}>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-extrabold">{translate('play.step', { n: current + 1, total: play.steps.length })}</span>
            <input
              type="range" aria-label={translate('play.progress')} min={0} max={last || 1} step={0.01} value={pos}
              disabled={last === 0}
              onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)) }}
              className="piste min-w-0 flex-1 cursor-pointer appearance-none disabled:opacity-40"
            />
          </div>
          {/* Two rows, no longer one. At three settings the single row overflowed by
              seven pixels and it was "Play" that paid: at `flex-1` it let itself be
              squeezed to eighty-seven pixels, its label clipped, although it is the
              one control anyone aims at in the middle of a time-out. The action
              therefore takes the full width, the settings share the next row equally —
              and a fourth setting, some day, will break nothing. */}
          <button
            onClick={() => (playing ? setPlaying(false) : startPlayback())} disabled={last === 0}
            aria-label={translate(playing ? 'play.pause' : 'play.playback')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black text-[var(--c-on-brand)] disabled:opacity-40"
            style={{ background: C.brand }}
          >
            {playing
              ? <><Pause className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('play.pause')}</>
              : <><PlayIcon className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('play.playback')}</>}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <Toggle label={translate('play.paths')} active={paths} onClick={() => setPaths((t) => !t)} />
            <Toggle label={translate('play.loop')} active={looping} onClick={() => setLooping((b) => !b)} />
            <Toggle label={translate('play.slowMotion')} active={slow} onClick={() => setSlow((r) => !r)} />
          </div>
        </div>
      </div>
    </Screen>
  )
}

/** The viewer's background: the application's frame, full screen. The court keeps
 *  its own surface — it is the coach's board, not one more card. */
function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

/** Half a screen that steps forward or back. Dark at the extremity: stepping is
 *  clamped, it does not wrap.
 *
 *  The chevron is veiled ink: at 35% it gave only 2.4:1 on the light background,
 *  under the threshold even for a glyph this size. 45% brings it to 3.3:1 without
 *  making it loud. */
function HalfScreen({ side, label, chevron, onClick, disabled }: {
  side: 'left' | 'right'; label: string; chevron: string; onClick: () => void; disabled: boolean
}) {
  return (
    <button
      aria-label={label} onClick={onClick} disabled={disabled}
      className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} w-1/2 px-2 text-4xl font-black disabled:opacity-0`}
      style={{ color: C.text, opacity: 0.45, textAlign: side }}
    >
      {chevron}
    </button>
  )
}

/** Paths, loop and slow motion: the three settings a coach actually uses.
 *  No more `shrink-0`: in an equal-column grid each one already holds its width, and
 *  forbidding shrinkage only served to overflow. */
function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-pressed={active}
      className="rounded-2xl px-2 py-4 text-sm font-bold"
      style={{ border: bd, background: active ? C.accentBg : C.card, color: active ? C.accent : C.muted }}
    >
      {label}
    </button>
  )
}
