import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listMatches, listTeams } from '../../persistence/repositories'
import { refresh } from '../../persistence/remote'
import { standings } from '../../domain/standings'
import type { Match, Team } from '../../domain/types'
import { C, bd, PageTitle, TeamBadge } from '../olive/kit'

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
