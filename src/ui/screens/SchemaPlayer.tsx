/**
 * The time-out viewer: the play runs, outside the shell, on the phone five players
 * are looking at from arm's length. Everything is cut for that moment — the court
 * fills the screen, you advance a step by touching half of it, and the way out stays
 * visible. Reading is never gated.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { snapshot, transitions } from '../../domain/anim'
import type { Play } from '../../domain/plays'
import { getPlay } from '../../persistence/repositories'
import { ExportSchema } from '../components/ExportSchema'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'
import { useT } from '../../i18n'
import { Pause, Play as PlayIcon, X } from 'lucide-react'

/** A transition lasts a second and a half, twice that in slow motion. It is not
 *  adjustable: 1.5 s lets a movement be read without testing anyone's patience. */
const STEP_MS = 1500

/** The loop's tick. Twenty frames a second are enough for a sliding marker, and a
 *  timer can be driven from a test — which `requestAnimationFrame` cannot. */
const TICK_MS = 50

/** Is the system asking for less motion? Read when playback starts; this is not a
 *  comfort, it is the only correct way to treat someone motion disturbs. */
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function SchemaPlayer() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const [schema, setSchema] = useState<Play | null | undefined>(undefined)
  // Progress, in fractional steps: 1.5 is halfway from the second step to the
  // third. One number for the slider, the half-screens and the animation.
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(false)
  const [slow, setSlow] = useState(false)
  // The paths during playback. Off by default: without them, the bare animation,
  // which is what the viewer has always shown. Nothing is remembered from one
  // opening to the next, like looping and slow motion — one setting out of three
  // that remembered would be the most confusing of the three.
  const [paths, setPaths] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => { if (id) getPlay(id).then((s) => setSchema(s ?? null)) }, [id])

  const last = schema ? transitions(schema) : 0

  useEffect(() => {
    if (!playing) return
    const duration = slow ? STEP_MS * 2 : STEP_MS
    const jump = reducedMotion()
    const tick = jump ? duration : TICK_MS
    const iv = window.setInterval(() => setPos((p) => {
      const next = jump ? Math.floor(p) + 1 : p + tick / duration
      if (next < last) return next
      // We land exactly on the last step before looping: otherwise it is never
      // seen.
      if (p < last) return last
      return looping ? 0 : last
    }), tick)
    return () => clearInterval(iv)
  }, [playing, slow, looping, last])

  // At the end without looping, playback stops on its own.
  useEffect(() => { if (playing && !looping && pos >= last) setPlaying(false) }, [playing, looping, pos, last])

  // Tab in the background: we cut. An animation that keeps running drains the
  // battery and ends up somewhere unexpected on return.
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  if (!id) return null
  if (schema === undefined) return <Screen><p style={{ color: C.muted }}>{translate('commun.chargement')}</p></Screen>
  if (schema === null) return (
    <Screen>
      <p style={{ color: C.muted }}>
        {translate('sch.introuvable')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{translate('equipe.retour')}</Link>
      </p>
    </Screen>
  )

  const current = Math.round(pos)
  /**
   * The neighbouring step **in the direction of the gesture**, not the neighbour of
   * the rounding. From a fractional position — paused mid-transition, slider released
   * off a notch — `Math.round` has already "pre-advanced" by half a step, and adding
   * 1 would skip a whole step. A coach who pauses to comment and then taps "next"
   * must not watch the play stride over a stage.
   */
  const go = (delta: number) => {
    setPlaying(false)
    const target = delta > 0 ? Math.floor(pos) + 1 : Math.ceil(pos) - 1
    setPos(Math.min(last, Math.max(0, target)))
  }
  const play = () => {
    // Restarting from the end means replaying: otherwise the button would do
    // nothing.
    if (pos >= last) setPos(0)
    setPlaying(true)
  }

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
    ? schema.steps[pos]
    : snapshot(schema, { step: Math.floor(pos), part: pos - Math.floor(pos) }, paths)
  // The viewer takes the room available, but no more than `courtWidth` allows: on a
  // phone held at arm's length every centimetre counts, on a desktop screen a
  // thousand-pixel court does not read better, it reads worse. The SVG fits itself in
  // its box (`preserveAspectRatio`), without distortion, and nothing here converts
  // coordinates — we read, we do not draw.
  const boardWidth = courtWidth(schema.court)

  return (
    <Screen>
      <div className="flex min-h-dvh flex-col gap-2 p-3">
        {/* The header does not contend with the court for room: the way out is a
            square on the left, where the thumb looks for it, the name takes all the
            rest, and "Share" stays outlined — the viewer's only filled button is
            "Play", at the bottom. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={`/schemas/${id}`} aria-label={translate('sch.quitterLecteur')} title={translate('sch.quitterLecteur')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-black" style={{ border: bd, color: C.muted }}
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight">{schema.name}</h1>
          {/* Playback stops during a share: we do not build an image of the step we
              are in the middle of leaving. */}
          <button
            onClick={() => { setPlaying(false); setSharing(true) }}
            className="h-10 shrink-0 rounded-xl px-4 text-sm font-bold" style={{ border: bd, color: C.text }}
          >
            {translate('sch.partager')}
          </button>
        </div>
        <ExportSchema schema={schema} stepIndex={current} open={sharing} onClose={() => setSharing(false)} />

        {/* The court, and over it the two half-screens: during a time-out nobody aims
            at a forty-pixel button. They stop above the controls, which stay
            reachable. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="h-full w-full select-none" style={{ maxWidth: boardWidth }}>
            <PlayBoard schema={schema} stepIndex={0} step={step} remplit />
          </div>
          <HalfScreen side="left" label={translate('lecteur.precedent')} chevron="‹" onClick={() => go(-1)} disabled={current === 0} />
          <HalfScreen side="right" label={translate('lecteur.suivant')} chevron="›" onClick={() => go(1)} disabled={current === last} />
        </div>

        <div className="mx-auto flex w-full shrink-0 flex-col gap-2" style={{ maxWidth: boardWidth }}>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-extrabold">{translate('sch.temps', { n: current + 1, total: schema.steps.length })}</span>
            <input
              type="range" aria-label={translate('sch.avancement')} min={0} max={last || 1} step={0.01} value={pos}
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
            onClick={() => (playing ? setPlaying(false) : play())} disabled={last === 0}
            aria-label={translate(playing ? 'sch.pause' : 'sch.lecture')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black text-[var(--c-on-brand)] disabled:opacity-40"
            style={{ background: C.brand }}
          >
            {playing
              ? <><Pause className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('sch.pause')}</>
              : <><PlayIcon className="h-4 w-4 shrink-0" strokeWidth={2.5} />{translate('sch.lecture')}</>}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <Toggle label={translate('sch.trajets')} active={paths} onClick={() => setPaths((t) => !t)} />
            <Toggle label={translate('sch.boucle')} active={looping} onClick={() => setLooping((b) => !b)} />
            <Toggle label={translate('sch.ralenti')} active={slow} onClick={() => setSlow((r) => !r)} />
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
