/**
 * A play that arrived by link. The whole play is in the URL's fragment: nothing to
 * install, nothing to synchronise, no server to ask. Hence this screen's place —
 * outside the shell and **outside the club gate**: whoever receives the link may
 * never have opened the application, and sending them to the welcome screen would
 * hide from them the very thing they were sent.
 *
 * Reading is ungated. Only "Add to my library" writes, and so goes through the
 * administrator code.
 *
 * It is the one write button in the repo that stays visible without the right, and
 * that is deliberate: this screen lives outside the shell, so it has no access menu
 * to hand. Hiding it would condemn the import — a coach who receives the link on a
 * phone where their session is new would have no door left to enter their code.
 * Here, the button IS the door.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { newId } from '../../domain/ids'
import { decode } from '../../domain/partage'
import type { Play } from '../../domain/plays'
import { savePlay } from '../../persistence/repositories'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function SchemaRecu() {
  const translate = useT()
  const { hash } = useLocation()
  const { guard } = useAuth()
  const { clubId, ready } = useClub()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<Play | null | undefined>(undefined)
  const [index, setIndex] = useState(0)

  // `useLocation().hash` carries the "#": the code starts at the next character.
  const code = hash.slice(1)

  useEffect(() => {
    let alive = true
    decode(code).then((s) => { if (alive) setSchema(s) })
    return () => { alive = false }
  }, [code])

  if (schema === undefined) return <Screen><p style={{ color: C.muted }}>{translate('recu.ouverture')}</p></Screen>
  if (schema === null) return (
    <Screen>
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-extrabold">{translate('recu.lienAbime')}</p>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            {translate('recu.lienExplication')}
          </p>
          <Link to="/" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('recu.ouvrirSwish')}
          </Link>
        </div>
      </div>
    </Screen>
  )

  const last = schema.steps.length - 1
  // Stepping is clamped, it does not wrap — the same rule as the reading screen.
  const go = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)))

  // A fresh play: new id, the recipient's club. The import therefore cannot
  // overwrite any existing play, even when sender and recipient share a database.
  const add = () => guard('manage', async () => {
    if (!clubId) return
    const s: Play = { ...schema, id: newId(), clubId }
    await savePlay(s)
    navigate(`/schemas/${s.id}`)
  })

  // The same width bound as the reading screen: it is the viewBox's ratio that must
  // hold, otherwise the half court overflows on a wide screen.
  const boardWidth = courtWidth(schema.court)

  return (
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 p-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('recu.titre')}</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{schema.name}</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {translate(schema.court === 'half' ? 'sch.demiTerrain' : 'sch.terrainComplet')} · {translate('sch.compteTemps', { count: schema.steps.length })}{schema.defense ? ` ${translate('sch.defense')}` : ''}
          </p>
        </div>

        {schema.note && <p className="rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{schema.note}</p>}

        <div className="select-none" style={{ maxWidth: boardWidth }}>
          <PlayBoard schema={schema} stepIndex={index} />
        </div>

        <div className="flex select-none items-center gap-3" style={{ maxWidth: boardWidth }}>
          <StepButton label={translate('lecteur.precedent')} onClick={() => go(-1)} disabled={index === 0}>◀</StepButton>
          <span className="flex-1 text-center text-sm font-extrabold">{translate('sch.temps', { n: index + 1, total: schema.steps.length })}</span>
          <StepButton label={translate('lecteur.suivant')} onClick={() => go(1)} disabled={index === last}>▶</StepButton>
        </div>

        {/* Until the teams are loaded we do not know whether a club is set: offering
            one or the other too early would make the screen flicker. */}
        {ready && (clubId ? (
          <button onClick={add} className="rounded-2xl py-3.5 text-sm font-black text-[var(--c-on-brand)]" style={{ background: C.brand, maxWidth: boardWidth }}>
            {translate('recu.ajouter')}
          </button>
        ) : (
          <Link to="/" className="rounded-2xl py-3.5 text-center text-sm font-black text-[var(--c-on-brand)]" style={{ background: C.brand, maxWidth: boardWidth }}>
            {translate('recu.choisirClub')}
          </Link>
        ))}

        <p className="text-[12px]" style={{ color: C.faint }}>
          {translate('recu.rienAInstaller')}
        </p>
      </div>
    </Screen>
  )
}

/** The viewer's full background: this link most often opens on a phone, outside the
 *  shell and its menu. */
function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

function StepButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick} aria-label={label} disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
      style={{ background: C.card, border: bd, color: C.text }}
    >
      {children}
    </button>
  )
}
