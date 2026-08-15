import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { playerStats } from '../../domain/boxscore'
import { playingTimes } from '../../domain/playingtime'
import { teamTotals } from '../../domain/totals'
import { matchRatios, scoreProgression } from '../../domain/progression'
import { fmt } from '../components/GameClock'
import { ProgressionChart } from '../../export/ProgressionChart'
import { printSummary } from '../../export/print'
import { liveState } from '../../rules/ffbb'
import type { Match, Player, TeamSide } from '../../domain/types'
import { useT } from '../../i18n'

export function Summary({ match, players, teamNames }: { match: Match; players: Record<string, Player>; teamNames: Record<TeamSide, string> }) {
  const trad = useT()
  const ratios = matchRatios(match)
  const score = liveState(match).score
  return (
    <div className="space-y-8 p-4">
      <Button className="no-print" onClick={printSummary}>{trad('imprime.exporter')}</Button>
      <TeamBox match={match} players={players} />
      <OpponentLine name={teamNames.B} score={score.b} />
      <section>
        <h3 className="font-bold mb-2">{trad('imprime.donneesRatios')}</h3>
        <ul className="text-sm grid grid-cols-2 gap-x-8 max-w-xl">
          <li>Avantage max — A {ratios.A.maxLead} / B {ratios.B.maxLead}</li>
          <li>Série max — A {ratios.A.maxRun} / B {ratios.B.maxRun}</li>
          <li>Points du banc — A {teamTotals(match).bench.points}</li>
          <li>Égalités — {ratios.ties}</li>
          <li>Durée avantage — A {fmt(ratios.A.leadDurationSec)} / B {fmt(ratios.B.leadDurationSec)}</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold mb-2">{trad('resume.progression')}</h3>
        <ProgressionChart points={scoreProgression(match)} />
      </section>
    </div>
  )
}

/** Pas de tableau joueur pour l'adversaire (roster vide), mais son score reste
 *  réel — l'écrire évite la contradiction avec le score final affiché en
 *  en-tête. */
function OpponentLine({ name, score }: { name: string; score: number }) {
  const trad = useT()
  return (
    <section>
      <h3 className="font-bold mb-2">{trad('imprime.visiteurs')}</h3>
      <p className="border border-black p-2 text-sm">
        {name} — {score} points. Score saisi globalement — l'adversaire n'a pas d'effectif à détailler.
      </p>
    </section>
  )
}

function TeamBox({ match, players }: { match: Match; players: Record<string, Player> }) {
  const trad = useT()
  const stats = playerStats(match)
  const times = playingTimes(match)
  const totals = teamTotals(match)
  return (
    <section>
      <h3 className="font-bold mb-2">{trad('imprime.locaux')}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{trad('equipe.numero')}</TableHead><TableHead>{trad('imprime.nomPrenom')}</TableHead><TableHead>5</TableHead>
            <TableHead>{trad('resume.thTps')}</TableHead><TableHead>{trad('resume.thPts')}</TableHead><TableHead>{trad('resume.thTirs')}</TableHead>
            <TableHead>{trad('resume.th3pts')}</TableHead><TableHead>{trad('resume.th2Int')}</TableHead><TableHead>{trad('resume.th2Ext')}</TableHead>
            <TableHead>{trad('resume.thLf')}</TableHead><TableHead>{trad('resume.thFtes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((s) => {
            const p = players[s.playerId]
            return (
              <TableRow key={s.playerId}>
                <TableCell>{p?.number}</TableCell>
                <TableCell>{p ? `${p.lastName}, ${p.firstName}` : s.playerId}</TableCell>
                <TableCell>{s.isStarter ? '✕' : ''}</TableCell>
                <TableCell>{fmt(times.get(s.playerId) ?? 0)}</TableCell>
                <TableCell>{s.points}</TableCell><TableCell>{s.fieldGoalsMade}</TableCell>
                <TableCell>{s.threes}</TableCell><TableCell>{s.twoInside}</TableCell>
                <TableCell>{s.twoOutside}</TableCell><TableCell>{s.freeThrows}</TableCell>
                <TableCell>{s.fouls}</TableCell>
              </TableRow>
            )
          })}
          <TableRow className="font-semibold">
            <TableCell colSpan={4}>{trad('imprime.totalEquipe')}</TableCell>
            <TableCell>{totals.team.points}</TableCell><TableCell>{totals.team.fieldGoalsMade}</TableCell>
            <TableCell>{totals.team.threes}</TableCell><TableCell>{totals.team.twoInside}</TableCell>
            <TableCell>{totals.team.twoOutside}</TableCell><TableCell>{totals.team.freeThrows}</TableCell>
            <TableCell>{totals.team.fouls}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
  )
}
