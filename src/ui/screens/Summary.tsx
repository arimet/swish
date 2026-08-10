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

export function Summary({ match, players, teamNames }: { match: Match; players: Record<string, Player>; teamNames: Record<TeamSide, string> }) {
  const ratios = matchRatios(match)
  const score = liveState(match).score
  return (
    <div className="space-y-8 p-4">
      <Button className="no-print" onClick={printSummary}>Exporter / Imprimer (PDF)</Button>
      <TeamBox match={match} side="A" players={players} />
      <OpponentLine name={teamNames.B} score={score.b} />
      <section>
        <h3 className="font-bold mb-2">Données et ratios</h3>
        <ul className="text-sm grid grid-cols-2 gap-x-8 max-w-xl">
          <li>Avantage max — A {ratios.A.maxLead} / B {ratios.B.maxLead}</li>
          <li>Série max — A {ratios.A.maxRun} / B {ratios.B.maxRun}</li>
          <li>Points du banc — A {teamTotals(match, 'A').bench.points}</li>
          <li>Égalités — {ratios.ties}</li>
          <li>Durée avantage — A {fmt(ratios.A.leadDurationSec)} / B {fmt(ratios.B.leadDurationSec)}</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold mb-2">Progression du score</h3>
        <ProgressionChart points={scoreProgression(match)} />
      </section>
    </div>
  )
}

/** Pas de tableau joueur pour l'adversaire (roster vide), mais son score reste
 *  réel — l'écrire évite la contradiction avec le score final affiché en
 *  en-tête. */
function OpponentLine({ name, score }: { name: string; score: number }) {
  return (
    <section>
      <h3 className="font-bold mb-2">VISITEURS</h3>
      <p className="border border-black p-2 text-sm">
        {name} — {score} points. Score saisi globalement — l'adversaire n'a pas d'effectif à détailler.
      </p>
    </section>
  )
}

function TeamBox({ match, side, players }: { match: Match; side: TeamSide; players: Record<string, Player> }) {
  const stats = playerStats(match, side)
  const times = playingTimes(match, side)
  const totals = teamTotals(match, side)
  return (
    <section>
      <h3 className="font-bold mb-2">{side === 'A' ? 'LOCAUX' : 'VISITEURS'}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead><TableHead>Nom Prénom</TableHead><TableHead>5</TableHead>
            <TableHead>Tps</TableHead><TableHead>Pts</TableHead><TableHead>Tirs</TableHead>
            <TableHead>3pts</TableHead><TableHead>2 Int</TableHead><TableHead>2 Ext</TableHead>
            <TableHead>LF</TableHead><TableHead>Ftes</TableHead>
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
            <TableCell colSpan={4}>Total Équipe</TableCell>
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
