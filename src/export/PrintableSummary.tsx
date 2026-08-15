import './print.css'
import { Summary } from '../ui/screens/Summary'
import type { Match, Player, TeamSide } from '../domain/types'
import { useT } from '../i18n'

export function PrintableSummary({ match, players, teamNames }: {
  match: Match; players: Record<string, Player>; teamNames: Record<TeamSide, string>
}) {
  const trad = useT()
  const { meta } = match
  return (
    <div className="printable">
      <header className="border border-black p-2 mb-2 text-sm">
        <div className="flex justify-between">
          <strong>{meta.championshipLabel?.trim() || trad('commun.matchAmical')}</strong>
          <span>{[meta.matchNumber && trad('apercu.rencontreNumero', { n: meta.matchNumber }), meta.date, meta.venue].filter(Boolean).join(' — ')}</span>
        </div>
        <div className="flex justify-between">
          <span>{trad('commun.equipeA')} : {teamNames.A} &nbsp; / &nbsp; {trad('commun.equipeB')} : {teamNames.B}</span>
          <span>{trad('impression.arbitres')} : {meta.referee1 ?? ''} {meta.referee2 ?? ''} {meta.referee3 ?? ''}</span>
        </div>
      </header>
      <Summary match={match} players={players} teamNames={teamNames} />
    </div>
  )
}
