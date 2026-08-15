/**
 * The playbook editor. The coach drags markers, draws paths with a finger, erases,
 * undoes, and stacks the steps of a play. Every completed gesture writes to the store
 * there and then: there is no "Save" button, a coach at the sideline has no hand
 * free for one.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  BASKET, distanceToSegment, simplifyPath, nextStep, toCourt,
  type Side, type Arrow, type Prop, type Marker, type Point, type Position, type Play, type Step, type Court, type Stroke,
} from '../../domain/plays'
import { getPlay, savePlay } from '../../persistence/repositories'
import { remoteEnabled } from '../../persistence/remote'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { courtWidth, PlayBoard, toSvg } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { D, W } from '../components/ShotCourt'
import { C, bd, Ic } from '../olive/kit'
import { X } from 'lucide-react'

type Tool = 'deplacer' | Stroke | 'ball' | 'objet' | 'gomme'
/** What a drag holds: a marker (by its side and its position), or a placed prop (by
 *  its index) — both move, nothing else does. */
type Grab = { kind: 'pion'; side: Side; position: Position } | { kind: 'objet'; index: number }
/**
 * One undo entry. The brief called for a stack of `Step`s; the props go with them,
 * since they live outside the steps and the eraser removes them too — without them,
 * "undo" would not bring back the erased cone.
 */
type UndoStep = { step: Step; props: Prop[] }

/** Grab radius, in normalised units: generous for a finger without being ambiguous —
 *  the nearest marker wins in any case. */
const GRAB_RADIUS = 0.05
/** How close the eraser has to be to an arrow's path. */
const NEAR_STROKE = 0.04
/** A stroke shorter than this is a mistimed tap, not a path. */
const MIN_STROKE = 0.03
/** Depth of the undo stack, per step. */
const UNDO_DEPTH = 20

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** The marker nearest the finger, within the grab radius. */
function markerUnder(t: Step, p: Point): Marker | null {
  let found: Marker | null = null
  for (const marker of t.markers) {
    if (dist(marker.at, p) > GRAB_RADIUS) continue
    if (!found || dist(marker.at, p) < dist(found.at, p)) found = marker
  }
  return found
}

/** Index of the prop under the finger, -1 otherwise. */
const propUnder = (props: Prop[], p: Point) => props.findIndex((o) => dist(o.at, p) < GRAB_RADIUS)

/** Distance from the finger to an arrow's path, segment by segment. */
function distanceToArrow(f: Arrow, p: Point): number {
  if (f.points.length < 2) return f.points.length ? dist(f.points[0], p) : Infinity
  let d = Infinity
  for (let i = 0; i < f.points.length - 1; i++) d = Math.min(d, distanceToSegment(p, f.points[i], f.points[i + 1]))
  return d
}

/** Index of the arrow nearest the finger, -1 if none is close enough. */
function arrowUnder(t: Step, p: Point): number {
  let rank = -1
  let best = NEAR_STROKE
  t.arrows.forEach((f, i) => {
    const d = distanceToArrow(f, p)
    if (d < best) { best = d; rank = i }
  })
  return rank
}

/** The play with the grabbed thing set at `at`: used both for rendering during the
 *  drag and for the write on release, so that the preview and what is saved cannot
 *  diverge. */
function moveTo(s: Play, stepIndex: number, what: Grab, at: Point): Play {
  if (what.kind === 'objet') return { ...s, props: s.props.map((o, k) => (k === what.index ? { ...o, at } : o)) }
  return {
    ...s,
    steps: s.steps.map((t, k) => (k !== stepIndex ? t : {
      ...t,
      markers: t.markers.map((p) => (p.side === what.side && p.position === what.position ? { ...p, at } : p)),
    })),
  }
}

/** The five mirrored defenders: each halfway along the attacker-to-basket segment.
 *  The basket chosen is the one nearest the attacker — on a full court, an attack
 *  placed in the back court (transition, press) would otherwise have its defender set
 *  ten metres away, in the middle of the floor. */
function withDefense(t: Step, court: Court): Step {
  const baskets = BASKET[court]
  const offense = t.markers.filter((p) => p.side === 'offense')
  return {
    ...t,
    markers: [...offense, ...offense.map((a): Marker => {
      const basket = baskets.reduce((best, p) => (dist(a.at, p) < dist(a.at, best) ? p : best))
      return { side: 'defense', position: a.position, at: { x: (a.at.x + basket.x) / 2, y: (a.at.y + basket.y) / 2 } }
    })],
  }
}

