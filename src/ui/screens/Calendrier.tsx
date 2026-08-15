import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { listMatches, listPlays, listTeams, listTrainings, saveTraining, deleteTraining, toggleTrainingPlay } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import type { Match, Team, Training } from '../../domain/types'
import type { Schema } from '../../domain/plays'
import { jourISO, nextFixture } from '../../domain/fixtures'
import { C, bd, Ic, ICON, MatchCard, PageTitle, fmtDate } from '../olive/kit'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useClub } from '../../app/club'
import { useAuth } from '../../app/auth'
import { X } from 'lucide-react'

// L'entraînement se distingue de la rencontre par une couleur qui n'est prise
// par aucun autre badge de l'écran (le vert vaut victoire/en direct, l'ambre
// vaut « à venir », le rose est l'accent des rencontres) : au coup d'œil, le
// bleu ne peut désigner qu'une séance d'entraînement.
const ENTR_COLOR = C.info
const ENTR_BG = C.infoBg

// Les mois en toutes lettres, comme le kit tient déjà ses jours et ses mois
// abrégés : la locale du navigateur n'est pas celle de l'application, et un
// calendrier français doit dire « août » sur une machine en anglais.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

type CalItem = { key: string; time: string } & ({ kind: 'match'; match: Match } | { kind: 'training'; training: Training })

