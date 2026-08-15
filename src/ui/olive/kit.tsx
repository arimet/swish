/* The shared 'Olive' visual kit, used by every page (palette + components). */
import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { liveState } from '../../rules/ffbb'
import { FRIENDLY, leagueLabel, periodLength } from '../../domain/ids'
import { fmt } from '../components/GameClock'
import type { Match, MatchMeta, Team } from '../../domain/types'
import { currentLang, useT } from '../../i18n'

export { leagueLabel }

/**
 * The palette, as tokens. No value is written here: every entry points at a CSS
 * variable defined in `ui/theme/themes.css`, where the two themes read side by
 * side. A hard-coded colour in a screen is a theme that will never apply — that is
 * the whole point of this indirection.
 *
 * `T` is the court's palette: the floor. Its **surface** switches with the theme —
 * light wood in the light application, dark wood in the dark one — but its **colour
 * convention** does not: red always says "attack", blue "defence", amber "ball".
 * The court used to be a fixed charcoal panel in both themes; see themes.css for
 * what changed and why.
 */
export const C = {
  page: 'var(--c-page)', frame: 'var(--c-frame)', panel: 'var(--c-panel)',
  card: 'var(--c-card)', card2: 'var(--c-card2)', border: 'var(--c-border)',
  text: 'var(--c-text)', muted: 'var(--c-muted)', faint: 'var(--c-faint)',
  green: 'var(--c-green)', greenBg: 'var(--c-green-bg)',
  // The **vivid** fills and the ink each one carries. They are what give the screen
  // its colour. The `*Bg` above stay the pale shades for discreet backgrounds, and
  // the inks (`green`, `danger`, `amber`, `info`) serve the rare places where a pill
  // would be ridiculous — a figure in a table. The whole palette used to be made of
  // inks, hence darkened throughout to hold on white: that is what made it dull.
  greenFill: 'var(--c-green-fill)', onGreen: 'var(--c-on-green)',
  goldFill: 'var(--c-gold-fill)', onGold: 'var(--c-on-gold)',
  dangerFill: 'var(--c-danger-fill)', onDanger: 'var(--c-on-danger)',
  infoFill: 'var(--c-info-fill)', onInfo: 'var(--c-on-info)',
  // Orange, in two roles. `brand` **fills** (buttons, pills, crest) and carries
  // `onBrand`, a dark ink — which is what lets it stay vivid. `accent` **writes**
  // (small text, icons, figures) and is deepened to hold on light backgrounds. A
  // single token did both, which forced it to the darkest end of the hue: it came
  // out brick-coloured.
  //
  // The name says the role and not the hue. These keys used to be called `pink` and
  // `orange`, and `orange` rendered raspberry once the palette had turned: a name
  // that describes a colour goes stale at the first colour change.
  brand: 'var(--c-brand)', onBrand: 'var(--c-on-brand)',
  accent: 'var(--c-accent)',
  accentBg: 'var(--c-accent-bg)',
  amber: 'var(--c-amber)', amberBg: 'var(--c-amber-bg)',
  info: 'var(--c-info)', infoBg: 'var(--c-info-bg)',
  danger: 'var(--c-danger)', dangerBg: 'var(--c-danger-bg)',
  // The tinted hairlines. They replace the two hex digits once appended to the
  // accent to weaken it: the trick stopped working as soon as the value became a
  // `var(…)`.
  accentBd: 'var(--c-accent-bd)', amberBd: 'var(--c-amber-bd)',
  // The neutral veil: it darkens on light, it lightens on dark.
  hover: 'var(--c-hover)', neutralBg: 'var(--c-neutral-bg)',
  // What is written *on* the accent. It **switches** with the theme, and it is the
  // one token that inverts its meaning: on light the accent is a burnt orange
  // carrying white, on dark a vivid orange carrying near-black. The hard-coded
  // `#fff` of before became illegible as soon as the dark theme came on.
  onAccent: 'var(--c-on-accent)',
}
export const T = {
  court: 'var(--t-court)', courtHi: 'var(--t-court-hi)', paint: 'var(--t-paint)',
  line: 'var(--t-line)', ink: 'var(--t-ink)',
  attack: 'var(--t-attack)', onAttack: 'var(--t-on-attack)',
  def: 'var(--t-def)', ball: 'var(--t-ball)',
}
export const bd = `1px solid var(--c-border)`
const TEAM_COLORS = ['#552583', '#0072CE', '#98002E', '#007A33', '#b4491a', '#1D1160', '#0C2340', '#C8102E']
export const teamColor = (id?: string) => TEAM_COLORS[[...String(id ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % TEAM_COLORS.length]
export const initials = (n?: string) => String(n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—'
/* Abbreviated days and months: `Intl` holds them in both languages, two hand-written
   arrays only held one. The locale comes from the application and not from the browser
   — a French club reads "SAM 12 avr." on a machine set to English. The trailing dot of
   the French abbreviations ("sam.", "avr.") is dropped: the date cartouche is in tight
   capitals, where punctuation makes noise. */
const stripDot = (s: string) => s.replace(/\.$/, '')
const shortWeekday = (d: Date) =>
  stripDot(new Intl.DateTimeFormat(currentLang(), { weekday: 'short' }).format(d)).toUpperCase()
const shortMonth = (d: Date) =>
  stripDot(new Intl.DateTimeFormat(currentLang(), { month: 'short' }).format(d))

export function fmtDate(iso?: string) {
  if (!iso) return { day: '—', wd: '', long: '' }
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return { day: '—', wd: '', long: iso }
  return { day: String(d.getDate()), wd: shortWeekday(d), long: `${shortWeekday(d)} ${d.getDate()} ${shortMonth(d)}` }
}

/**
 * The league label as written on screen: the name entered, or a translated
 * "Friendly". The sentinel stays intact in the data (see `FRIENDLY`); it only
 * becomes a sentence here.
 */
export function useLeagueLabel() {
  const translate = useT()
  return (v: MatchMeta | string) => {
    const l = typeof v === 'string' ? v : leagueLabel(v)
    return l === FRIENDLY ? translate('commun.matchAmical') : l
  }
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
  // The ball: the mark. A circle and three seams, drawn with the same stroke as the
  // rest of the set — the 🏀 it replaces was a coloured pictogram, therefore neither
  // orange on light nor white on dark, and redrawn by every operating system.
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3.6 8.6c4.5 1 10.3 1 16.8 0M3.6 15.4c4.5-1 10.3-1 16.8 0M12 3c-2.8 2.4-2.8 15.6 0 18',
}

/** A discreet mark for the player identified on this device. It highlights, it
 *  protects nothing: identity and write rights are two separate axes. */
export function You() {
  const translate = useT()
  return (
    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-black uppercase tracking-wide"
      style={{ background: C.accentBg, color: C.accent }}>{translate('commun.vous')}</span>
  )
}

/** The jersey number, marked the same way everywhere: a rounded square, accent on
 *  accent, and above all centred tabular figures (`nums`) — a "4" and a "12" then
 *  take the same room and read alike. Taken from the player sheet's pill: three
 *  screens each kept their own copy, with three text sizes and two radii. */
export function NumBadge({ n, size = 'h-8 w-8 rounded-xl text-sm' }: { n: number | string; size?: string }) {
  return (
    <span className={`nums grid shrink-0 place-items-center font-extrabold ${size}`}
      style={{ background: C.accentBg, color: C.accent }}>{n}</span>
  )
}

export function TeamBadge({ id, name, size = 'h-8 w-8 text-[12px]' }: { id: string; name: string; size?: string }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-black text-white ${size}`} style={{ background: teamColor(id) }}>{initials(name)}</span>
}

/** A game card in the Olive 'Live Score' manner. */
export function MatchCard({ m, teams }: { m: Match; teams: Record<string, Team> }) {
  const translate = useT()
  const champ = useLeagueLabel()
  const a = teams[m.meta.clubId]?.name ?? translate('commun.equipeA'), b = teams[m.meta.opponentId]?.name ?? translate('commun.equipeB')
  const { score } = liveState(m); const dc = displayClock(m)
  const to = m.status === 'finished' ? `/match/${m.id}/summary` : m.status === 'live' ? `/match/${m.id}/live` : `/match/${m.id}`
  const leadA = score.a > score.b, leadB = score.b > score.a, setup = m.status === 'setup'
  return (
    <Link to={to} className="flex gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5 hover:border-[var(--c-muted)]" style={{ background: C.card, border: bd }}>
      <div className="flex w-11 shrink-0 flex-col items-center justify-between rounded-xl py-3" style={{ background: C.panel }}>
        <TeamBadge id={m.meta.clubId} name={a} />
        <span className="text-[12px] font-black" style={{ color: C.faint }}>VS</span>
        <TeamBadge id={m.meta.opponentId} name={b} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-bold" style={{ color: C.muted }}>{champ(m.meta)}</span>
          <span className="ml-auto rounded-md px-1.5 py-0.5 text-[12px] font-black"
            style={m.status === 'live' ? { background: C.greenFill, color: C.onGreen } : setup ? { background: C.goldFill, color: C.onGold } : { background: C.neutralBg, color: C.muted }}>
            {m.status === 'live' ? `${dc.label} · ${dc.clock}` : setup ? m.meta.time : 'FINAL'}
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          <ScoreRow name={a} score={setup ? null : score.a} lead={leadA} dim={m.status === 'finished' && !leadA} />
          <ScoreRow name={b} score={setup ? null : score.b} lead={leadB} dim={m.status === 'finished' && !leadB} />
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[12px] font-semibold" style={{ borderColor: C.border, color: C.faint }}>
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
      {lead && score !== null && <Ic d={ICON.arrow} className="h-3.5 w-3.5" style={{ color: C.accent }} />}
      <span className="w-8 text-right text-base font-black tabular-nums" style={{ color: score === null ? C.faint : dim ? C.faint : lead ? C.text : C.muted }}>{score === null ? '–' : score}</span>
    </div>
  )
}

/** A titled section, in its card. Three screens each kept their own copy, to the
 *  character — hence three places to touch for a single title change, and the
 *  guarantee that one of the three would be forgotten.
 *
 *  The title is a real title: `<h2>`, in sentence case, at body size stepped up, in
 *  the text ink. It used to be a twelve-pixel micro-label in tracked capitals, in
 *  the palest colour — the shape of a decorative eyebrow, whereas "Top scorers" is
 *  very much the title of what follows. That shape cost twice: it flattened the
 *  typographic scale (all the text sat between twelve and twenty pixels) and
 *  capitals across thirty characters are read letter by letter, the silhouette of
 *  the words having vanished. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <h2 className="mb-3 text-base font-bold tracking-tight" style={{ color: C.text }}>{title}</h2>
      {children}
    </section>
  )
}

/** The same title, outside a card: for sections that have no frame of their own.
 *  One section-title style in the application, in one place. */
export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-base font-bold tracking-tight ${className}`} style={{ color: C.text }}>{children}</h2>
}

/** The screen's action bar (the title is already shown in the shell header). No
 *  subtitle any more: the explanatory sentence under the title taught nothing to
 *  whoever opened the page, and the parameter goes with it — a parameter nobody
 *  passes any more ends up being passed again by mistake. With no action — the case
 *  of a visitor whose write buttons are hidden — the bar does not render, rather
 *  than keep an empty slot at the top of the screen. */
export function PageTitle({ action }: { action?: ReactNode }) {
  if (!action) return null
  return <div className="mb-6 flex flex-wrap items-center justify-end gap-3">{action}</div>
}
