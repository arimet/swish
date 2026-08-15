import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { listPlayers, listTeams, saveMatch } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import type { Match, Team } from '../../domain/types'
import { C, bd, TeamBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { publishBundle } from '../../app/sync'

const input = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/** Planification d'une rencontre : notre club (celui suivi par l'appareil) est
 *  fixé d'avance, seul l'adversaire se choisit ici — il n'a pas d'effectif à
 *  détailler, son score se saisira globalement pendant le match. */
export function MatchSetup({ onCreated }: { onCreated: (id: string) => void }) {
  const { can, guard } = useAuth()
  const { clubId, club, ready } = useClub()
  const [teams, setTeams] = useState<Team[] | null>(null) // null = pas encore chargé
  useEffect(() => { refresh().then(() => listTeams()).then(setTeams) }, [])
  const opponents = (teams ?? []).filter((t) => t.id !== clubId)
  const [championshipLabel, setChampionship] = useState('')
  // La liste des équipes charge de façon asynchrone : un état initialisé une
  // fois au montage figerait ce choix sur « aucun adversaire ».
  const [pickedOpponentId, setOpponentId] = useState('')
  const opponentId = pickedOpponentId || opponents[0]?.id || ''
  const [matchNumber, setNum] = useState(''); const [venue, setVenue] = useState('')
  const [date, setDate] = useState(''); const [time, setTime] = useState('')

  const nameOf = (id: string) => teams?.find((t) => t.id === id)?.name ?? '—'

  const create = async () => {
    if (!clubId) return
    const roster = await listPlayers(clubId)
    const match: Match = {
      id: newId(),
      meta: {
        championshipLabel: championshipLabel.trim() || undefined, matchNumber: matchNumber.trim() || undefined,
        venue: venue.trim() || undefined, date: date || undefined, time: time || undefined,
        clubId, opponentId,
        coachA: club?.coach,
      },
      roster: roster.map((p) => p.id), events: [], status: 'setup',
    }
    await saveMatch(match)
    publishBundle({ match, players: roster, teamNames: { A: club?.name ?? nameOf(clubId), B: nameOf(opponentId) } })
    onCreated(match.id)
  }
  const canCreate = !!clubId && !!opponentId

  // Cet écran n'existe que pour écrire une rencontre : les boutons qui y mènent
  // ont disparu pour qui ne gère pas le club, et l'URL directe le renvoie au
  // calendrier plutôt que de lui présenter un formulaire sans bouton d'envoi.
  // La garde sur la création reste en place derrière ce renvoi.
  if (!can('manage')) return <Navigate to="/calendrier" replace />

  if (!ready || teams === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="h-8 w-40 animate-pulse rounded-lg" style={{ background: C.card }} />
        <div className="mt-6 h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      </div>
    )
  }

  if (!club) return null

  if (opponents.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-extrabold tracking-tight">Nouveau match</h1>
        <div className="mt-6 rounded-2xl p-10 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>Il faut au moins <strong style={{ color: C.text }}>une autre équipe</strong> pour créer une rencontre.</p>
          <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>Créer une équipe →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge id={club.id} name={club.name} size="h-10 w-10 text-xs" />
          <span className="line-clamp-2 text-sm font-bold">{club.name}</span>
          <span className="text-[12px] font-semibold" style={{ color: C.muted }}>Locaux</span>
        </div>
        <span className="text-lg font-black" style={{ color: C.faint }}>VS</span>
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamBadge id={opponentId} name={nameOf(opponentId)} size="h-10 w-10 text-xs" />
          <span className="line-clamp-2 text-sm font-bold">{nameOf(opponentId)}</span>
          <span className="text-[12px] font-semibold" style={{ color: C.muted }}>Visiteurs</span>
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
        <Picker id="opp" label="Adversaire" teams={opponents} value={opponentId} onChange={setOpponentId} />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Link to="/" className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>Annuler</Link>
        <button onClick={() => guard('manage', create)} disabled={!canCreate} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>Planifier la rencontre →</button>
      </div>
    </div>
  )
}

function Field({ id, label, value, onChange, placeholder, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full text-sm" style={input} />
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