/** Without defence: the defenders go, their arrows with them, and the ball returns
 *  to the point guard if a defender was carrying it — otherwise it would be left with
 *  no carrier. */
function withoutDefense(t: Step): Step {
  return {
    markers: t.markers.filter((p) => p.side === 'offense'),
    arrows: t.arrows.filter((f) => f.from.side === 'offense'),
    ball: !('x' in t.ball) && t.ball.side === 'defense' ? { side: 'offense', position: 1 } : t.ball,
  }
}

/**
 * The tools, by family. Eight text pills of equal weight did not say that they do
 * three different things: two ways of handling what is already there, four mutually
 * exclusive strokes, two things to place. Each family is now its own segment, and the
 * label — which remains the button's accessible name — gives way to a pictogram.
 */
const HANDLE: { key: Tool; label: string; icon: string }[] = [
  // The move cursor's four-way arrow, and the notebook's eraser.
  { key: 'deplacer', label: 'tool.move', icon: 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3' },
  { key: 'gomme', label: 'tool.eraser', icon: 'm7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9' },
]
const DRAW: { key: Stroke; label: string }[] = [
  { key: 'cut', label: 'tool.cut' },
  { key: 'screen', label: 'tool.screen' },
  { key: 'pass', label: 'tool.pass' },
  { key: 'dribble', label: 'tool.dribble' },
]
const PLACE: { key: Tool; label: string }[] = [
  { key: 'ball', label: 'tool.ball' },
  { key: 'objet', label: 'tool.props' },
]
const PROP_KINDS: { key: Prop['kind']; label: string }[] = [
  { key: 'cone', label: 'tool.cone' },
  { key: 'ball', label: 'tool.looseBall' },
  { key: 'ladder', label: 'tool.ladder' },
]

const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }

