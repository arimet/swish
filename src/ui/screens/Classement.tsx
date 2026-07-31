import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listMatches, listTeams } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { liveState } from '../../rules/ffbb'
import type { Match, Team } from '../../domain/types'
import { C, bd, PageTitle, TeamBadge, champLabel } from '../olive/kit'

type Line = { id: string; name: string; j: number; v: number; d: number; pf: number; pa: number; pts: number }

/** Classement FFBB simplifié : victoire = 2 pts, défaite = 1 pt (matchs terminés). */
function standings(matches: Match[], teams: Record<string, Team>): { champ: string; lines: Line[] }[] {
  const byChamp = new Map<string, Map<string, Line>>()
  const ensure = (champ: string, id: string) => {
    if (!byChamp.has(champ)) byChamp.set(champ, new Map())
    const m = byChamp.get(champ)!
    if (!m.has(id)) m.set(id, { id, name: teams[id]?.name ?? id, j: 0, v: 0, d: 0, pf: 0, pa: 0, pts: 0 })
    return m.get(id)!
  }
  for (const match of matches) {
    if (match.status !== 'finished') continue
    const { score } = liveState(match)
    const A = ensure(champLabel(match.meta), match.meta.teamAId)
    const B = ensure(champLabel(match.meta), match.meta.teamBId)
    A.j++; B.j++; A.pf += score.a; A.pa += score.b; B.pf += score.b; B.pa += score.a
    if (score.a >= score.b) { A.v++; A.pts += 2; B.d++; B.pts += 1 } else { B.v++; B.pts += 2; A.d++; A.pts += 1 }
  }
  return [...byChamp.entries()].map(([champ, m]) => ({
    champ,
    lines: [...m.values()].sort((x, y) => y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa)),
  }))
}

export function Classement() {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  useEffect(() => {
    let cancel = false
    refresh().then(() => Promise.all([listMatches(), listTeams()])).then(([m, t]) => {
      if (cancel) return
      setTeams(Object.fromEntries(t.map((x) => [x.id, x]))); setMatches(m)
    })
    return () => { cancel = true }
  }, [])

  const tables = useMemo(() => (matches ? standings(matches, teams) : []), [matches, teams])

  return (
    <div className="p-6">
      <PageTitle title="Classement" subtitle="Victoire = 2 pts · défaite = 1 pt · sur les rencontres terminées." />
      {!matches ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : tables.every((t) => t.lines.every((l) => l.j === 0)) ? (
        <p className="rounded-2xl border border-dashed py-16 text-center text-sm" style={{ border: bd, color: C.muted }}>Aucune rencontre terminée pour l’instant.</p>
      ) : (
        <div className="space-y-8">
          {tables.map(({ champ, lines }) => (
            <section key={champ}>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide" style={{ color: C.orange }}>{champ}</h2>
              <div className="overflow-hidden rounded-2xl" style={{ border: bd, background: C.card }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: C.faint }} className="text-[11px] font-bold uppercase">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-2 py-3 text-left">Équipe</th>
                      <Th>J</Th><Th>V</Th><Th>D</Th><Th>Pour</Th><Th>Contre</Th><Th>Diff</Th><Th>Pts</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="px-4 py-3 font-black" style={{ color: i === 0 ? C.orange : C.muted }}>{i + 1}</td>
                        <td className="px-2 py-3">
                          <span className="flex items-center gap-2.5">
                            <TeamBadge id={l.id} name={l.name} size="h-7 w-7 text-[9px]" />
                            <span className="font-bold">{l.name}</span>
                          </span>
                        </td>
                        <Td>{l.j}</Td><Td>{l.v}</Td><Td>{l.d}</Td><Td>{l.pf}</Td><Td>{l.pa}</Td>
                        <Td>{l.pf - l.pa > 0 ? `+${l.pf - l.pa}` : l.pf - l.pa}</Td>
                        <td className="px-3 py-3 text-center text-base font-black tabular-nums" style={{ color: C.text }}>{l.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
function Th({ children }: { children: ReactNode }) { return <th className="px-3 py-3 text-center">{children}</th> }
function Td({ children }: { children: ReactNode }) { return <td className="px-3 py-3 text-center font-semibold tabular-nums" style={{ color: '#b9b9c0' }}>{children}</td> }
