import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listTeams, listPlayers } from '../../persistence/repositories'
import type { Team } from '../../domain/types'
import { C, bd, PageTitle, TeamBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'

export function TeamsList() {
  const translate = useT()
  const { can } = useAuth()
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    listTeams().then(async (ts) => {
      if (cancelled) return
      setTeams(ts)
      const entries = await Promise.all(ts.map(async (t) => [t.id, (await listPlayers(t.id)).length] as const))
      if (!cancelled) setCounts(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      {/* Creating a team is a write: the button only renders for whoever has the
          right, rather than demanding a code from whoever presses it. */}
      <PageTitle
        action={can('manage') && <Link to="/teams/new" className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('teams.new')}</Link>} />

      {teams === null ? (
        <div className="h-24 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : teams.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>{translate('teams.none')}</p>
          {can('manage') && <Link to="/teams/new" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('welcome.firstTeam')}</Link>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`}
              className="group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5"
              style={{ background: C.card, border: bd }}>
              <TeamBadge id={t.id} name={t.name} size="h-11 w-11 text-sm" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-extrabold tracking-tight">{t.name}</h3>
                <p className="text-sm" style={{ color: C.muted }}>{translate('common.player', { count: counts[t.id] ?? 0 })}</p>
              </div>
              <span className="opacity-0 transition group-hover:opacity-100" style={{ color: C.accent }}>→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
