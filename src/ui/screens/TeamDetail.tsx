import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { getTeam, listPlayers, listMatches, listTeams, savePlayer, deletePlayer, deleteTeam, saveTeam } from '../../persistence/repositories'
import { teamRecord, teamMatches, teamScorers } from '../../domain/teamRecord'
import type { Match, Player, Team } from '../../domain/types'
import { C, NumBadge, Panel, TeamBadge, bd, fmtDate } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { refresh as refreshRemote } from '../../persistence/remote'
import { ConfirmDialog } from '../components/ConfirmDialog'

const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }
const miniLabel: CSSProperties = { color: C.faint }

// Une chaîne vide devient `undefined`, jamais une chaîne vide ni un `NaN` :
// un joueur dont on ne connaît pas la taille n'a pas une taille nulle, il n'a pas de taille.
const toUndef = (s: string) => s.trim() || undefined
const toHeight = (s: string): number | undefined => {
  const n = Number(s)
  return s.trim() && !Number.isNaN(n) ? n : undefined
}

export function TeamDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can, guard } = useAuth()
  // Tenir l'effectif relève du club : rien de ce qui l'écrit ne s'affiche à qui
  // ne le gère pas. La fiche, elle, se lit entièrement.
  const gere = can('manage')
  const { clubId, clear } = useClub()
  const [askDelete, setAskDelete] = useState(false)
  // Le joueur lui-même et non un booléen : le dialogue doit pouvoir le nommer, sinon
  // « Retirer ce joueur ? » ne dit pas lequel dans une liste de onze.
  const [aRetirer, setARetirer] = useState<Player | null>(null)
  const [team, setTeam] = useState<Team | null | undefined>(undefined)
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({})
  const [coach, setCoach] = useState('')
  // Un formulaire de saisie apparaît sur un clic, jamais d'emblée : l'effectif est
  // ce qu'on vient lire, recruter est l'exception.
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')
  const [birth, setBirth] = useState(''); const [height, setHeight] = useState('')
  // Un seul joueur dépliable à la fois : pas d'état par ligne à faire vivre.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBirth, setEditBirth] = useState(''); const [editHeight, setEditHeight] = useState('')

  const refresh = () => { if (id) listPlayers(id).then(setPlayers) }
  useEffect(() => {
    if (!id) return
    refreshRemote()
      .then(() => getTeam(id).then((t) => { setTeam(t ?? null); setCoach(t?.coach ?? '') }))
      .then(refresh)
      .then(() => Promise.all([listMatches(), listTeams()]))
      .then(([ms, ts]) => { setMatches(ms); setTeamsById(Object.fromEntries(ts.map((x) => [x.id, x]))) })
  }, [id])

  if (!id) return null
  if (team === undefined) return <div className="p-6"><div className="h-24 animate-pulse rounded-2xl" style={{ background: C.card }} /></div>
  if (team === null) return <div className="p-6"><p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>Équipe introuvable. <Link to="/teams" className="font-bold" style={{ color: C.accent }}>← Retour</Link></p></div>

  const saveCoach = () => {
    if (coach === (team.coach ?? '')) return
    guard('manage', () => saveTeam({ ...team, coach: coach.trim() || undefined }).then(() => setTeam({ ...team, coach: coach.trim() || undefined })))
  }
  const addPlayer = () => guard('manage', async () => {
    if (!num || !ln.trim()) return
    await savePlayer({
      id: newId(), teamId: id, number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim(),
      birthDate: toUndef(birth), height: toHeight(height),
    })
    setNum(''); setLn(''); setFn(''); setBirth(''); setHeight(''); refresh()
  })
  /**
   * Retirer un joueur passe par une confirmation, comme supprimer l'équipe juste
   * au-dessus et comme supprimer une rencontre ou un schéma ailleurs.
   *
   * Ça manquait, et c'était le seul défaut de cette revue qu'aucune mesure ne pouvait
   * trouver : un clic unique, sur un bouton de vingt-quatre pixels collé à
   * « modifier », supprimait le joueur sans rien demander. La conséquence annoncée est
   * celle que fait réellement `deletePlayer` — il quitte l'effectif et les
   * convocations, mais ses actions déjà saisies restent dans les rencontres jouées, où
   * elles perdent son nom. C'est vérifié dans le dépôt, pas supposé.
   */
  const removePlayer = () => { const p = aRetirer; if (!p) return
    guard('manage', async () => { await deletePlayer(p.id); setARetirer(null); refresh() }) }
  const startEdit = (p: Player) => { setEditingId(p.id); setEditBirth(p.birthDate ?? ''); setEditHeight(p.height ? String(p.height) : '') }
  // L'identifiant du joueur survit à la modification : c'est lui qui porte tout
  // son historique de tirs et de statistiques, le recréer le lui ferait perdre.
  const saveEdit = (p: Player) => guard('manage', async () => {
    await savePlayer({ ...p, birthDate: toUndef(editBirth), height: toHeight(editHeight) })
    setEditingId(null); refresh()
  })
  const removeTeam = async () => {
    await deleteTeam(id)
    // Le club suivi disparaît avec sa propre équipe : sans ce `clear()`, le
    // tableau de bord resterait épinglé sur un club fantôme (ClubProvider ne
    // revalide sa liste qu'à un changement de club, pas à une suppression brute).
    if (id === clubId) clear()
    navigate('/teams')
  }

  const rec = teamRecord(id, matches)
  const lines = teamMatches(id, matches)
  const upcoming = lines.filter((l) => l.match.status !== 'finished')
  const scorers = [...teamScorers(id, matches).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const playerById = Object.fromEntries(players.map((p) => [p.id, p]))
  const diff = rec.pointsFor - rec.pointsAgainst

  return (
    <div className="p-6">
      <Link to="/teams" className="inline-block rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>← Équipes</Link>
      <div className="mb-6 mt-4 flex items-center gap-3">
        <TeamBadge id={id} name={team.name} size="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{team.name}</h1>
          <p className="text-sm" style={{ color: C.muted }}>{players.length} joueur{players.length > 1 ? 's' : ''}{team.coach ? ` · Coach ${team.coach}` : ''}</p>
        </div>
        {/* Comme sur le résumé et la fiche de rencontre : le droit est vérifié à l'ouverture
            du dialogue, pas redérivé ensuite. Assumé — se verrouiller entre l'ouverture et la
            confirmation n'arrive qu'en rendant l'appareil en pleine action. */}
        {gere && <button onClick={() => guard('manage', () => setAskDelete(true))} className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${C.accentBd}`, color: C.accent }}>Supprimer</button>}
      </div>
      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={removeTeam}
        title="Supprimer l'équipe ?" message={`« ${team.name} » et tous ses joueurs seront supprimés. Cette action est définitive.`} confirmLabel="Supprimer" danger />
      <ConfirmDialog open={!!aRetirer} onClose={() => setARetirer(null)} onConfirm={removePlayer}
        title={aRetirer ? `Retirer ${aRetirer.lastName} ${aRetirer.firstName} ?` : ''}
        message="Il quitte l'effectif et les convocations. Ses actions déjà saisies restent dans les rencontres jouées, mais sans son nom."
        confirmLabel="Retirer" danger />

      {/* Les chiffres de saison ne s'affichent qu'à partir d'une rencontre jouée. Sinon
          c'était quatre tuiles à « 0 » et « — », et deux panneaux annonçant l'absence
          de match et de marqueur : six blocs pour dire six fois que la saison n'a pas
          commencé — sur l'écran même où le bénévole vient de saisir son effectif, donc
          le premier qu'il voit après avoir fondé son club. Ce qui reste, l'effectif,
          est justement ce qu'il vient d'accomplir. */}
      {rec.played > 0 && <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Rencontres" value={String(rec.played)} hint={upcoming.length ? `${upcoming.length} à venir` : 'jouées'} />
        <StatCard label="Bilan" value={`${rec.wins}V – ${rec.losses}D`} hint={rec.played ? `${Math.round((rec.wins / rec.played) * 100)}% de victoires` : '—'} accent={rec.wins >= rec.losses ? C.green : C.accent} />
        <StatCard label="Points marqués" value={rec.played ? String(rec.avgFor) : '—'} hint={rec.played ? `${rec.pointsFor} au total` : 'par match'} />
        <StatCard label="Différentiel" value={diff > 0 ? `+${diff}` : String(diff)} hint={`${rec.avgAgainst} encaissés/match`} accent={diff > 0 ? C.green : diff < 0 ? C.danger : undefined} />
      </div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <div className="space-y-6">
          {lines.length > 0 && <Panel title="Derniers matchs">
            {lines.length === 0 ? (
              <Empty>Aucune rencontre pour cette équipe.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {lines.slice(0, 8).map((l) => {
                  const opp = teamsById[l.opponentId]?.name ?? 'Adversaire'
                  const f = fmtDate(l.match.meta.date)
                  const to = l.match.status === 'finished' ? `/match/${l.match.id}/summary` : l.match.status === 'live' ? `/match/${l.match.id}/live` : `/match/${l.match.id}`
                  return (
                    <li key={l.match.id}>
                      <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--c-hover)]" style={{ background: C.panel }}>
                        {l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-black" style={{ background: l.result === 'V' ? C.greenBg : C.dangerBg, color: l.result === 'V' ? C.green : C.danger }}>{l.result}</span>}
                        {!l.result && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-black" style={{ background: C.amberBg, color: C.amber }}>·</span>}
                        <TeamBadge id={l.opponentId} name={opp} size="h-7 w-7 text-[12px]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{opp}</span>
                        <span className="shrink-0 text-[12px] font-semibold" style={{ color: C.faint }}>{f.long || '—'}</span>
                        <span className="w-16 shrink-0 text-right text-sm font-black tabular-nums">{l.scored === null ? '—' : `${l.scored}–${l.conceded}`}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}

          {scorers.length > 0 && <Panel title="Meilleurs marqueurs">
            {scorers.length === 0 ? (
              <Empty>Pas encore de points marqués.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {/* Chaque ligne mène à la fiche du joueur, comme au tableau de bord :
                    c'est le même classement, et il n'y a pas de raison qu'il soit
                    cliquable là et inerte ici. On y arrivait pourtant par l'effectif
                    juste au-dessus, ce qui obligeait à retrouver dans une liste de onze
                    le nom qu'on avait sous le doigt. */}
                {scorers.map(([pid, pts], i) => {
                  const p = playerById[pid]
                  return (
                    <li key={pid}>
                      <Link
                        to={`/players/${pid}`}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-[var(--c-hover)]"
                        style={{ background: C.panel }}
                      >
                        <span className="w-4 text-center text-sm font-black" style={{ color: i === 0 ? C.accent : C.faint }}>{i + 1}</span>
                        <NumBadge n={p?.number ?? '?'} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p ? `${p.lastName} ${p.firstName}` : 'Joueur'}</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: C.text }}>{pts} <span className="text-[12px] font-semibold" style={{ color: C.muted }}>pts</span></span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>}
        </div>

        <div className="space-y-6">
          <Panel title="Effectif">
            {/* Le champ de l'entraîneur écrit : sans le droit il ne s'affiche pas.
                Le nom reste lisible en tête de fiche, à côté du nombre de joueurs. */}
            {gere && (
              <>
                <label htmlFor="coach" className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Entraîneur</label>
                <input id="coach" value={coach} onChange={(e) => setCoach(e.target.value)} onBlur={saveCoach} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  placeholder="Nom de l'entraîneur" style={{ ...field, width: '100%' }} className="mb-4" />
              </>
            )}
            <ul className="mb-4 space-y-1.5">
              {[...players].sort((a, b) => a.number - b.number).map((p) => (
                <li key={p.id} className="space-y-2 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <div className="flex items-center gap-3">
                    <Link to={`/players/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <NumBadge n={p.number} />
                      {/* Nom et prénom coupés d'un seul tenant, pas chacun de son côté :
                          deux troncatures indépendantes rognaient le nom de famille
                          alors que le prénom, seul à devoir céder, gardait sa place. */}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{p.lastName}</span> <span style={{ color: C.muted }}>{p.firstName}</span>
                      </span>
                    </Link>
                    {/* Modifier et retirer écrivent : la ligne se réduit au joueur et à
                        son lien de fiche pour qui ne gère pas l'effectif.
                        Le nom du joueur reste dans le nom accessible du bouton — sans lui,
                        dix boutons « modifier » identiques dans la même liste — mais il
                        sort du libellé visible, qui chevauchait le nom sur un téléphone. */}
                    {gere && (
                      <>
                        <button aria-label={editingId === p.id ? `fermer ${p.lastName}` : `modifier ${p.lastName}`}
                          onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p))} className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold" style={{ color: C.muted }}>
                          {editingId === p.id ? 'fermer' : 'modifier'}
                        </button>
                        {/* Le retrait reste hors de la zone dépliée : c'est une action destructrice,
                            elle ne doit pas se retrouver mêlée aux champs d'édition.
                            Il portait l'accent — la couleur de la marque — à côté d'un « modifier »
                            gris, et faisait vingt-quatre pixels de haut. Une destruction ne se
                            signale pas avec la couleur des boutons ordinaires, et ne se vise pas au
                            minimum tolérable. */}
                        <button onClick={() => setARetirer(p)} aria-label={`Retirer ${p.lastName} ${p.firstName}`}
                          className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold transition hover:bg-[var(--c-danger-bg)]" style={{ color: C.danger }}>retirer</button>
                      </>
                    )}
                  </div>
                  {editingId === p.id && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label htmlFor={`edit-birth-${p.id}`} className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>Naissance</label>
                        <input id={`edit-birth-${p.id}`} type="date" value={editBirth} onChange={(e) => setEditBirth(e.target.value)} style={{ ...field, width: '100%' }} />
                      </div>
                      <div>
                        <label htmlFor={`edit-height-${p.id}`} className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>Taille du joueur</label>
                        <input id={`edit-height-${p.id}`} type="number" inputMode="numeric" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} style={{ ...field, width: '100%' }} />
                      </div>
                      <button onClick={() => saveEdit(p)} className="col-span-2 rounded-xl py-2 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>Enregistrer</button>
                    </div>
                  )}
                </li>
              ))}
              {players.length === 0 && <li className="text-sm" style={{ color: C.muted }}>{gere ? 'Aucun joueur. Ajoutez-en ci-dessous.' : 'Aucun joueur dans l’effectif.'}</li>}
            </ul>
            {/* Recruter est administratif : le bouton ne s'affiche pas sans le
                droit. Ouvrir le formulaire est déjà une écriture, la garde reste
                donc ici et pas seulement à l'enregistrement. */}
            {!gere ? null : !ajoutOuvert ? (
              <button onClick={() => guard('manage', () => setAjoutOuvert(true))} className="w-full rounded-xl py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
                + Ajouter un joueur
              </button>
            ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Nouveau joueur</p>
                <button onClick={() => setAjoutOuvert(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>Fermer</button>
              </div>
              <div className="grid grid-cols-[56px_1fr] gap-2">
                <input placeholder="N°" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center' }} />
                <input placeholder="Nom" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={field} />
              </div>
              <input placeholder="Prénom" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()} style={{ ...field, width: '100%' }} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="add-birth" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>Date de naissance</label>
                  <input id="add-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
                <div>
                  <label htmlFor="add-height" className="mb-1 block text-[12px] font-bold uppercase tracking-wide" style={miniLabel}>Taille (cm)</label>
                  <input id="add-height" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
              </div>
              <button onClick={addPlayer} className="w-full rounded-xl py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>+ Ajouter le joueur</button>
            </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: bd }}>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: accent ?? C.text }}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] font-semibold" style={{ color: C.muted }}>{hint}</p>}
    </div>
  )
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm" style={{ color: C.muted }}>{children}</p>
}
