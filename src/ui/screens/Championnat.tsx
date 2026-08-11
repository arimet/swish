import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import { standings } from '../../domain/standings'
import { listMatches, listResults, saveResult, deleteResult } from '../../persistence/repositories'
import type { Match, ReportedResult } from '../../domain/types'
import { C, bd, champLabel, TeamBadge, PageTitle } from '../olive/kit'
import { useAdmin } from '../../app/admin'
import { useClub } from '../../app/club'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/** Clé d'une confrontation, insensible au sens domicile/extérieur — même principe que
 *  `domain/standings.ts` : elle sert ici à repérer, avant l'enregistrement, un résultat
 *  qui ferait doublon soit avec un autre résultat saisi, soit avec une de nos rencontres. */
const affiche = (champ: string, x: string, y: string, date?: string) => `${champ}|${[x, y].sort().join('~')}|${date ?? ''}`

export function Championnat() {
  const { clubId, teams } = useClub()
  const { guard } = useAdmin()
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<ReportedResult[]>([])
  const [erreur, setErreur] = useState('')

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  // Le championnat de nos rencontres sert de valeur par défaut au formulaire : la
  // plupart des résultats saisis à la main concernent la même poule que la nôtre.
  const notreChamp = useMemo(() => {
    const m = matches.find((mm) => mm.meta.clubId === clubId)
    return m ? champLabel(m.meta) : ''
  }, [matches, clubId])

  const rafraichir = () => Promise.all([listMatches(), listResults()]).then(([m, r]) => { setMatches(m); setResults(r) })
  useEffect(() => { rafraichir() }, [])

  const groups = useMemo(() => standings(matches, results, teamsById), [matches, results, teamsById])

  const [champ, setChamp] = useState('')
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [date, setDate] = useState('')
  // Le formulaire suit le championnat de nos rencontres tant que l'utilisateur ne l'a
  // pas modifié à la main — un `useState` figé au montage manquerait les matchs chargés
  // après le premier rendu (ils arrivent de façon asynchrone).
  useEffect(() => { if (!champ) setChamp(notreChamp) }, [notreChamp, champ])
  useEffect(() => {
    if (!homeId && teams[0]) setHomeId(teams[0].id)
    if (!awayId && teams[1]) setAwayId(teams[1].id)
  }, [teams, homeId, awayId])

  // Signal informatif, calculé en direct pendant la saisie : la confrontation en cours
  // de saisie correspond déjà à une de nos rencontres terminées, le classement l'ignorera.
  const dejaNotreRencontre = useMemo(() => {
    if (!homeId || !awayId || homeId === awayId) return false
    const clé = affiche(champ.trim() || 'Match amical', homeId, awayId, date || undefined)
    return matches.some((m) => m.status === 'finished' && affiche(champLabel(m.meta), m.meta.clubId, m.meta.opponentId, m.meta.date) === clé)
  }, [matches, champ, homeId, awayId, date])

  const peutAjouter = !!homeId && !!awayId && homeId !== awayId && homeScore !== '' && awayScore !== ''

  const ajouter = () => {
    if (!peutAjouter) return
    const champLbl = champ.trim() || 'Match amical'
    const clé = affiche(champLbl, homeId, awayId, date || undefined)
    // Deux saisies de la même confrontation — même dans l'ordre inverse — compteraient
    // deux fois au classement : rien côté domaine ne s'en protège, c'est ici qu'il faut l'empêcher.
    if (results.some((r) => affiche(r.championshipLabel, r.homeId, r.awayId, r.date) === clé)) {
      setErreur('Ce résultat est déjà saisi pour cette confrontation.')
      return
    }
    setErreur('')
    guard(async () => {
      await saveResult({
        id: newId(), championshipLabel: champLbl, date: date || undefined,
        homeId, awayId, homeScore: Number(homeScore), awayScore: Number(awayScore),
      })
      setHomeScore(''); setAwayScore('')
      rafraichir()
    })
  }

  const majScore = (r: ReportedResult, patch: Partial<ReportedResult>) => guard(async () => {
    await saveResult({ ...r, ...patch })
    rafraichir()
  })
  const supprimer = (id: string) => guard(async () => { await deleteResult(id); rafraichir() })

  return (
    <div className="p-6">
      <PageTitle subtitle="Le classement de nos poules, à partir de nos rencontres et des résultats relevés à la main." />

      {/* 1. Le classement d'abord : c'est ce qu'on ouvre l'écran pour voir. */}
      <div className="space-y-6">
        {results.length === 0 && (
          <p className="rounded-2xl border border-dashed px-4 py-3 text-sm" style={{ borderColor: C.border, color: C.muted }}>
            Aucun résultat saisi pour l’instant : le classement ne porte que sur nos propres rencontres et reste donc incomplet.
          </p>
        )}
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed py-10 text-center text-sm" style={{ borderColor: C.border, color: C.muted }}>Aucun classement à afficher.</p>
        ) : groups.map(({ champ: c, lines }) => (
          <section key={c} className="overflow-x-auto rounded-2xl p-4" style={{ background: C.card, border: bd }}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{c}</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase" style={{ color: C.faint }}>
                  <th className="py-1.5 pr-2">#</th><th className="pr-2">Équipe</th>
                  <th className="px-2 text-center">J</th><th className="px-2 text-center">V</th><th className="px-2 text-center">D</th>
                  <th className="px-2 text-center">Pour</th><th className="px-2 text-center">Contre</th><th className="px-2 text-center">Diff</th><th className="px-2 text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} style={l.id === clubId ? { background: C.accentBg } : undefined}>
                    <td className="rounded-l-lg py-2 pr-2 font-bold" style={{ color: C.faint }}>{i + 1}</td>
                    <td className="pr-2">
                      <span className="flex items-center gap-2 font-semibold"><TeamBadge id={l.id} name={l.name} size="h-6 w-6 text-[8px]" />{l.name}</span>
                    </td>
                    <td className="px-2 text-center tabular-nums">{l.j}</td>
                    <td className="px-2 text-center tabular-nums">{l.v}</td>
                    <td className="px-2 text-center tabular-nums">{l.d}</td>
                    <td className="px-2 text-center tabular-nums">{l.pf}</td>
                    <td className="px-2 text-center tabular-nums">{l.pa}</td>
                    <td className="px-2 text-center tabular-nums">{l.pf - l.pa > 0 ? `+${l.pf - l.pa}` : l.pf - l.pa}</td>
                    <td className="rounded-r-lg px-2 text-center font-black tabular-nums" style={{ color: C.accent }}>{l.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {/* 2. La saisie, réservée à l'admin. */}
      <section className="mt-8 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <p className="mb-4 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Saisir un résultat extérieur</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker id="champ-home" label="Équipe reçue" value={homeId} onChange={setHomeId} teams={teams} />
          <Picker id="champ-away" label="Équipe visiteuse" value={awayId} onChange={setAwayId} teams={teams} />
          <Field id="champ-home-score" label="Score équipe reçue" type="number" value={homeScore} onChange={setHomeScore} />
          <Field id="champ-away-score" label="Score équipe visiteuse" type="number" value={awayScore} onChange={setAwayScore} />
          <Field id="champ-date" label="Date de la rencontre" type="date" value={date} onChange={setDate} />
          <Field id="champ-label" label="Championnat" value={champ} onChange={setChamp} />
        </div>

        {dejaNotreRencontre && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: C.amberBg, color: C.amber }}>
            Cette confrontation correspond déjà à une de nos rencontres : elle est connue et le classement l’ignorera.
          </p>
        )}
        {erreur && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: 'rgba(255,77,109,0.14)', color: C.pink }}>{erreur}</p>
        )}

        <button onClick={ajouter} disabled={!peutAjouter} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: C.accent }}>
          Ajouter le résultat
        </button>
      </section>

      {/* 3. La liste des résultats saisis, corrigeables et supprimables. */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Résultats saisis</p>
        {results.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: C.muted }}>Rien à afficher ici pour l’instant.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                <TeamBadge id={r.homeId} name={teamsById[r.homeId]?.name ?? '—'} size="h-6 w-6 text-[8px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{teamsById[r.homeId]?.name ?? '—'}</span>
                <label htmlFor={`score-home-${r.id}`} className="sr-only">Score {teamsById[r.homeId]?.name ?? 'équipe reçue'}</label>
                <input id={`score-home-${r.id}`} type="number" defaultValue={r.homeScore} style={{ ...field, width: 64, height: 36 }} className="text-center text-sm"
                  onBlur={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n) && n !== r.homeScore) majScore(r, { homeScore: n }) }} />
                <span className="text-xs font-bold" style={{ color: C.faint }}>–</span>
                <label htmlFor={`score-away-${r.id}`} className="sr-only">Score {teamsById[r.awayId]?.name ?? 'équipe visiteuse'}</label>
                <input id={`score-away-${r.id}`} type="number" defaultValue={r.awayScore} style={{ ...field, width: 64, height: 36 }} className="text-center text-sm"
                  onBlur={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n) && n !== r.awayScore) majScore(r, { awayScore: n }) }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{teamsById[r.awayId]?.name ?? '—'}</span>
                <TeamBadge id={r.awayId} name={teamsById[r.awayId]?.name ?? '—'} size="h-6 w-6 text-[8px]" />
                <span className="text-[11px] font-semibold" style={{ color: C.faint }}>{r.championshipLabel}</span>
                <button onClick={() => supprimer(r.id)} aria-label="Supprimer ce résultat" className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.pink }}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {/* Les résultats saisis à la main ne passent pas par la synchronisation : sans
            cette mention, un utilisateur qui ouvre l'app sur un autre appareil trouverait
            un classement vide sans comprendre pourquoi. */}
        <p className="mt-4 text-[11px]" style={{ color: C.faint }}>Ces résultats restent sur cet appareil : ils ne sont pas synchronisés avec vos autres appareils.</p>
      </section>
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm [color-scheme:dark]" style={field} />
    </div>
  )
}
function Picker({ id, label, value, onChange, teams }: { id: string; label: string; value: string; onChange: (id: string) => void; teams: { id: string; name: string }[] }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field}>
        <option value="">— Choisir —</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}
