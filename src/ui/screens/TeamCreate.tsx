import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { saveTeam, savePlayer } from '../../persistence/repositories'
import type { Player } from '../../domain/types'
import { C, bd, NumBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'

type Draft = Omit<Player, 'id' | 'teamId'>
const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }
const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{children}</label>

export function TeamCreate() {
  const translate = useT()
  const navigate = useNavigate()
  const { guard, found } = useAuth()
  const { clubId, teams, setClub } = useClub()
  const [name, setName] = useState(''); const [coach, setCoach] = useState('')
  const [roster, setRoster] = useState<Draft[]>([])
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')

  const addToRoster = () => {
    if (!num || !ln.trim()) return
    setRoster((r) => [...r, { number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim() }])
    setNum(''); setLn(''); setFn('')
  }
  /* Founding the club: no team exists yet. It is the one moment where the
     application makes itself a first administrator without a code — see `found()` in
     `app/auth.tsx` for the justification, and the button below for what it changes.
     The condition is indeed "no team" and not "no club followed": someone who merely
     cleared their club choice is not a founder. */
  const founding = teams.length === 0

  const create = async () => {
    if (!name.trim()) return
    const teamId = newId()
    await saveTeam({ id: teamId, name: name.trim(), coach: coach.trim() || undefined })
    for (const p of roster) await savePlayer({ id: newId(), teamId, ...p })
    // No club followed: the team just created becomes it, otherwise the gate sends
    // us straight back to the welcome screen we have only just left.
    if (!clubId) setClub(teamId)
    // The founder becomes an administrator, on this device and for this session.
    // Without it, the volunteer who has just entered their roster stayed a "Visitor":
    // not a single create button left across five screens, and nothing told them that
    // "Access" in the sidebar was the way through.
    if (founding) found()
    navigate(`/teams/${teamId}`)
  }

  return (
    <div className="p-6">
      <Link to="/teams" className="-mx-2 inline-block px-2 py-1.5 text-sm font-semibold" style={{ color: C.muted }}>{translate('team.backToTeams')}</Link>
      {/* A real heading: this screen lives outside the shell, so no header names it on
          its behalf. */}
      <h1 className="mb-6 mt-2 text-2xl font-extrabold tracking-tight">{translate('create.title')}</h1>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5 self-start rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <div><Label htmlFor="team-name">{translate('create.teamName')}</Label>
            <input id="team-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={translate('create.namePlaceholder')} style={{ ...field, width: '100%' }} /></div>
          <div><Label htmlFor="team-coach">{translate('team.coach')}</Label>
            <input id="team-coach" value={coach} onChange={(e) => setCoach(e.target.value)} placeholder={translate('create.coachPlaceholder')} style={{ ...field, width: '100%' }} /></div>
          <p className="text-[12px]" style={{ color: C.muted }}>{translate('create.playerAdded', { count: roster.length })}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <Label>{translate('create.players')}</Label>
          {roster.length > 0 && (
            <ul className="mb-3 grid gap-1.5 sm:grid-cols-2">
              {roster.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <NumBadge n={p.number} size="h-7 w-7 rounded-lg text-xs" />
                  <span className="font-semibold">{p.lastName}</span><span style={{ color: C.muted }}>{p.firstName}</span>
                  <button onClick={() => setRoster((r) => r.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold" style={{ color: C.accent }}>{translate('team.remove')}</button>
                </li>
              ))}
            </ul>
          )}
          {/* Three real labels, above their fields, and not `placeholder`s: a
              placeholder vanishes at the first keystroke — the precise moment you check
              you are filling the right box — and leaves a screen reader announcing
              nothing but "edit text". */}
          <div className="grid grid-cols-[68px_1fr_1fr_44px] items-end gap-2">
            <div><Label htmlFor="roster-num">{translate('team.number')}</Label>
              <input id="roster-num" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center', width: '100%' }} /></div>
            <div><Label htmlFor="roster-last">{translate('team.lastName')}</Label>
              <input id="roster-last" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={{ ...field, width: '100%' }} /></div>
            <div><Label htmlFor="roster-first">{translate('team.firstName')}</Label>
              <input id="roster-first" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={{ ...field, width: '100%' }} /></div>
            <button onClick={addToRoster} aria-label={translate('create.addPlayer')} className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>+</button>
          </div>
          {roster.length === 0 && <p className="mt-3 text-sm" style={{ color: C.muted }}>{translate('create.instruction')}</p>}
        </div>
      </div>

      {/* The button stays visible without the right — this screen lives outside the
          shell and without an access menu, so hiding it would make the application
          impossible to start. And it must not merely *look* available: gating the code
          at create time puts the very first volunteer of a blank install in front of an
          administrator-code prompt nobody has given them, for the one action that makes
          the application usable. A visible button that opens a locked door is no better
          than a hidden one.
          Founding therefore asks for nothing: no team exists, there is no data to
          protect, and the administrator code defends data rather than access. From the
          second team on, the gate goes back to work. */}
      <div className="mt-6 flex justify-end gap-3">
        <Link to="/teams" className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{translate('common.cancel')}</Link>
        <button onClick={() => (founding ? create() : guard('manage', create))} disabled={!name.trim()} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {founding ? translate('create.createMyTeam') : translate('create.createTeam')}
        </button>
      </div>
    </div>
  )
}
