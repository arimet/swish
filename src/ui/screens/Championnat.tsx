import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import { standings, clefConfrontation } from '../../domain/standings'
import { listMatches, listResults, saveResult, deleteResult } from '../../persistence/repositories'
import type { Match, ReportedResult } from '../../domain/types'
import { C, bd, champLabel, SectionTitle, TeamBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { X } from 'lucide-react'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/**
 * Une équipe d'un résultat saisi : écusson, nom, score à droite.
 *
 * Le score est un champ pour qui corrige, un nombre pour les autres, et il occupe
 * la même largeur dans les deux cas — sinon la colonne des scores danserait selon
 * le rôle de qui regarde. Le gagnant est en encre pleine, le perdant en gris :
 * c'est ce que la carte de match du kit fait déjà, et ça se lit sans compter.
 */
function LigneEquipe({ id, nom, score, gagne, champId, modifiable, onScore }: {
  id: string; nom: string; score: number; gagne: boolean
  champId: string; modifiable: boolean; onScore: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <TeamBadge id={id} name={nom} size="h-6 w-6 text-[12px]" />
      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: gagne ? C.text : C.muted, fontWeight: gagne ? 800 : 600 }}>{nom}</span>
      {modifiable ? (
        <>
          <label htmlFor={champId} className="sr-only">Score {nom}</label>
          <input
            id={champId} type="number" min={0} defaultValue={score}
            style={{ ...field, width: 64, height: 34 }} className="nums shrink-0 text-center text-sm"
            onBlur={(e) => {
              // Un champ vidé n'est pas une saisie de 0 : c'est le premier geste de qui
              // corrige une faute de frappe. `Number('')` vaut 0, pas NaN — sans ce garde
              // explicite, un clic ailleurs enregistrerait 0 en silence.
              if (e.target.value === '') { e.target.value = String(score); return }
              const n = Number(e.target.value)
              if (!Number.isNaN(n) && n >= 0 && n !== score) onScore(n)
            }}
          />
        </>
      ) : (
        <span className="nums w-16 shrink-0 text-right text-sm font-black tabular-nums"
          style={{ color: gagne ? C.text : C.muted }}>{score}</span>
      )}
    </div>
  )
}

