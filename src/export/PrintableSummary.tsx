import './print.css'
import { Summary } from '../ui/screens/Summary'
import type { Match, Player, TeamSide } from '../domain/types'
import { useT } from '../i18n'

export function PrintableSummary({ match, players, teamNames }: {
  match: Match; players: Record<string, Player>; teamNames: Record<TeamSide, string>
}) {
  const translate = useT()
  const { meta } = match
  return (
    <div className="printable">
      <header className="border border-black p-2 mb-2 text-sm">
        <div className="flex justify-between">
          <strong>{meta.championshipLabel?.trim() || translate('commun.matchAmical')}</strong>
          <span>{[meta.matchNumber && translate('apercu.rencontreNumero', { n: meta.matchNumber }), meta.date, meta.venue].filter(Boolean).join(' — ')}</span>
        </div>
        <div className="flex justify-between">
          <span>{translate('commun.equipeA')} : {teamNames.A} &nbsp; / &nbsp; {translate('commun.equipeB')} : {teamNames.B}</span>
          <span>{translate('impression.arbitres')} : {meta.referee1 ?? ''} {meta.referee2 ?? ''} {meta.referee3 ?? ''}</span>
        </div>
      </header>
      <Summary match={match} players={players} teamNames={teamNames} />
    </div>
  )
}
