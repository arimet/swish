/* Kit visuel 'Olive' partagé par toutes les pages (palette + composants). */
import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { liveState } from '../../rules/ffbb'
import { champLabel, periodLength } from '../../domain/ids'
import { fmt } from '../components/GameClock'
import type { Match, Team } from '../../domain/types'

export { champLabel }

/**
 * La palette, en jetons. Aucune valeur n'est écrite ici : chaque entrée pointe
 * une variable CSS définie dans `ui/theme/themes.css`, où les deux thèmes se
 * lisent côte à côte. Une couleur en dur dans un écran est un thème qui ne
 * s'appliquera jamais — c'est la raison d'être de cet indirection.
 *
 * `T` est la palette du terrain. Elle ne bascule pas avec le thème : le tableau
 * tactique reste un panneau sombre, en clair comme en sombre (voir themes.css).
 */
export const C = {
  page: 'var(--c-page)', frame: 'var(--c-frame)', panel: 'var(--c-panel)',
  card: 'var(--c-card)', card2: 'var(--c-card2)', border: 'var(--c-border)',
  text: 'var(--c-text)', muted: 'var(--c-muted)', faint: 'var(--c-faint)',
  green: 'var(--c-green)', greenBg: 'var(--c-green-bg)',
  // accent principal = rose (comme Olive), approfondi en clair pour tenir sur blanc
  pink: 'var(--c-pink)', orange: 'var(--c-accent)', accent: 'var(--c-accent)',
  accentBg: 'var(--c-accent-bg)',
  amber: 'var(--c-amber)', amberBg: 'var(--c-amber-bg)',
  info: 'var(--c-info)', infoBg: 'var(--c-info-bg)',
  // Les liserés teintés. Ils remplacent les deux chiffres hexadécimaux qu'on
  // collait autrefois derrière l'accent pour l'affaiblir : le procédé cessait
  // de marcher dès que la valeur devenait un `var(…)`.
  accentBd: 'var(--c-accent-bd)', amberBd: 'var(--c-amber-bd)',
  // Le voile neutre : il assombrit en clair, il éclaircit en sombre.
  hover: 'var(--c-hover)', neutralBg: 'var(--c-neutral-bg)',
  // Ce qu'on écrit *sur* l'accent. Blanc dans les deux thèmes — l'accent est
  // assez saturé pour ça de part et d'autre — mais nommé, pour qu'un `#fff`
  // posé sur un fond clair se repère.
  onAccent: '#ffffff',
}
export const T = {
  court: 'var(--t-court)', courtHi: 'var(--t-court-hi)',
  line: 'var(--t-line)', ink: 'var(--t-ink)',
  attack: 'var(--t-attack)', def: 'var(--t-def)', ball: 'var(--t-ball)',
}
export const bd = `1px solid var(--c-border)`
const TEAM_COLORS = ['#552583', '#0072CE', '#98002E', '#007A33', '#b4491a', '#1D1160', '#0C2340', '#C8102E']
export const teamColor = (id?: string) => TEAM_COLORS[[...String(id ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % TEAM_COLORS.length]
export const initials = (n?: string) => String(n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—'
const WD = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']
const MO = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc']

export function fmtDate(iso?: string) {
  if (!iso) return { day: '—', wd: '', long: '' }
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return { day: '—', wd: '', long: iso }
  return { day: String(d.getDate()), wd: WD[d.getDay()], long: `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }
}
export function displayClock(m: Match) {
  const { period } = liveState(m)
  let sec = periodLength(period)
  for (let i = m.events.length - 1; i >= 0; i--) if (m.events[i].period === period) { sec = m.events[i].gameClock; break }
  return { label: period <= 4 ? `Q${period}` : `P${period - 4}`, clock: fmt(sec) }
}

export function Ic({ d, className = 'h-[18px] w-[18px]', style }: { d: string; className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}
export const ICON = {
  matches: 'M4 5h16v14H4zM4 10h16M9 5v14', cal: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  users: 'M16 20a4 4 0 0 0-8 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', trophy: 'M8 4h8v4a4 4 0 0 1-8 0zM6 4H4v2a3 3 0 0 0 3 3M18 4h2v2a3 3 0 0 1-3 3M9 14h6M10 18h4M12 14v4',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.9 7.9 0 0 0-1.7-1L15 3H9l-.3 2a7.9 7.9 0 0 0-1.7 1l-2.4-1-2 3.5L2.6 11a7.9 7.9 0 0 0 0 2L.6 14.5l2 3.5 2.4-1a7.9 7.9 0 0 0 1.7 1L9 21h6l.3-2a7.9 7.9 0 0 0 1.7-1l2.4 1 2-3.5z',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14', bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', chevron: 'm6 9 6 6 6-6', arrow: 'm9 6 6 6-6 6', plus: 'M12 5v14M5 12h14',
}

/** Marque discrète du joueur identifié sur cet appareil. Elle met en avant, elle
 *  ne protège rien : l'identité et les droits d'écriture sont deux axes séparés. */
export function Vous() {
  return (
    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
      style={{ background: C.accentBg, color: C.accent }}>vous</span>
  )
}

/** Le numéro de maillot, marqué partout de la même façon : un carré arrondi, du
 *  rose sur fond rose, et surtout des chiffres à chasse fixe (`nums`) centrés —
 *  un « 4 » et un « 12 » tiennent alors la même place et se lisent pareil.
 *  Reprend la pastille de la fiche joueur : trois écrans la recopiaient chacun
 *  de son côté, avec trois tailles de texte et deux arrondis. */
export function NumBadge({ n, size = 'h-8 w-8 rounded-xl text-sm' }: { n: number | string; size?: string }) {
  return (
    <span className={`nums grid shrink-0 place-items-center font-extrabold ${size}`}
      style={{ background: C.accentBg, color: C.accent }}>{n}</span>
  )
}

export function TeamBadge({ id, name, size = 'h-8 w-8 text-[9px]' }: { id: string; name: string; size?: string }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-black text-white ${size}`} style={{ background: teamColor(id) }}>{initials(name)}</span>
}

/** Carte de match façon 'Live Score' Olive. */
export function MatchCard({ m, teams }: { m: Match; teams: Record<string, Team> }) {
  const a = teams[m.meta.clubId]?.name ?? 'Équipe A', b = teams[m.meta.opponentId]?.name ?? 'Équipe B'
  const { score } = liveState(m); const dc = displayClock(m)
  const to = m.status === 'finished' ? `/match/${m.id}/summary` : m.status === 'live' ? `/match/${m.id}/live` : `/match/${m.id}`
  const leadA = score.a > score.b, leadB = score.b > score.a, setup = m.status === 'setup'
  return (
    <Link to={to} className="flex gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:border-[var(--c-muted)]" style={{ background: C.card, border: bd }}>
      <div className="flex w-11 shrink-0 flex-col items-center justify-between rounded-xl py-3" style={{ background: C.panel }}>
        <TeamBadge id={m.meta.clubId} name={a} />
        <span className="text-[10px] font-black" style={{ color: C.faint }}>VS</span>
        <TeamBadge id={m.meta.opponentId} name={b} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-bold uppercase" style={{ color: C.muted }}>{champLabel(m.meta)}</span>
          <span className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-black"
            style={m.status === 'live' ? { background: C.greenBg, color: C.green } : setup ? { background: C.amberBg, color: C.amber } : { background: C.neutralBg, color: C.muted }}>
            {m.status === 'live' ? `${dc.label} · ${dc.clock}` : setup ? m.meta.time : 'FINAL'}
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          <ScoreRow name={a} score={setup ? null : score.a} lead={leadA} dim={m.status === 'finished' && !leadA} />
          <ScoreRow name={b} score={setup ? null : score.b} lead={leadB} dim={m.status === 'finished' && !leadB} />
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[11px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
          <span className="truncate">{m.meta.venue}</span>
          <span>{setup ? m.meta.time : m.meta.matchNumber ? `n°${m.meta.matchNumber}` : ''}</span>
        </div>
      </div>
    </Link>
  )
}
function ScoreRow({ name, score, lead, dim }: { name: string; score: number | null; lead: boolean; dim: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex-1 truncate text-sm" style={{ color: dim ? C.faint : lead ? C.text : C.muted, fontWeight: lead ? 800 : 600 }}>{name}</span>
      {lead && score !== null && <Ic d={ICON.arrow} className="h-3.5 w-3.5" style={{ color: C.pink }} />}
      <span className="w-8 text-right text-base font-black tabular-nums" style={{ color: score === null ? C.faint : dim ? C.faint : lead ? C.text : C.muted }}>{score === null ? '–' : score}</span>
    </div>
  )
}

/** Barre d'action de l'écran (le titre est déjà affiché dans le header du shell).
 *  Plus de sous-titre : la phrase d'explication sous le titre n'apprenait rien à
 *  qui ouvrait la page, et le paramètre part avec elle — un paramètre que plus
 *  personne ne passe finit par être repassé par erreur. Sans action — le cas d'un
 *  visiteur à qui les boutons d'écriture sont masqués — la barre ne se rend pas,
 *  plutôt que de garder une place vide en haut de l'écran. */
export function PageTitle({ action }: { action?: ReactNode }) {
  if (!action) return null
  return <div className="mb-6 flex flex-wrap items-center justify-end gap-3">{action}</div>
}