export function PlayEdit() {
  const translate = useT()
  const { id } = useParams<{ id: string }>()
  const { can, guard } = useAuth()
  const [play, setPlay] = useState<Play | null | undefined>(undefined)
  const [stepIndex, setStepIndex] = useState(0)
  const [tool, setTool] = useState<Tool>('deplacer')
  const [propKind, setPropKind] = useState<Prop['kind']>('cone')
  // Gestures in progress: purely visual, never saved as they are.
  const [grab, setGrab] = useState<{ what: Grab; origin: Point; at: Point } | null>(null)
  const [drawing, setDrawing] = useState<{ from: Arrow['from']; points: Point[] } | null>(null)
  // One stack per step: undoing on the second step does not undo the first.
  const [undoStack, setUndoStack] = useState<UndoStep[][]>([])
  const [refused, setRefused] = useState('')
  const [askDefense, setAskDefense] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!id) return
    getPlay(id).then((s) => { setPlay(s ?? null); setName(s?.name ?? ''); setNote(s?.note ?? '') })
  }, [id])

  if (!id) return null
  // The editor writes end to end: placing a marker, drawing an arrow, adding a step —
  // everything goes through the guard. Without the right, all that would be left on
  // screen is a board demanding a code at every gesture, so we redirect to the reading
  // screen, which is ungated and shows the same play. The guards below do not move:
  // this redirect is a display convenience, not the protection.
  if (!can('manage')) return <Navigate to={`/schemas/${id}`} replace />
  if (play === undefined) return <div className="p-4 sm:p-6"><div className="h-96 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (play === null) return (
    <div className="p-4 sm:p-6">
      <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
        {translate('play.notFound')} <Link to="/schemas" className="font-bold" style={{ color: C.accent }}>{translate('team.back')}</Link>
      </p>
    </div>
  )

  const index = Math.min(stepIndex, play.steps.length - 1)
  const step = play.steps[index]
  const height = play.court === 'full' ? D * 2 : D

  /**
   * Guard first, mutate second: the local state is only touched inside the guarded
   * action. Mutating before would leave, on a rejected code, a drawing on screen that
   * the store does not have — exactly the fault fixed earlier in the rights work.
   */
  const update = (f: (s: Play) => Play, pushUndo = true) => guard('manage', () => {
    const next = f(play)
    if (pushUndo) setUndoStack((p) => {
      const copy = [...p]
      const before: UndoStep = { step: structuredClone(step), props: structuredClone(play.props) }
      copy[index] = [...(copy[index] ?? []), before].slice(-UNDO_DEPTH)
      return copy
    })
    setPlay(next)
    savePlay(next)
  })

  const updateStep = (f: (t: Step) => Step) =>
    update((s) => ({ ...s, steps: s.steps.map((t, i) => (i === index ? f(t) : t)) }))

  const undoLast = () => {
    const entry = undoStack[index]?.at(-1)
    if (!entry) return
    guard('manage', () => {
      const next = { ...play, props: entry.props, steps: play.steps.map((t, i) => (i === index ? entry.step : t)) }
      setUndoStack((p) => p.map((s, i) => (i === index ? s.slice(0, -1) : s)))
      setPlay(next)
      savePlay(next)
    })
  }

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toSvg(e, e.currentTarget)
    // Without capture, a finger leaving the court would leave the gesture hanging.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no active pointer (jsdom) */ }
    const marker = markerUnder(step, p)
    if (tool === 'deplacer') {
      if (marker) { setGrab({ what: { kind: 'pion', side: marker.side, position: marker.position }, origin: marker.at, at: marker.at }); return }
      const i = propUnder(play.props, p)
      if (i >= 0) setGrab({ what: { kind: 'objet', index: i }, origin: play.props[i].at, at: play.props[i].at })
      return
    }
    if (tool === 'ball') {
      updateStep((t) => ({ ...t, ball: marker ? { side: marker.side, position: marker.position } : p }))
      return
    }
    if (tool === 'objet') {
      update((s) => ({ ...s, props: [...s.props, { kind: propKind, at: p }] }))
      return
    }
    if (tool === 'gomme') {
      const f = arrowUnder(step, p)
      if (f >= 0) { updateStep((t) => ({ ...t, arrows: t.arrows.filter((_, k) => k !== f) })); return }
      const o = propUnder(play.props, p)
      if (o >= 0) update((s) => ({ ...s, props: s.props.filter((_, k) => k !== o) }))
      return
    }
    // An arrow always starts from a marker: elsewhere, the gesture draws nothing. And
    // it starts from that marker's exact position, not from the point touched — a
    // finger lands within a grab radius, which would detach the stroke from the marker,
    // and the animation would start the player next to themselves.
    if (marker) setDrawing({ from: { side: marker.side, position: marker.position }, points: [marker.at] })
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!grab && !drawing) return
    const p = toSvg(e, e.currentTarget)
    if (grab) { setGrab({ ...grab, at: p }); return }
    setDrawing((d) => d && { ...d, points: [...d.points, p] })
  }

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toSvg(e, e.currentTarget)
    if (grab) {
      const { what, origin } = grab
      setGrab(null)
      // A marker put back where it was is not a change: no undo entry, no write.
      if (dist(origin, p) > 0.005) update((s) => moveTo(s, index, what, p))
      return
    }
    if (!drawing) return
    const { from } = drawing
    const points = simplifyPath([...drawing.points, p])
    setDrawing(null)
    if (!points.some((q) => dist(q, points[0]) > MIN_STROKE)) return
    updateStep((t) => ({ ...t, arrows: [...t.arrows, { from, points, stroke: tool as Stroke }] }))
  }

  const changeCourt = (court: Court) => guard('manage', () => {
    const r = toCourt(play, court)
    if ('refused' in r) { setRefused(translate('play.halfCourtRefused', { occupant: translate(r.refused.key, { n: r.refused.n ?? 0 }) })); return }
    setRefused('')
    // Changing the court remaps every coordinate: the stacked entries are in the old
    // scale and restoring them would put the markers anywhere — at worst in the back
    // court. We clear it, as on reordering.
    setUndoStack([])
    setPlay(r.ok)
    savePlay(r.ok)
  })

  // Defence touches every step at once: it falls outside the undo stack, which is per
  // step. Its protection is the confirmation before removal.
  // And it clears the stack, like the court change: a stacked entry carries ten markers
  // when the play has just gone back to five. Restoring it would write a play without
  // defence but with its defenders — the "five or ten markers depending on `defense`"
  // invariant broken, and written to the store.
  const changeDefense = (v: boolean) => {
    if (!v) { setAskDefense(true); return }
    update((s) => { setUndoStack([]); return { ...s, defense: true, steps: s.steps.map((t) => withDefense(t, s.court)) } }, false)
  }
  const removeDefense = () => update((s) => { setUndoStack([]); return { ...s, defense: false, steps: s.steps.map(withoutDefense) } }, false)

  const addStep = () => update((s) => {
    setStepIndex(s.steps.length)          // the step just added becomes the current one
    return { ...s, steps: [...s.steps, nextStep(s.steps[s.steps.length - 1])] }
  }, false)

  // Reordering or deleting shifts the indices: the stack, indexed by rank, would lie.
  // We clear it rather than let it point at the wrong step.
  const moveStep = (delta: number) => {
    const j = index + delta
    if (j < 0 || j >= play.steps.length) return
    update((s) => {
      const t = [...s.steps]
      ;[t[index], t[j]] = [t[j], t[index]]
      setStepIndex(j)
      setUndoStack([])
      return { ...s, steps: t }
    }, false)
  }
  const deleteStep = () => update((s) => {
    setStepIndex(Math.max(0, index - 1))
    setUndoStack([])
    return { ...s, steps: s.steps.filter((_, i) => i !== index) }
  }, false)

  // The fields no longer have to demand a code on every keystroke: the editor is only
  // entered with the right (cf. the redirect above). Saving stays guarded — `update` is
  // the only door to the store.
  const saveName = () => { if (name.trim() && name !== play.name) update((s) => ({ ...s, name: name.trim() }), false) }
  const saveNote = () => { if ((note.trim() || undefined) !== play.note) update((s) => ({ ...s, note: note.trim() || undefined }), false) }

  const shown = grab ? moveTo(play, index, grab.what, grab.at) : play

  // The step strip aligns with the court — it shows its states — but does not shrink
  // below a usable width: a full court is only 26vh wide, and the header would wrap
  // onto two lines there while the thumbnails got clipped. The `min(100%, …)` keeps
  // the promise never to overflow.
  const stripWidth = `min(100%, max(320px, ${courtWidth(play.court, 'edition')}))`

  // The only screen in the repo that breathes narrower on a phone (`p-4` instead of
  // `p-6`): the sixteen pixels given back to the court are sixteen more pixels for
  // aiming at a marker with a thumb, and aiming is what happens here.
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/schemas" aria-label={translate('edit.backToPlays')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ border: bd, color: C.muted }}>←</Link>
        <input
          aria-label={translate('edit.playName')} value={name} onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ ...field, flex: '1 1 180px', minWidth: 0, fontWeight: 800 }}
        />
        {/* Seeing what you have just drawn means playing it: the viewer is a finger
            away from the editor, tinted with the accent as everywhere else — the same
            gesture on all four screens. */}
        <Link
          to={`/schemas/${id}/lecteur`}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold"
          style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBd}` }}
        >
          {translate('play.play')}
        </Link>
      </div>

      {/* `[&>*]:min-w-0`: without it, a non-breaking row of controls imposes its
          intrinsic width on the grid column, which then overflows the screen — and
          takes the court with it. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <div>
          {/* The toolbar above the court, within thumb reach. `select-none` everywhere
              people tap: on mobile, a slightly long press otherwise selects the button's
              label instead of pressing it. */}
          <div className="mb-3 flex select-none flex-wrap items-center gap-2">
            <ToolGroup title={translate('edit.handle')}>
              {HANDLE.map((o) => (
                <ToolButton key={o.key} label={translate(o.label)} active={tool === o.key} onClick={() => setTool(o.key)}>
                  <Ic d={o.icon} className="h-[19px] w-[19px]" />
                </ToolButton>
              ))}
            </ToolGroup>
            <ToolGroup title={translate('edit.draw')}>
              {DRAW.map((t) => (
                <ToolButton key={t.key} label={translate(t.label)} active={tool === t.key} onClick={() => setTool(t.key)}>
                  <StrokeGlyph stroke={t.key} />
                </ToolButton>
              ))}
            </ToolGroup>
            <ToolGroup title={translate('edit.place')}>
              {PLACE.map((o) => (
                <ToolButton key={o.key} label={translate(o.label)} active={tool === o.key} onClick={() => setTool(o.key)}>
                  <PlaceGlyph what={o.key} active={tool === o.key} />
                </ToolButton>
              ))}
            </ToolGroup>
            {/* An explicit accessible name: a bare "Undo" is confused with the cancel
                button of the confirmation dialogs. */}
            <button
              onClick={undoLast} disabled={!undoStack[index]?.length} aria-label={translate('edit.undoLast')}
              className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-40"
              style={{ background: C.card, border: bd, color: C.text }}
            >
              <span className="text-base leading-none">↩</span> {translate('common.cancel')}
            </button>
          </div>
          {tool === 'objet' && (
            <div className="mb-3 flex select-none flex-wrap gap-2">
              {PROP_KINDS.map((s) => (
                <button
                  key={s.key} onClick={() => setPropKind(s.key)} aria-pressed={propKind === s.key}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
                  style={propKind === s.key ? { background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}` } : { background: C.card, border: bd, color: C.muted }}
                >
                  {translate(s.label)}
                </button>
              ))}
            </div>
          )}

          {/* The court is bounded by width, never by height: its box's ratio must stay
              the viewBox's, otherwise the SVG centres itself inside margins and `toSvg`
              converts crooked. The bound says three things at once (width available,
              screen height, ceiling); `courtWidth` is what holds them.
              `select-none`: without it, a drag selects the markers' numbers. */}
          <div className="select-none" style={{ maxWidth: courtWidth(play.court, 'edition') }}>
            <PlayBoard play={shown} stepIndex={index} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              {/* The gesture in progress, raw: it disappears on release, replaced by the
                  simplified arrow — or by nothing at all if the right was refused. */}
              {drawing && drawing.points.length > 1 && (
                <polyline
                  points={drawing.points.map((p) => `${(p.x * W).toFixed(1)},${(p.y * height).toFixed(1)}`).join(' ')}
                  fill="none" stroke={C.accent} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                />
              )}
            </PlayBoard>
          </div>

          {/* Reordering and deleting a step are rare gestures: they need not hold a
              full-width row under the strip, where the phone's navigation bar caught up
              with them. They now sit in the strip's header, against the number of the
              step they act on — and the whole strip aligns with the court's width, whose
              states it shows. */}
          <div className="mt-4 flex select-none items-center gap-2" style={{ maxWidth: stripWidth }}>
            <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.faint }}>
              {translate('play.step', { n: index + 1, total: play.steps.length })}
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              <StepControl label={translate('edit.stepBack')} onClick={() => moveStep(-1)} disabled={index === 0}>◀</StepControl>
              <StepControl label={translate('edit.stepForward')} onClick={() => moveStep(1)} disabled={index === play.steps.length - 1}>▶</StepControl>
              {/* A play always has at least one step: the last cannot be deleted. */}
              <StepControl label={translate('edit.deleteStep')} onClick={deleteStep} disabled={play.steps.length === 1} danger><X className="h-4 w-4" strokeWidth={2.5} /></StepControl>
            </div>
          </div>

          {/* The step strip under the court: the whole play reads there. */}
          <div className="mt-2 flex select-none items-stretch gap-2 overflow-x-auto pb-1" style={{ maxWidth: stripWidth }}>
            {play.steps.map((_, i) => (
              <button
                key={i} aria-label={translate('edit.stepN', { n: i + 1 })} aria-pressed={i === index} onClick={() => setStepIndex(i)}
                className="w-20 shrink-0 rounded-xl p-1"
                style={{ background: C.card, border: i === index ? `2px solid ${C.accent}` : bd }}
              >
                <PlayBoard play={play} stepIndex={i} apercu />
                <span className="mt-1 block text-[12px] font-bold" style={{ color: i === index ? C.accent : C.muted }}>{i + 1}</span>
              </button>
            ))}
            <button
              onClick={addStep} aria-label={translate('edit.addStep')}
              className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-bold"
              style={{ background: C.card, border: `1px dashed ${C.border}`, color: C.muted }}
            >
              <span className="text-lg leading-none" style={{ color: C.accent }}>+</span>
              {translate('edit.step')}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('edit.court')}</p>
            <div className="flex gap-2">
              {(['half', 'full'] as Court[]).map((t) => (
                <button
                  key={t} onClick={() => changeCourt(t)} aria-pressed={play.court === t}
                  className="min-w-0 flex-1 rounded-xl py-2 text-xs font-bold"
                  style={play.court === t ? { background: C.brand, color: C.onBrand } : { background: C.panel, border: bd, color: C.text }}
                >
                  {translate(t === 'half' ? 'play.halfCourt' : 'play.fullCourt')}
                </button>
              ))}
            </div>
            {refused && <p className="mt-2 text-[12px] font-semibold" style={{ color: C.accent }}>{refused}</p>}
            {/* `-mx-2 px-2 py-2.5`: it is the label people touch, not the box, and it
                stood twenty pixels tall — for a toggle that redraws the whole play and
                asks for confirmation. The negative margin keeps the text visually
                aligned with the rest of the card. */}
            <label className="-mx-2 mt-3 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold">
              <input type="checkbox" checked={play.defense} onChange={(e) => changeDefense(e.target.checked)} />
              {translate('edit.defence')}
            </label>
          </section>

          <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
            <label htmlFor="schema-note" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('edit.note')}</label>
            <input
              id="schema-note" value={note} onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder={translate('edit.notePlaceholder')} style={{ ...field, width: '100%' }}
            />
            {!remoteEnabled() && <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('play.playsLocal')}</p>}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={askDefense} danger
        title={translate('edit.removeDefenceTitle')}
        message={translate('edit.removeDefenceText')}
        confirmLabel={translate('common.remove')} onConfirm={removeDefense} onClose={() => setAskDefense(false)}
      />
    </div>
  )
}

