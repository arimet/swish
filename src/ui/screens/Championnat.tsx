import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import { standings, clefConfrontation } from '../../domain/standings'
import { listMatches, listResults, saveResult, deleteResult } from '../../persistence/repositories'
import type { Match, ReportedResult } from '../../domain/types'
import { C, bd, champLabel, TeamBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

export function Championnat() {
  const { clubId, teams } = useClub()
  const { can, guard } = useAuth()
  const [matches, setMatches] = useState<Match[]>([])
  const [results, setResults] = useState<ReportedResult[]>([])
  const [erreur, setErreur] = useState('')

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  // Le championnat de nos rencontres sert de valeur par défaut au formulaire : la
  // plupart des résultats saisis à la main concernent la même poule que la nôtre.
  // Sans rencontre enregistrée, on se replie sur le championnat du premier résultat
  // déjà saisi plutôt que de partir vide — sinon la saisie ouvrirait sous « Match
  // amical » une seconde table de classement à côté de celle déjà là.
  const notreChamp = useMemo(() => {
    const m = matches.find((mm) => mm.meta.clubId === clubId)
    if (m) return champLabel(m.meta)
    return results[0]?.championshipLabel ?? ''
  }, [matches, clubId, results])

  const rafraichir = () => Promise.all([listMatches(), listResults()]).then(([m, r]) => { setMatches(m); setResults(r) })
  useEffect(() => { rafraichir() }, [])

  const groups = useMemo(() => standings(matches, results, teamsById), [matches, results, teamsById])

  // Un formulaire de saisie apparaît sur un clic, jamais d'emblée : le classement
  // est ce qu'on vient lire, la saisie d'un résultat extérieur est l'exception.
  const [saisieOuverte, setSaisieOuverte] = useState(false)
  const [champ, setChamp] = useState('')
  const [champTouché, setChampTouché] = useState(false)
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [date, setDate] = useState('')
  // Le formulaire suit le championnat de nos rencontres tant que l'utilisateur ne l'a
  // pas modifié à la main — un `useState` figé au montage manquerait les matchs chargés
  // après le premier rendu (ils arrivent de façon asynchrone). Un drapeau explicite est
  // nécessaire ici : depuis que la valeur par défaut peut elle-même être non vide (repli
  // sur le championnat du premier résultat saisi), se fier au champ vide comme indice
  // « pas encore touché » réinstallerait le défaut au milieu d'un effacement volontaire.
  useEffect(() => { if (!champTouché) setChamp(notreChamp) }, [notreChamp, champTouché])
  useEffect(() => {
    if (!homeId && teams[0]) setHomeId(teams[0].id)
    if (!awayId && teams[1]) setAwayId(teams[1].id)
  }, [teams, homeId, awayId])

  // Un message d'erreur qui survit à la correction du formulaire accuserait à tort une
  // saisie qui ne pose plus problème : il s'efface dès que l'un des champs change.
  const changeChamp = (v: string) => { setErreur(''); setChamp(v); setChampTouché(true) }
  const changeHomeId = (v: string) => { setErreur(''); setHomeId(v) }
  const changeAwayId = (v: string) => { setErreur(''); setAwayId(v) }
  const changeHomeScore = (v: string) => { setErreur(''); setHomeScore(v) }
  const changeAwayScore = (v: string) => { setErreur(''); setAwayScore(v) }
  const changeDate = (v: string) => { setErreur(''); setDate(v) }

  // Signal informatif, calculé en direct pendant la saisie : la confrontation en cours
  // de saisie correspond déjà à une de nos rencontres terminées, le classement l'ignorera.
  const dejaNotreRencontre = useMemo(() => {
    if (!homeId || !awayId || homeId === awayId) return false
    const clé = clefConfrontation(champ.trim() || 'Match amical', homeId, awayId, date || undefined)
    return matches.some((m) => m.status === 'finished' && clefConfrontation(champLabel(m.meta), m.meta.clubId, m.meta.opponentId, m.meta.date) === clé)
  }, [matches, champ, homeId, awayId, date])

  const scoresValides = homeScore !== '' && awayScore !== '' && Number(homeScore) >= 0 && Number(awayScore) >= 0
  // La date entre dans la clé de confrontation (aller/retour) : sans elle, une même
  // rencontre saisie deux fois — une fois datée, une fois vide — produirait deux clés
  // distinctes et compterait double au classement. On l'exige donc dès la saisie.
  const peutAjouter = !!homeId && !!awayId && homeId !== awayId && scoresValides && !!date

  const ajouter = () => {
    if (!peutAjouter) return
    // Au basket, il y a prolongation : un match nul n'existe pas.
    if (Number(homeScore) === Number(awayScore)) {
      setErreur('Un match nul n’existe pas au basket : il y a prolongation.')
      return
    }
    const champLbl = champ.trim() || 'Match amical'
    const clé = clefConfrontation(champLbl, homeId, awayId, date)
    // Deux saisies de la même confrontation — même dans l'ordre inverse — compteraient
    // deux fois au classement : rien côté domaine ne s'en protège, c'est ici qu'il faut l'empêcher.
    if (results.some((r) => clefConfrontation(r.championshipLabel, r.homeId, r.awayId, r.date) === clé)) {
      setErreur('Ce résultat est déjà saisi pour cette confrontation.')
      return
    }
    setErreur('')
    guard('manage', async () => {
      await saveResult({
        id: newId(), championshipLabel: champLbl, date,
        homeId, awayId, homeScore: Number(homeScore), awayScore: Number(awayScore),
      })
      setHomeScore(''); setAwayScore('')
      rafraichir()
    })
  }

  const majScore = (r: ReportedResult, patch: Partial<ReportedResult>) => guard('manage', async () => {
    await saveResult({ ...r, ...patch })
    rafraichir()
  })
  // Garder d'abord, muter ensuite : les champs de score ne s'ouvrent à la frappe
  // qu'une fois le droit acquis. Garder à la validation ne suffirait pas — ils ne
  // sont pas contrôlés, React ne réinitialise pas un `defaultValue`, et un code
  // refusé laisserait à l'écran une valeur que la base n'a pas, sous un classement
  // qui continue de compter l'ancienne.
  const peutCorriger = can('manage')
  const demanderCode = () => guard('manage', () => {})
  const supprimer = (id: string) => guard('manage', async () => { await deleteResult(id); rafraichir() })

  return (
    <div className="p-6">
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

      {/* 2. La saisie, réservée à l'admin, repliée derrière son bouton. Ouvrir le
          formulaire est déjà une écriture : la garde est ici, pas seulement à
          l'enregistrement — un visiteur voit la demande de code, pas les champs. */}
      <section className="mt-8 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        {!saisieOuverte ? (
          <button onClick={() => guard('manage', () => setSaisieOuverte(true))} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.accent }}>
            + Saisir un résultat
          </button>
        ) : (
        <>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Saisir un résultat extérieur</p>
          <button onClick={() => setSaisieOuverte(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>Fermer</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker id="champ-home" label="Équipe reçue" value={homeId} onChange={changeHomeId} teams={teams} />
          <Picker id="champ-away" label="Équipe visiteuse" value={awayId} onChange={changeAwayId} teams={teams} />
          <Field id="champ-home-score" label="Score équipe reçue" type="number" min={0} value={homeScore} onChange={changeHomeScore} />
          <Field id="champ-away-score" label="Score équipe visiteuse" type="number" min={0} value={awayScore} onChange={changeAwayScore} />
          <Field id="champ-date" label="Date de la rencontre" type="date" value={date} onChange={changeDate} />
          <Field id="champ-label" label="Championnat" value={champ} onChange={changeChamp} />
        </div>

        {dejaNotreRencontre && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: C.amberBg, color: C.amber }}>
            Cette confrontation correspond déjà à une de nos rencontres : elle est connue et le classement l’ignorera.
          </p>
        )}
        {erreur && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: C.accentBg, color: C.pink }}>{erreur}</p>
        )}

        <button onClick={ajouter} disabled={!peutAjouter} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: C.accent }}>
          Ajouter le résultat
        </button>
        </>
        )}
      </section>

      {/* 3. La liste des résultats saisis, corrigeables et supprimables. */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Résultats saisis</p>
        {results.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: C.muted }}>Rien à afficher ici pour l’instant.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.id} className="rounded-xl px-3 py-2" style={{ background: C.panel }}>
                {/* Trois colonnes, dont deux égales : le bloc des scores garde donc la
                    même place au milieu d'une ligne à l'autre, quelle que soit la
                    longueur des noms. Le libellé du championnat et la suppression
                    passent en dessous — dans la même rangée, ils poussaient la
                    colonne centrale vers la gauche et faisaient passer le reste
                    à la ligne. Les noms sont serrés contre les scores (l'équipe
                    reçue alignée à droite), pour qu'on lise la rencontre d'un trait. */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className="flex min-w-0 items-center justify-end gap-2">
                    <TeamBadge id={r.homeId} name={teamsById[r.homeId]?.name ?? '—'} size="h-6 w-6 text-[8px]" />
                    <span className="truncate text-sm font-semibold">{teamsById[r.homeId]?.name ?? '—'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <label htmlFor={`score-home-${r.id}`} className="sr-only">Score {teamsById[r.homeId]?.name ?? 'équipe reçue'}</label>
                    <input id={`score-home-${r.id}`} type="number" min={0} defaultValue={r.homeScore} style={{ ...field, width: 64, height: 36 }} className="nums text-center text-sm"
                      readOnly={!peutCorriger} onFocus={demanderCode}
                      onBlur={(e) => {
                        // Un champ vidé n'est pas une saisie de 0 : c'est le premier geste de qui
                        // corrige une faute de frappe. `Number('')` vaut 0, pas NaN — sans ce garde
                        // explicite, un clic ailleurs enregistrerait 0 en silence.
                        if (e.target.value === '') { e.target.value = String(r.homeScore); return }
                        const n = Number(e.target.value)
                        if (!Number.isNaN(n) && n >= 0 && n !== r.homeScore) majScore(r, { homeScore: n })
                      }} />
                    <span className="text-xs font-bold" style={{ color: C.faint }}>–</span>
                    <label htmlFor={`score-away-${r.id}`} className="sr-only">Score {teamsById[r.awayId]?.name ?? 'équipe visiteuse'}</label>
                    <input id={`score-away-${r.id}`} type="number" min={0} defaultValue={r.awayScore} style={{ ...field, width: 64, height: 36 }} className="nums text-center text-sm"
                      readOnly={!peutCorriger} onFocus={demanderCode}
                      onBlur={(e) => {
                        if (e.target.value === '') { e.target.value = String(r.awayScore); return }
                        const n = Number(e.target.value)
                        if (!Number.isNaN(n) && n >= 0 && n !== r.awayScore) majScore(r, { awayScore: n })
                      }} />
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{teamsById[r.awayId]?.name ?? '—'}</span>
                    <TeamBadge id={r.awayId} name={teamsById[r.awayId]?.name ?? '—'} size="h-6 w-6 text-[8px]" />
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="min-w-0 truncate text-[11px] font-semibold" style={{ color: C.faint }}>{r.championshipLabel}</span>
                  <button onClick={() => supprimer(r.id)} aria-label="Supprimer ce résultat" className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.pink }}>✕</button>
                </div>
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

function Field({ id, label, value, onChange, type = 'text', min }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; min?: number }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm [color-scheme:dark]" style={field} />
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
