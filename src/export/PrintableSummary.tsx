import './print.css'
import { Summary } from '../ui/screens/Summary'
import type { Match, Player, TeamSide } from '../domain/types'

export function PrintableSummary({ match, players, teamNames }: {
  match: Match; players: Record<string, Player>; teamNames: Record<TeamSide, string>
}) {
  const { meta } = match
  return (
    <div className="printable">
      <header className="border border-black p-2 mb-2 text-sm">
        <div className="flex justify-between">
          <strong>{meta.championshipLabel?.trim() || 'Match amical'}</strong>
          <span>{[meta.matchNumber && `Rencontre N° ${meta.matchNumber}`, meta.date, meta.venue].filter(Boolean).join(' — ')}</span>
        </div>
        <div className="flex justify-between">
          <span>Équipe A : {teamNames.A} &nbsp; / &nbsp; Équipe B : {teamNames.B}</span>
          <span>Arbitres : {meta.referee1 ?? ''} {meta.referee2 ?? ''} {meta.referee3 ?? ''}</span>
        </div>
      </header>
      <Summary match={match} players={players} teamNames={teamNames} />
    </div>
  )
}