/** One family of tools: its own segment, its own background. It is the shape that
 *  says "this does not do the same thing as that" — the title stays for screen
 *  readers, and shows as soon as there is room. */
function ToolGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex shrink-0 items-center gap-1 rounded-2xl p-1" style={{ background: C.panel, border: bd }}>
      <span className="hidden pl-1.5 pr-0.5 text-[12px] font-black uppercase tracking-wider xl:inline" style={{ color: C.faint }}>{title}</span>
      {children}
    </div>
  )
}

/** One tool. The pictogram carries the meaning, the `aria-label` carries the name:
 *  the button stays "Cut" for a screen reader as for a test, without the word stealing
 *  room from the drawing. */
function ToolButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label} aria-pressed={active}
      className="grid h-10 min-w-10 place-items-center rounded-xl px-1.5 transition"
      style={active ? { background: C.brand, color: C.onBrand } : { background: 'transparent', color: C.muted }}
    >
      {children}
    </button>
  )
}

/** What the button places, drawn as the board draws it: the ball is the amber disc
 *  seen on the court, the cone its amber triangle. A generic outline read as "globe";
 *  here the button shows its effect literally. */
function PlaceGlyph({ what, active }: { what: Tool; active: boolean }) {
  const tint = active ? C.onBrand : C.amber
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]">
      {what === 'ball'
        ? <circle cx={12} cy={12} r={7} fill={tint} />
        : <path d="M12 4.5 20 19.5H4z" fill={tint} />}
    </svg>
  )
}

/** The stroke as the board draws it: solid with a head for a cut, T-barred for a
 *  screen, dashed for a pass, wavy for a dribble. It is the coach's notebook
 *  convention, the same as `PlayBoard` — a word takes three seconds to say what this
 *  glyph says at a glance. */
function StrokeGlyph({ stroke }: { stroke: Stroke }) {
  return (
    <svg viewBox="0 0 34 22" className="h-[22px] w-[34px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path
        d={stroke === 'dribble' ? 'M3 15q2.5-6 5 0t5 0t5 0t5 0' : `M3 15h${stroke === 'screen' ? 24 : 20}`}
        strokeDasharray={stroke === 'pass' ? '4.5 3.5' : undefined}
      />
      <path d={stroke === 'screen' ? 'M27 8v14' : 'm22 10 5 5-5 5'} />
    </svg>
  )
}

/** One control of the step strip: square, thumb-sized, and danger alone outlined in
 *  the accent — the rest of the repo does no differently. */
function StepControl({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled: boolean; danger?: boolean; children: ReactNode
}) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-xs font-black disabled:opacity-30"
      style={danger ? { border: `1px solid ${C.accentBd}`, color: C.accent } : { background: C.card, border: bd, color: C.text }}
    >
      {children}
    </button>
  )
}
