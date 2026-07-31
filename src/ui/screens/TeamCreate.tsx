import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { saveTeam, savePlayer } from '../../persistence/repositories'
import type { Player } from '../../domain/types'
import { C, bd, PageTitle } from '../olive/kit'
import { useAdmin } from '../../app/admin'

type Draft = Omit<Player, 'id' | 'teamId'>
const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }
const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{children}</label>

export function TeamCreate() {
  const navigate = useNavigate()
  const { guard } = useAdmin()
  const [name, setName] = useState(''); const [coach, setCoach] = useState('')
  const [roster, setRoster] = useState<Draft[]>([])
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')

  const addToRoster = () => {
    if (!num || !ln.trim()) return
    setRoster((r) => [...r, { number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim() }])
    setNum(''); setLn(''); setFn('')
  }
  const create = async () => {
    if (!name.trim()) return
    const teamId = newId()
    await saveTeam({ id: teamId, name: name.trim(), coach: coach.trim() || undefined })
    for (const p of roster) await savePlayer({ id: newId(), teamId, ...p })
    navigate(`/teams/${teamId}`)
  }

  return (
    <div className="p-6">
      <Link to="/teams" className="text-sm font-semibold" style={{ color: C.muted }}>← Équipes</Link>
      <PageTitle title="Nouvelle équipe" subtitle="Nommez l’équipe, son entraîneur, et ajoutez ses joueurs." />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5 self-start rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <div><Label htmlFor="team-name">Nom de l'équipe</Label>
            <input id="team-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. AVENIR DE VIGNOT" style={{ ...field, width: '100%' }} /></div>
          <div><Label>Entraîneur</Label>
            <input value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="ex. BART S." style={{ ...field, width: '100%' }} /></div>
          <p className="text-[11px]" style={{ color: C.muted }}>{roster.length} joueur{roster.length > 1 ? 's' : ''} ajouté{roster.length > 1 ? 's' : ''}.</p>
        </div>

        <div className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <Label>Joueurs</Label>
          {roster.length > 0 && (
            <ul className="mb-3 grid gap-1.5 sm:grid-cols-2">
              {roster.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <span className="grid h-7 w-7 place-items-center rounded-lg text-xs font-extrabold" style={{ background: C.accentBg, color: C.accent }}>{p.number}</span>
                  <span className="font-semibold">{p.lastName}</span><span style={{ color: C.muted }}>{p.firstName}</span>
                  <button onClick={() => setRoster((r) => r.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold" style={{ color: C.pink }}>retirer</button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-[68px_1fr_1fr_44px] items-center gap-2">
            <input placeholder="N°" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center' }} />
            <input placeholder="Nom" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={field} />
            <input placeholder="Prénom" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={field} />
            <button onClick={addToRoster} className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: C.accent }}>+</button>
          </div>
          {roster.length === 0 && <p className="mt-3 text-sm" style={{ color: C.muted }}>Ajoutez vos joueurs un par un (numéro, nom, prénom).</p>}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Link to="/teams" className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>Annuler</Link>
        <button onClick={() => guard(create)} disabled={!name.trim()} className="rounded-xl px-6 py-3 text-sm font-bold text-white disabled:opacity-40" style={{ background: C.accent }}>Créer l'équipe →</button>
      </div>
    </div>
  )
}
