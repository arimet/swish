import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { listTeams, listPlayers, saveMatch } from '../../persistence/repositories'
import type { Match, Team } from '../../domain/types'
import { C, bd, PageTitle, TeamBadge } from '../olive/kit'
import { useAdmin } from '../../app/admin'
import { publishBundle } from '../../app/sync'

const input = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

export function MatchSetup({ onCreated }: { onCreated: (id: string) => void }) {
  const { guard } = useAdmin()
  const [teams, setTeams] = useState<Team[]>([])
  const [championshipLabel, setChampionship] = useState('')
  const [teamAId, setA] = useState(''); const [teamBId, setB] = useState('')
  const [matchNumber, setNum] = useState(''); const [venue, setVenue] = useState('')
  const [date, setDate] = useState(''); const [time, setTime] = useState('')
  useEffect(() => { listTeams().then((ts) => { setTeams(ts); setA(ts[0]?.id ?? ''); setB(ts[1]?.id ?? '') }) }, [])

  const create = async () => {
    const [pa, pb] = await Promise.all([listPlayers(teamAId), listPlayers(teamBId)])
    const match: Match = {
      id: newId(),
      meta: { championshipLabel: championshipLabel.trim() || undefined, matchNumber: matchNumber.trim() || undefined, venue: venue.trim() || undefined, date: date || undefined, time: time || undefined, teamAId, teamBId, coachA: teams.find((t) => t.id === teamAId)?.coach, coachB: teams.find((t) => t.id === teamBId)?.coach },
      roster: { A: pa.map((p) => p.id), B: pb.map((p) => p.id) }, events: [], status: 'setup',
    }
    await saveMatch(match)
    publishBundle({ match, players: [...pa, ...pb], teamNames: { A: nameOf(teamAId), B: nameOf(teamBId) } })
    onCreated(match.id)
  }
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? '—'
  const canCreate = !!teamAId && !!teamBId && teamAId !== teamBId

  if (teams.length < 2) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-extrabold tracking-tight">Nouveau match</h1>
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>Il faut au moins <strong style={{ color: C.text }}>deux équipes</strong> pour créer une rencontre.</p>
          <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>Créer mes équipes →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Nouveau match" subtitle="Planifiez la rencontre ; vous la démarrerez le jour du match." />

      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge id={teamAId} name={nameOf(teamAId)} size="h-10 w-10 text-xs" />
          <span className="line-clamp-2 text-sm font-bold">{nameOf(teamAId)}</span>
          <span className="text-[11px] font-semibold" style={{ color: C.muted }}>Locaux</span>
        </div>
        <span className="text-lg font-black" style={{ color: C.faint }}>VS</span>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge id={teamBId} name={nameOf(teamBId)} size="h-10 w-10 text-xs" />
          <span className="line-clamp-2 text-sm font-bold">{nameOf(teamBId)}</span>
          <span className="text-[11px] font-semibold" style={{ color: C.muted }}>Visiteurs</span>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="champ" label="Championnat (optionnel)" value={championshipLabel} onChange={setChampionship} placeholder="ex. Pré régionale · sinon match amical" />
          <Field id="num" label="Rencontre n° (optionnel)" value={matchNumber} onChange={setNum} placeholder="ex. 78" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="date" label="Date" type="date" value={date} onChange={setDate} />
          <Field id="time" label="Heure" type="time" value={time} onChange={setTime} />
        </div>
        <Field id="venue" label="Lieu" value={venue} onChange={setVenue} placeholder="ex. VIGNOT" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker id="ta" label="Équipe A · locaux" teams={teams} value={teamAId} onChange={setA} />
          <Picker id="tb" label="Équipe B · visiteurs" teams={teams} value={teamBId} onChange={setB} />
        </div>
        {teamAId === teamBId && <p className="text-sm font-semibold" style={{ color: C.amber }}>Choisissez deux équipes différentes.</p>}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Link to="/" className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>Annuler</Link>
        <button onClick={() => guard(create)} disabled={!canCreate} className="rounded-xl px-6 py-3 text-sm font-bold text-white disabled:opacity-40" style={{ background: C.accent }}>Planifier la rencontre →</button>
      </div>
    </div>
  )
}

function Field({ id, label, value, onChange, placeholder, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full text-sm [color-scheme:dark]" style={input} />
    </div>
  )
}
function Picker({ id, label, teams, value, onChange }: { id: string; label: string; teams: Team[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={input}>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}