export function Calendrier() {
  const { clubId } = useClub()
  const { can, guard } = useAuth()
  // Planifier relève du club : ce qui l'écrit ne s'affiche que pour qui le gère.
  const gere = can('manage')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [trainings, setTrainings] = useState<Training[] | null>(null)
  // La bibliothèque du club : c'est elle qui dit quels schémas existent encore.
  const [schemas, setSchemas] = useState<Schema[]>([])

  const refreshTrainings = () => listTrainings().then(setTrainings)

  useEffect(() => {
    let cancel = false
    refresh().then(() => Promise.all([listMatches(), listTeams(), listTrainings()])).then(([m, t, tr]) => {
      if (cancel) return
      setTeams(Object.fromEntries(t.map((x) => [x.id, x])))
      setMatches(m)
      setTrainings(tr)
    })
    return () => { cancel = true }
  }, [])

  // Les schémas suivent le club de l'appareil, comme les entraînements ci-dessous :
  // effet séparé, car celui du dessus ne dépend pas de `clubId`.
  useEffect(() => {
    if (!clubId) { setSchemas([]); return }
    let cancel = false
    listPlays(clubId).then((s) => { if (!cancel) setSchemas(s) })
    return () => { cancel = true }
  }, [clubId])

  const nos = useMemo(() => matches?.filter((m) => m.meta.clubId === clubId) ?? null, [matches, clubId])
  // Comme les rencontres : un appareil qui change de club ne doit garder au calendrier
  // que les entraînements de ce club, pas ceux laissés en mémoire par le club précédent.
  const nosEntrainements = useMemo(() => trainings?.filter((t) => t.clubId === clubId) ?? null, [trainings, clubId])

  // Rencontres et entraînements partagent les mêmes groupes par date : le calendrier
  // sert à repérer d'un coup d'œil, pas à parcourir deux listes séparées pour
  // reconstituer la semaine.
  const groups = useMemo(() => {
    if (!nos || !nosEntrainements) return []
    const map = new Map<string, CalItem[]>()
    const push = (k: string, item: CalItem) => { if (!map.has(k)) map.set(k, []); map.get(k)!.push(item) }
    // Les entraînements sont ajoutés avant les rencontres : le tri ci-dessous est stable,
    // donc si l'ordre d'insertion décidait des égalités d'heure, il faudrait qu'il coïncide
    // par hasard avec la règle voulue (la rencontre passe avant). En les mettant dans
    // l'ordre « inverse », c'est bien le départage explicite qui décide, et non un ordre
    // d'insertion accidentel — même dilemme, même remède que `nextFixture` dans
    // `src/domain/fixtures.ts`.
    for (const t of nosEntrainements) push(t.date ?? '—', { key: t.id, kind: 'training', training: t, time: t.time ?? '' })
    for (const m of nos) push(m.meta.date ?? '—', { key: m.id, kind: 'match', match: m, time: m.meta.time ?? '' })
    // À heure égale, la rencontre passe avant l'entraînement — c'est elle qui compte.
    for (const items of map.values())
      items.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'match' ? -1 : 1))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [nos, nosEntrainements])

  // Le repère qui coupe la page en deux : ce qui précède est joué, ce qui suit
  // reste à faire. Et la prochaine échéance est celle du domaine — la même qu'au
  // tableau de bord, pour qu'il n'y ait pas deux règles pour désigner « la suite ».
  const aujourdhui = jourISO(new Date())
  const prochaine = useMemo(
    () => (nos && nosEntrainements ? nextFixture(nos, nosEntrainements, new Date()) : null),
    [nos, nosEntrainements],
  )

  // Un formulaire de saisie apparaît sur un clic, jamais d'emblée : le calendrier
  // est ce qu'on vient lire, planifier une séance est l'exception.
  const [saisieOuverte, setSaisieOuverte] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [theme, setTheme] = useState('')

  const ajouter = () => {
    if (!date || !clubId) return
    guard('manage', async () => {
      await saveTraining({ id: newId(), clubId, date, time: time.trim() || undefined, place: place.trim() || undefined, theme: theme.trim() || undefined })
      setDate(''); setTime(''); setPlace(''); setTheme('')
      refreshTrainings()
    })
  }
  /* Supprimer une séance passe par une confirmation, comme supprimer une rencontre,
     un schéma ou un joueur. Elle manquait ici : un clic sur la croix effaçait la
     séance, sans retour possible. Le message dit ce qui n'est **pas** supprimé — les
     schémas rattachés vivent dans la bibliothèque, seul le lien disparaît — parce que
     c'est la question qu'on se pose la main sur la croix. */
  const [aSupprimer, setASupprimer] = useState<Training | null>(null)
  const supprimer = () => { const t = aSupprimer; if (!t) return
    guard('manage', async () => { await deleteTraining(t.id); setASupprimer(null); refreshTrainings() }) }

  // Attacher un schéma à une séance est administratif : garder d'abord, écrire
  // ensuite. Le va-et-vient lui-même est transactionnel (cf. `toggleTrainingPlay`),
  // pour que deux cases cochées coup sur coup ne s'effacent pas l'une l'autre.
  const basculerSchema = (id: string, playId: string) => guard('manage', async () => {
    await toggleTrainingPlay(id, playId)
    refreshTrainings()
  })

  return (
    <div className="p-6">
      {/* Les actions dans la barre de sous-titre, comme la bibliothèque de schémas :
          une saison fait des milliers de pixels de dates, et un bouton placé après
          ne se trouve jamais. Un seul bouton plein — la rencontre, ce qu'on planifie
          le plus souvent ; la séance reste en second, marquée par son bleu. */}
      <PageTitle
        action={gere && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => guard('manage', () => setSaisieOuverte(true))}
              className="rounded-xl px-4 py-2.5 text-sm font-bold"
              style={{ background: ENTR_BG, color: ENTR_COLOR, border: `1px solid ${ENTR_COLOR}55` }}>
              + Nouvel entraînement
            </button>
            <Link to="/match/new" className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              + Nouvelle rencontre
            </Link>
          </div>
        )}
      />

      {saisieOuverte && (
        <section className="mb-6 rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${ENTR_COLOR}44` }}>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ENTR_COLOR }}>Nouvel entraînement</p>
            <button onClick={() => setSaisieOuverte(false)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold" style={{ color: C.muted }}>Fermer</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="entr-date" label="Date de l'entraînement" type="date" value={date} onChange={setDate} />
            <Field id="entr-time" label="Heure" type="time" value={time} onChange={setTime} />
            <Field id="entr-place" label="Lieu" value={place} onChange={setPlace} />
            <Field id="entr-theme" label="Thème" value={theme} onChange={setTheme} />
          </div>
          <button onClick={ajouter} disabled={!date || !clubId} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: ENTR_COLOR }}>
            Ajouter l'entraînement
          </button>
        </section>
      )}

      {!nos || !nosEntrainements ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : groups.length === 0 ? (
        // L'invitation à planifier ne s'adresse qu'à qui le peut ; les autres
        // lisent simplement qu'il n'y a rien de prévu.
        <div className="rounded-2xl py-16 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm font-bold">La saison est encore vierge.</p>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>
            {gere
              ? 'Planifiez une rencontre ou une séance : elles se rangeront ici, par date.'
              : 'Les rencontres et les séances apparaîtront ici, par date, dès qu’elles seront planifiées.'}
          </p>
        </div>
      ) : (
        // Deux dates par ligne dès qu'on a la largeur : une saison fait une colonne
        // interminable sur un écran de bureau, où la place est à côté et pas en
        // dessous. Sur téléphone, une seule colonne, comme avant. La barre de mois
        // occupe la largeur entière et ouvre donc toujours une nouvelle rangée.
        <div className="grid gap-x-8 gap-y-7 xl:grid-cols-2 [&>*]:min-w-0">
          {groups.map(([iso, items], i) => {
            const f = fmtDate(iso === '—' ? undefined : iso)
            const nbRencontres = items.filter((i) => i.kind === 'match').length
            const nbEntrainements = items.filter((i) => i.kind === 'training').length
            const résumé = [
              nbRencontres ? `${nbRencontres} rencontre${nbRencontres > 1 ? 's' : ''}` : '',
              nbEntrainements ? `${nbEntrainements} entraînement${nbEntrainements > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(' · ')
            // Le passé est estompé plutôt que masqué : on veut pouvoir remonter la
            // saison, mais rien de joué ne doit disputer l'œil à ce qui reste à jouer.
            const passé = iso !== '—' && iso < aujourdhui
            const estAujourdhui = iso === aujourdhui
            // La date qui porte la prochaine échéance, ou le jour même : les deux
            // seules du calendrier à mériter l'accent.
            const vedette = estAujourdhui || prochaine?.date === iso
            const nouveauMois = i === 0 || groups[i - 1][0].slice(0, 7) !== iso.slice(0, 7)
            return (
              <Fragment key={iso}>
                {nouveauMois && <BarreDeMois iso={iso} />}
                {/* Le passé s'estompe, mais pas jusqu'à devenir illisible.
                    `opacity-60` diluait le texte du jeton d'encre jusqu'à 4,63:1
                    sur le cadre — soit trois pour cent au-dessus du seuil AA, et
                    3,1:1 une fois les pixels rendus comptés, l'antialiasing
                    mangeant le reste. À 0,75 le même texte tient 8,1:1 et la
                    journée écoulée se reconnaît toujours du premier coup d'œil.
                    Le survol la rend entière, comme avant. */}
                <section className={passé ? 'opacity-75 transition-opacity hover:opacity-100' : undefined}>
                  <header className="mb-3 flex items-center gap-3">
                    {/* Le cartouche de date : jour de la semaine et quantième, en gros.
                        Le mois est dans la barre au-dessus, il n'a pas à être répété. */}
                    <span className="grid h-14 w-14 shrink-0 place-content-center rounded-2xl text-center leading-none"
                      style={vedette ? { background: C.accentBg, border: `1px solid ${C.accentBd}` } : { background: C.card2, border: bd }}>
                      <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: vedette ? C.accent : C.faint }}>{f.wd || '—'}</span>
                      <span className="mt-1 text-xl font-black tabular-nums" style={{ color: vedette ? C.accent : C.text }}>{f.day}</span>
                    </span>
                    <div className="min-w-0">
                      {vedette && (
                        <p className="text-[12px] font-black uppercase tracking-wider" style={{ color: C.accent }}>
                          {estAujourdhui ? 'Aujourd’hui' : 'Prochaine échéance'}
                        </p>
                      )}
                      <p className="truncate text-sm font-extrabold">{résumé}</p>
                    </div>
                    {/* Le filet prolonge l'en-tête jusqu'au bord et referme le groupe ;
                        sur téléphone la largeur est trop précieuse pour le garder. */}
                    <span className="hidden h-px flex-1 sm:block" style={{ background: C.border }} />
                  </header>
                  {/* `auto-fit` plutôt qu'un nombre fixe de colonnes : une date qui ne
                      porte qu'une carte l'étale sur toute la largeur du groupe, au lieu
                      de laisser une demi-colonne vide à sa droite. */}
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                    {items.map((it) => it.kind === 'match'
                      ? <CarteRencontre key={it.key} m={it.match} teams={teams} gere={gere} />
                      : <TrainingCard key={it.key} t={it.training} schemas={schemas} gere={gere}
                          onToggleSchema={(playId) => basculerSchema(it.training.id, playId)}
                          onDelete={() => setASupprimer(it.training)} />)}
                  </div>
                </section>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Comme les convocations et les résultats extérieurs : même formulation que sur
          les écrans Championnat et fiche de rencontre, pour ne pas laisser croire à deux
          limites différentes — la décision couvrait aussi bien les entraînements. */}
      <p className="mt-8 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>Ces entraînements restent sur cet appareil : ils ne sont pas synchronisés avec vos autres appareils.</p>

      <ConfirmDialog open={!!aSupprimer} onClose={() => setASupprimer(null)} onConfirm={supprimer}
        title="Supprimer cette séance ?"
        message={aSupprimer
          ? `La séance du ${fmtDate(aSupprimer.date).long || aSupprimer.date} est retirée du calendrier. Les schémas qui y étaient rattachés restent dans la bibliothèque.`
          : ''}
        confirmLabel="Supprimer" danger />
    </div>
  )
}

/** La carte d'une rencontre, et — tant qu'elle est à venir — l'accès direct à sa
 *  convocation. La convocation reste sur la fiche de la rencontre, à sa place ;
 *  ce qui manquait, c'est un chemin depuis là où le coach regarde. Le lien est
 *  posé À CÔTÉ de la carte et non dedans : `MatchCard` est elle-même un lien, et
 *  un lien dans un lien n'est pas du HTML valide. */
function CarteRencontre({ m, teams, gere }: { m: Match; teams: Record<string, Team>; gere: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <MatchCard m={m} teams={teams} />
      {/* Convoquer écrit : le raccourci est celui du coach. La carte, elle, mène à
          la fiche de la rencontre, où la convocation se lit par tout le monde. */}
      {gere && m.status === 'setup' && (
        <Link to={`/match/${m.id}#convocation`} className="rounded-xl px-3 py-1.5 text-center text-[12px] font-bold"
          style={{ background: C.accentBg, color: C.accent }}>
          Convoquer →
        </Link>
      )}
    </div>
  )
}

/** Le mois en toutes lettres, en travers de la grille : sans lui, une saison n'est
 *  qu'une suite de quantièmes, et l'on ne sait plus si le 3 suit le 30 de justesse
 *  ou de cinq semaines. */
function BarreDeMois({ iso }: { iso: string }) {
  const d = new Date(iso + 'T00:00:00')
  const label = Number.isNaN(d.getTime()) ? 'Sans date' : `${MOIS[d.getMonth()]} ${d.getFullYear()}`
  return (
    <div className="flex items-center gap-3 xl:col-span-2">
      <h2 className="text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: C.muted }}>{label}</h2>
      <span className="h-px flex-1" style={{ background: C.border }} />
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}

/** Carte d'entraînement : même gabarit que `MatchCard` pour se mêler à la
 *  grille, mais un rail bleu à silhouette — là où la rencontre montre deux écussons
 *  et son « VS » — la distingue sans qu'il faille lire un seul mot. Elle se déplie
 *  sur les schémas qu'on y travaille — mêmes cases à cocher que la convocation
 *  d'une rencontre, pour qui peut les cocher. Les autres lisent le programme de
 *  la séance sans pouvoir le changer : c'est ce qui les intéresse. */
function TrainingCard({ t, schemas, gere, onToggleSchema, onDelete }: { t: Training; schemas: Schema[]; gere: boolean; onToggleSchema: (playId: string) => void; onDelete: () => void }) {
  // Le compte affiché est celui des schémas qui existent : un entraînement peut
  // citer un schéma supprimé (base antérieure à la cascade de `deletePlay`), et
  // le compter ferait mentir la ligne — la faute corrigée au projet 6 sur les
  // convocations et leurs joueurs retirés.
  const attachés = schemas.filter((s) => t.playIds?.includes(s.id))
  return (
    <div className="flex gap-3 rounded-2xl p-3" style={{ background: C.card, border: `1px solid ${ENTR_COLOR}55` }}>
      <div className="flex w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: ENTR_BG }}>
        <Ic d={ICON.users} className="h-6 w-6" style={{ color: ENTR_COLOR }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md px-1.5 py-0.5 text-[12px] font-black uppercase" style={{ background: ENTR_BG, color: ENTR_COLOR }}>Entraînement</span>
          {t.time && <span className="ml-auto text-[12px] font-bold" style={{ color: C.muted }}>{t.time}</span>}
        </div>
        <p className="mt-2 truncate text-sm font-bold">{t.theme || 'Séance libre'}</p>

        {/* `<details>` plutôt qu'un état local : le navigateur sait déjà déplier, et
            vingt schémas dépliés d'office noieraient le calendrier. */}
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-2 text-[12px] font-bold" style={{ color: ENTR_COLOR }}>
            Schémas travaillés
            {attachés.length > 0 && (
              <span className="rounded-md px-1.5 py-0.5 font-black" style={{ background: ENTR_BG, color: ENTR_COLOR }}>
                {attachés.length} schéma{attachés.length > 1 ? 's' : ''}
              </span>
            )}
          </summary>
          {!gere ? (
            attachés.length === 0 ? (
              <p className="mt-2 text-[12px]" style={{ color: C.faint }}>Aucun schéma prévu pour cette séance.</p>
            ) : (
              <div className="mt-2 grid gap-1.5">
                {attachés.map((s) => (
                  <span key={s.id} className="truncate rounded-lg px-2 py-1.5 text-[12px] font-semibold" style={{ background: C.panel }}>{s.nom}</span>
                ))}
              </div>
            )
          ) : schemas.length === 0 ? (
            <p className="mt-2 text-[12px]" style={{ color: C.faint }}>Aucun schéma dans la bibliothèque.</p>
          ) : (
            <div className="mt-2 grid gap-1.5">
              {schemas.map((s) => {
                const id = `schema-${t.id}-${s.id}`
                return (
                  <label key={s.id} htmlFor={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold" style={{ background: C.panel }}>
                    <input id={id} type="checkbox" checked={attachés.some((a) => a.id === s.id)} onChange={() => onToggleSchema(s.id)} />
                    <span className="truncate">{s.nom}</span>
                  </label>
                )
              })}
            </div>
          )}
        </details>

        <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[12px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          <span className="truncate">{t.place || '—'}</span>
          {/* `grid h-9 w-9` et non `px-1.5 py-0.5` : la cible faisait 26 × 18, sous le
              minimum de vingt-quatre pixels — et c'est une **suppression**, la
              combinaison la plus fâcheuse entre une cible qu'on rate et un geste qu'on
              ne défait pas. */}
          {gere && <button onClick={onDelete} aria-label="Supprimer cet entraînement" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-black transition hover:bg-[var(--c-danger-bg)] hover:text-[var(--c-danger)]" style={{ color: C.accent }}><X className="h-4 w-4" strokeWidth={2.5} /></button>}
        </div>
      </div>
    </div>
  )
}