export function Championnat() {
  const trad = useT()
  const { clubId, teams } = useClub()
  const { can, guard } = useAuth()
  /* `null` tant que la lecture n'a pas répondu, et non `[]`.
   *
   * Avec un tableau vide comme valeur initiale, l'écran ne distingue pas « je n'ai
   * pas encore lu » de « il n'y a rien » : il affichait donc « Aucun classement à
   * afficher » pendant une image avant de le remplacer par la table. Quinze
   * millisecondes sur cette machine — mais cette durée est celle de la lecture
   * IndexedDB, donc elle suit la lenteur de l'appareil, et le téléphone d'un club
   * n'est pas une machine de développement.
   *
   * La convention existait déjà dans le dépôt (`MatchSetup`, `TeamsList`,
   * `SchemaList`, `Calendrier`, et `Dashboard` pour ses rencontres) ; elle manquait
   * ici. */
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [results, setResults] = useState<ReportedResult[] | null>(null)
  const [erreur, setErreur] = useState('')

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])

  /** Les résultats saisis, groupés par championnat et triés comme le classement
   *  l'est — à la française, pour qu'« Écran » précède « Remise ». Le nom du
   *  championnat n'apparaît alors qu'une fois par groupe au lieu d'une fois par
   *  ligne, où il était constant dans le cas courant : une seule poule. */
  const resultatsParChampionnat = useMemo(() => {
    const map = new Map<string, ReportedResult[]>()
    for (const r of results ?? []) {
      const clef = r.championshipLabel || 'Sans championnat'
      if (!map.has(clef)) map.set(clef, [])
      map.get(clef)!.push(r)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [results])
  // Le championnat de nos rencontres sert de valeur par défaut au formulaire : la
  // plupart des résultats saisis à la main concernent la même poule que la nôtre.
  // Sans rencontre enregistrée, on se replie sur le championnat du premier résultat
  // déjà saisi plutôt que de partir vide — sinon la saisie ouvrirait sous « Match
  // amical » une seconde table de classement à côté de celle déjà là.
  const notreChamp = useMemo(() => {
    const m = (matches ?? []).find((mm) => mm.meta.clubId === clubId)
    if (m) return champLabel(m.meta)
    return (results ?? [])[0]?.championshipLabel ?? ''
  }, [matches, clubId, results])

  const rafraichir = () => Promise.all([listMatches(), listResults()]).then(([m, r]) => { setMatches(m); setResults(r) })
  useEffect(() => { rafraichir() }, [])

  const groups = useMemo(() => standings(matches ?? [], results ?? [], teamsById), [matches, results, teamsById])

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
    return (matches ?? []).some((m) => m.status === 'finished' && clefConfrontation(champLabel(m.meta), m.meta.clubId, m.meta.opponentId, m.meta.date) === clé)
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
      setErreur(trad('champ.nulImpossible'))
      return
    }
    const champLbl = champ.trim() || 'Match amical'
    const clé = clefConfrontation(champLbl, homeId, awayId, date)
    // Deux saisies de la même confrontation — même dans l'ordre inverse — compteraient
    // deux fois au classement : rien côté domaine ne s'en protège, c'est ici qu'il faut l'empêcher.
    if ((results ?? []).some((r) => clefConfrontation(r.championshipLabel, r.homeId, r.awayId, r.date) === clé)) {
      setErreur(trad('champ.dejaSaisi'))
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
  // Corriger un score est administratif : sans le droit, le résultat s'affiche en
  // toutes lettres plutôt que dans un champ. Un champ ouvert à la frappe puis
  // refusé à l'envoi laisserait à l'écran une valeur que la base n'a pas (les
  // champs ne sont pas contrôlés, React ne réinitialise pas un `defaultValue`),
  // sous un classement qui continue de compter l'ancienne.
  const peutCorriger = can('manage')
  const supprimer = (id: string) => guard('manage', async () => { await deleteResult(id); rafraichir() })

  return (
    <div className="p-6">
      {/* 1. Le classement d'abord : c'est ce qu'on ouvre l'écran pour voir. */}
      <div className="space-y-6">
        {results?.length === 0 && (
          <p className="max-w-[75ch] rounded-2xl border border-dashed px-4 py-3 text-sm" style={{ borderColor: C.border, color: C.muted }}>
            {trad('champ.aucunResultat')}
          </p>
        )}
        {matches === null || results === null ? (
          <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
        ) : groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed py-10 text-center text-sm" style={{ borderColor: C.border, color: C.muted }}>{trad('champ.aucunClassement')}</p>
        ) : groups.map(({ champ: c, lines }) => (
          <section key={c} className="overflow-x-auto rounded-2xl p-4" style={{ background: C.card, border: bd }}>
            <SectionTitle className="mb-3">{c}</SectionTitle>
            <table className="w-full text-sm sm:min-w-[520px]">
              <thead>
                <tr className="text-left text-[12px] font-bold uppercase" style={{ color: C.faint }}>
                  <th className="py-1.5 pr-2">#</th><th className="pr-2">{trad('champ.equipe')}</th>
                  <th className="hidden px-2 text-center sm:table-cell">J</th><th className="px-2 text-center">V</th><th className="px-2 text-center">D</th>
                  <th className="hidden px-2 text-center sm:table-cell">{trad('champ.pour')}</th><th className="hidden px-2 text-center sm:table-cell">{trad('champ.contre')}</th><th className="px-2 text-center">{trad('champ.diff')}</th><th className="px-2 text-center">{trad('champ.pts')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} style={l.id === clubId ? { background: C.accentBg } : undefined}>
                    <td className="rounded-l-lg py-2 pr-2 font-bold" style={{ color: C.faint }}>{i + 1}</td>
                    <td className="w-full max-w-0 pr-2">
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <TeamBadge id={l.id} name={l.name} size="h-6 w-6 text-[12px]" />
                        <span className="truncate">{l.name}</span>
                      </span>
                    </td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.j}</td>
                    <td className="px-2 text-center tabular-nums">{l.v}</td>
                    <td className="px-2 text-center tabular-nums">{l.d}</td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.pf}</td>
                    <td className="hidden px-2 text-center tabular-nums sm:table-cell">{l.pa}</td>
                    {/* La seule colonne teintée du tableau, en plus des points :
                        le signe du différentiel est ce qu'on cherche en balayant
                        la grille, et une colonne colorée sur neuf se repère —
                        neuf colonnes colorées ne se repèrent plus. */}
                    <td className="px-2 text-center font-semibold tabular-nums"
                      style={{ color: l.pf - l.pa > 0 ? C.green : l.pf - l.pa < 0 ? C.danger : C.faint }}>
                      {l.pf - l.pa > 0 ? `+${l.pf - l.pa}` : l.pf - l.pa}
                    </td>
                    <td className="rounded-r-lg px-2 text-center font-black tabular-nums" style={{ color: C.accent }}>{l.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {/* 2. La saisie, réservée à l'admin, repliée derrière son bouton — et le
          bloc entier disparaît pour qui n'a pas le droit d'écrire : une carte
          vide, sans bouton, ne dirait rien. La garde reste à l'ouverture du
          formulaire comme à l'enregistrement. */}
      {/* Replié, le bouton se pose à nu : une carte pleine largeur avec cinq
          rems de marge autour d'un seul bouton n'élevait rien, elle occupait
          juste le tiers de l'écran resté libre sous le classement. Elle
          réapparaît dès que le formulaire s'ouvre, où elle groupe six champs. */}
      {peutCorriger && (
      <section className={saisieOuverte ? 'mt-8 rounded-2xl p-5' : 'mt-6'} style={saisieOuverte ? { background: C.card, border: bd } : undefined}>
        {!saisieOuverte ? (
          <button onClick={() => guard('manage', () => setSaisieOuverte(true))} className="rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {trad('champ.saisirResultat')}
          </button>
        ) : (
        <>
        <div className="mb-4 flex items-center gap-3">
          <SectionTitle>{trad('champ.saisirTitre')}</SectionTitle>
          <button onClick={() => setSaisieOuverte(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>{trad('commun.fermer2')}</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker id="champ-home" label={trad('champ.equipeRecue')} value={homeId} onChange={changeHomeId} teams={teams} />
          <Picker id="champ-away" label={trad('champ.equipeVisiteuse')} value={awayId} onChange={changeAwayId} teams={teams} />
          <Field id="champ-home-score" label={trad('champ.scoreRecue')} type="number" min={0} value={homeScore} onChange={changeHomeScore} />
          <Field id="champ-away-score" label={trad('champ.scoreVisiteuse')} type="number" min={0} value={awayScore} onChange={changeAwayScore} />
          <Field id="champ-date" label={trad('champ.dateRencontre')} type="date" value={date} onChange={changeDate} />
          <Field id="champ-label" label={trad('champ.championnat')} value={champ} onChange={changeChamp} />
        </div>

        {dejaNotreRencontre && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: C.amberBg, color: C.amber }}>
            {trad('champ.dejaConnue')}
          </p>
        )}
        {/* Un refus se dit en danger, pas en couleur de marque : sur un fond
            d'accent, le message ressemblait à une mise en avant. */}
        {erreur && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.dangerBg, color: C.danger }}>{erreur}</p>
        )}

        <button onClick={ajouter} disabled={!peutAjouter} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {trad('champ.ajouterResultat')}
        </button>
        </>
        )}
      </section>
      )}

      {/* 3. La liste des résultats saisis. Elle se lit par tout le monde ; la
          correction et la suppression restent à l'administration. */}
      <section className="mt-6 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <SectionTitle className="mb-3">{trad('champ.resultatsSaisis')}</SectionTitle>
        {results === null ? (
          <div className="h-16 animate-pulse rounded-xl" style={{ background: C.panel }} />
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: C.muted }}>{trad('champ.rienAAfficher')}</p>
        ) : (
          /* Les résultats groupés par championnat, et le nom du championnat écrit
             une fois par groupe — pas une fois par ligne.
             Il l'était : six lignes portaient six fois « Pré régionale masculine ·
             Poule A », le cas courant étant qu'un club saisit les résultats de sa
             seule poule. C'était le plus gros bloc de texte de chaque ligne, pour
             une information constante, et il occupait une seconde rangée qui
             emportait la suppression avec elle — d'où un ✕ flottant sous la
             rencontre qu'il efface. Le groupe absorbe les deux problèmes : le nom
             remonte en tête, la ligne redevient une ligne.
             Un seul groupe ne mérite pas d'en-tête : le titre de la section le dit
             déjà, et le classement juste au-dessus le répète. */
          <div className="space-y-5">
            {resultatsParChampionnat.map(([champ, lignes]) => (
              <div key={champ}>
                {resultatsParChampionnat.length > 1 && (
                  <p className="mb-1 text-[12px] font-bold" style={{ color: C.faint }}>{champ}</p>
                )}
                {/* Des filets, pas des cartes. Chaque ligne était une carte posée
                    dans la carte de la section : deux cadres emboîtés pour une
                    hiérarchie qui n'en compte qu'une, et six bordures de bruit. */}
                <ul className="divide-y" style={{ borderColor: C.border }}>
            {lignes.map((r) => (
              /* Une équipe par ligne, son score à droite — l'idiome que la carte de
                 match du kit emploie déjà, et le seul qui tienne à toutes les
                 largeurs. La rencontre était en une seule ligne, les deux noms de
                 part et d'autre des scores : sur un téléphone, les deux colonnes
                 souples n'avaient plus que trente pixels, et `truncate` réduisait
                 « BC BAR-LE-DUC » à « B ». On ne savait plus qui avait joué contre
                 qui — le contraire de ce que la liste sert à lire. Empilé, chaque
                 nom dispose de toute la largeur moins son écusson et son score. */
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <LigneEquipe
                    id={r.homeId} nom={teamsById[r.homeId]?.name ?? '—'} score={r.homeScore}
                    gagne={r.homeScore > r.awayScore} champId={`score-home-${r.id}`}
                    modifiable={peutCorriger} onScore={(n) => majScore(r, { homeScore: n })}
                  />
                  <LigneEquipe
                    id={r.awayId} nom={teamsById[r.awayId]?.name ?? '—'} score={r.awayScore}
                    gagne={r.awayScore > r.homeScore} champId={`score-away-${r.id}`}
                    modifiable={peutCorriger} onScore={(n) => majScore(r, { awayScore: n })}
                  />
                </div>
                {peutCorriger && (
                  <button onClick={() => supprimer(r.id)} aria-label={trad('champ.supprimerResultat')}
                    className="shrink-0 rounded-lg p-1.5" style={{ color: C.danger }}>
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </li>
            ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {/* Les résultats saisis à la main ne passent pas par la synchronisation : sans
            cette mention, un utilisateur qui ouvre l'app sur un autre appareil trouverait
            un classement vide sans comprendre pourquoi. */}
        <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{trad('champ.resultatsLocaux')}</p>
      </section>
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text', min }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; min?: number }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}
function Picker({ id, label, value, onChange, teams }: { id: string; label: string; value: string; onChange: (id: string) => void; teams: { id: string; name: string }[] }) {
  const trad = useT()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field}>
        <option value="">{trad('champ.choisir')}</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}
