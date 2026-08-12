import { useEffect, useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import { listMatches, listTeams, listTrainings, saveTraining, deleteTraining } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import type { Match, Team, Training } from '../../domain/types'
import { C, bd, MatchCard, PageTitle, fmtDate } from '../olive/kit'
import { useClub } from '../../app/club'
import { useAuth } from '../../app/auth'

// L'entraînement se distingue de la rencontre par une couleur qui n'est prise
// par aucun autre badge de l'écran (le vert vaut victoire/en direct, l'ambre
// vaut « à venir », le rose est l'accent des rencontres) : au coup d'œil, le
// bleu ne peut désigner qu'une séance d'entraînement.
const ENTR_COLOR = '#4d9fff'
const ENTR_BG = 'rgba(77,159,255,0.16)'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

type CalItem = { key: string; time: string } & ({ kind: 'match'; match: Match } | { kind: 'training'; training: Training })

export function Calendrier() {
  const { clubId } = useClub()
  const { guard } = useAuth()
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [trainings, setTrainings] = useState<Training[] | null>(null)

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
  const supprimer = (id: string) => guard('manage', async () => { await deleteTraining(id); refreshTrainings() })

  return (
    <div className="p-6">
      <PageTitle title="Calendrier" subtitle="Les rencontres et entraînements de votre équipe, par date." />
      {!nos || !nosEntrainements ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm" style={{ borderColor: C.border, color: C.muted }}>Aucune rencontre ni entraînement planifié.</p>
      ) : (
        <div className="space-y-8">
          {groups.map(([iso, items]) => {
            const f = fmtDate(iso === '—' ? undefined : iso)
            const nbRencontres = items.filter((i) => i.kind === 'match').length
            const nbEntrainements = items.filter((i) => i.kind === 'training').length
            const résumé = [
              nbRencontres ? `${nbRencontres} rencontre${nbRencontres > 1 ? 's' : ''}` : '',
              nbEntrainements ? `${nbEntrainements} entraînement${nbEntrainements > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(' · ')
            return (
              <section key={iso}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-center leading-none" style={{ background: C.card2 }}>
                    <span className="block text-base font-black">{f.day}</span>
                    <span className="block text-[9px] font-bold" style={{ color: C.muted }}>{f.wd}</span>
                  </span>
                  <div>
                    <p className="text-sm font-extrabold capitalize">{f.long || 'Date inconnue'}</p>
                    <p className="text-[11px] font-semibold" style={{ color: C.muted }}>{résumé}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {items.map((it) => it.kind === 'match'
                    ? <MatchCard key={it.key} m={it.match} teams={teams} />
                    : <TrainingCard key={it.key} t={it.training} onDelete={() => supprimer(it.training.id)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Saisie réservée à l'admin : le mot de passe est demandé à la validation. */}
      <section className="mt-8 rounded-2xl p-5" style={{ background: C.card, border: bd }}>
        <p className="mb-4 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>Nouvel entraînement</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="entr-date" label="Date de l'entraînement" type="date" value={date} onChange={setDate} />
          <Field id="entr-time" label="Heure" type="time" value={time} onChange={setTime} />
          <Field id="entr-place" label="Lieu" value={place} onChange={setPlace} />
          <Field id="entr-theme" label="Thème" value={theme} onChange={setTheme} />
        </div>
        <button onClick={ajouter} disabled={!date || !clubId} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: ENTR_COLOR }}>
          Ajouter l'entraînement
        </button>

        {/* Comme les convocations et les résultats extérieurs : même formulation que sur
            les écrans Championnat et fiche de rencontre, pour ne pas laisser croire à deux
            limites différentes — la décision couvrait aussi bien les entraînements. */}
        <p className="mt-4 text-[11px]" style={{ color: C.faint }}>Ces entraînements restent sur cet appareil : ils ne sont pas synchronisés avec vos autres appareils.</p>
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

/** Carte d'entraînement : même gabarit que `MatchCard` pour se mêler à la
 *  grille, mais une pastille et une bordure bleues la distinguent d'une
 *  rencontre sans qu'il faille lire un seul mot. */
function TrainingCard({ t, onDelete }: { t: Training; onDelete: () => void }) {
  return (
    <div className="flex gap-3 rounded-2xl p-3" style={{ background: C.card, border: `1px solid ${ENTR_COLOR}55` }}>
      <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-xl" style={{ background: ENTR_BG }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENTR_COLOR }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase" style={{ background: ENTR_BG, color: ENTR_COLOR }}>Entraînement</span>
          {t.time && <span className="ml-auto text-[11px] font-bold" style={{ color: C.muted }}>{t.time}</span>}
        </div>
        <p className="mt-2 truncate text-sm font-bold">{t.theme || 'Séance libre'}</p>
        <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[11px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          <span className="truncate">{t.place || '—'}</span>
          <button onClick={onDelete} aria-label="Supprimer cet entraînement" className="shrink-0 rounded-lg px-1.5 py-0.5 font-black" style={{ color: C.pink }}>✕</button>
        </div>
      </div>
    </div>
  )
}
