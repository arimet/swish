import { useEffect, useMemo, useState } from 'react'
import { listMatches, listTeams } from '../../persistence/repositories'
import type { Match, Team } from '../../domain/types'
import { C, MatchCard, PageTitle, fmtDate } from '../olive/kit'

export function Calendrier() {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})

  useEffect(() => {
    let cancel = false
    Promise.all([listMatches(), listTeams()]).then(([m, t]) => {
      if (cancel) return
      setTeams(Object.fromEntries(t.map((x) => [x.id, x])))
      setMatches(m)
    })
    return () => { cancel = true }
  }, [])

  const groups = useMemo(() => {
    if (!matches) return []
    const map = new Map<string, Match[]>()
    for (const m of matches) {
      const k = m.meta.date ?? '—'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(m)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [matches])

  return (
    <div className="p-6">
      <PageTitle title="Calendrier" subtitle="Toutes les rencontres de la saison, par date." />
      {!matches ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm" style={{ borderColor: C.border, color: C.muted }}>Aucune rencontre planifiée.</p>
      ) : (
        <div className="space-y-8">
          {groups.map(([iso, ms]) => {
            const f = fmtDate(iso === '—' ? undefined : iso)
            return (
              <section key={iso}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-center leading-none" style={{ background: C.card2 }}>
                    <span className="block text-base font-black">{f.day}</span>
                    <span className="block text-[9px] font-bold" style={{ color: C.muted }}>{f.wd}</span>
                  </span>
                  <div>
                    <p className="text-sm font-extrabold capitalize">{f.long || 'Date inconnue'}</p>
                    <p className="text-[11px] font-semibold" style={{ color: C.muted }}>{ms.length} rencontre{ms.length > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {ms.map((m) => <MatchCard key={m.id} m={m} teams={teams} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
