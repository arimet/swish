import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getMatch, listTeams, deleteMatch, listPlayers, getConvocation, saveConvocation } from '../../persistence/repositories'
import { remoteEnabled } from '../../persistence/remote'
import type { Match, Team, Player } from '../../domain/types'
import { C, bd, PageTitle, SectionTitle, TeamBadge, fmtDate , useLeagueLabel } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useT } from '../../i18n'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Eye } from 'lucide-react'

const field = { height: 44, borderRadius: 10, background: C.panel, border: bd, color: C.text, padding: '0 12px', outline: 'none' } as const

/** The record of a planned game (status 'setup'): an Olive-style summary with
 * starting and deletion. Live and finished games go to their own screens. */
export function MatchPreview({ matchId }: { matchId: string }) {
  const translate = useT()
  const champ = useLeagueLabel()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const { can, guard } = useAuth()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [askDelete, setAskDelete] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [calledUp, setCalledUp] = useState<Set<string>>(new Set())
  const [meetTime, setMeetTime] = useState('')
  const [meetPlace, setMeetPlace] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancel = false
    getMatch(matchId).then(async (m) => {
      if (cancel || !m) { if (!cancel) setMatch(m ?? null); return }
      const ts = await listTeams()
      if (cancel) return
      setTeams(Object.fromEntries(ts.map((t) => [t.id, t])))
      setMatch(m)
    })
    return () => { cancel = true }
  }, [matchId])

  // The club's roster and any call-up already saved: loaded once per game. A reload
  // triggered by a keystroke in progress (say an effect that trusts "the field is
  // empty") would overwrite what is being typed the moment someone clears a field to
  // retype it — so these values are applied once, never mid-entry.
  // The roster is THE GAME's club (`match.meta.clubId`, never absent), not the device
  // setting (`useClub`, a local preference that may name a different club if the club
  // has been changed since): an old game, reopened by a direct link after a club
  // change, must keep the roster it belongs to.
  useEffect(() => {
    if (!match) return
    let cancel = false
    Promise.all([listPlayers(match.meta.clubId), getConvocation(match.id)]).then(([ps, conv]) => {
      if (cancel) return
      setPlayers(ps)
      // Checks the loaded ids against the real roster: a player removed from the
      // roster since may still appear in a call-up already saved (`deletePlayer`'s
      // cascade only repairs the future), and would otherwise stay counted with no box
      // to untick.
      const rosterIds = new Set(ps.map((p) => p.id))
      setCalledUp(new Set((conv?.playerIds ?? []).filter((id) => rosterIds.has(id))))
      setMeetTime(conv?.meetTime ?? '')
      setMeetPlace(conv?.meetPlace ?? '')
      setNote(conv?.note ?? '')
    })
    return () => { cancel = true }
  }, [match?.id])

  // Arrived from a "Call up" link (dashboard, calendar): the call-up is at the bottom
  // of the record, so we bring it into view. The scroll waits for the roster, because
  // the section does not exist yet at click time — the data arrives afterwards.
  // `scrollIntoView` is called defensively: jsdom does not implement it.
  useEffect(() => {
    if (hash === '#convocation' && players.length) document.getElementById('convocation')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [hash, players.length])

  if (match === null) return <p className="py-16 text-center text-sm" style={{ color: C.muted }}>{translate('apercu.introuvable')}</p>

  const nameOf = (id: string) => teams[id]?.name ?? '—'
  const f = fmtDate(match.meta.date)
  // Two different rights on this record: calling up and deleting belong to the club,
  // starting the game belongs to the scorer's table.
  const manages = can('manage')
  const keepsScore = can('score')
  // Starting (or resuming) belongs to the scorer's table, not to administration: the
  // Saturday volunteer must be able to start the game they are about to keep, without
  // the admin code. Calling up and deleting, just below, stay administrative.
  const start = () => guard('score', () => navigate(`/match/${match.id}/live`))
  const remove = async () => { await deleteMatch(match.id); navigate('/calendrier') }

  const toggleCalledUp = (id: string) => guard('manage', () => {
    setCalledUp((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  })
  const saveCallUp = () => guard('manage', async () => {
    await saveConvocation({
      matchId: match.id, playerIds: [...calledUp],
      meetTime: meetTime.trim() || undefined, meetPlace: meetPlace.trim() || undefined, note: note.trim() || undefined,
    })
  })

  const statusPill =
    match.status === 'live' ? { label: translate('commun.enCours'), bg: C.greenBg, fg: C.green }
    : match.status === 'finished' ? { label: translate('commun.terminee'), bg: C.neutralBg, fg: C.muted }
    : { label: translate('commun.aVenir'), bg: C.amberBg, fg: C.amber }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle action={<Link to="/calendrier" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{translate('apercu.retourCalendrier')}</Link>} />

      <div className="rounded-2xl p-6" style={{ background: C.card, border: bd }}>
        {/* The league used to be the page's "subtitle"; it was not one, it is a fact
            about the game. So it joins the record's banner, between the status and the
            number. */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="rounded-md px-2 py-1 text-[12px] font-black uppercase" style={{ background: statusPill.bg, color: statusPill.fg }}>{statusPill.label}</span>
          <span className="min-w-0 truncate text-[12px] font-bold" style={{ color: C.muted }}>{champ(match.meta)}</span>
          {match.meta.matchNumber && <span className="ml-auto text-[12px] font-bold" style={{ color: C.faint }}>{translate('apercu.rencontreNumero', { n: match.meta.matchNumber })}</span>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamCol id={match.meta.clubId} name={nameOf(match.meta.clubId)} role={translate('match.locaux')} coach={match.meta.coachA} count={match.roster.length} />
          <span className="text-xl font-black" style={{ color: C.faint }}>{translate('apercu.vs')}</span>
          {/* The opposition has no roster entered for this game: no player count to show. */}
          <TeamCol id={match.meta.opponentId} name={nameOf(match.meta.opponentId)} role={translate('match.visiteurs')} coach={teams[match.meta.opponentId]?.coach} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-3" style={{ borderColor: C.border }}>
          <Info label={translate('match.date')} value={f.long || translate('apercu.aDefinir')} />
          <Info label={translate('match.heure')} value={match.meta.time || '—'} />
          <Info label={translate('match.lieu')} value={match.meta.venue || '—'} />
        </div>
      </div>

      {/* `scroll-mt-6`: the anchor stops below the top edge, not flush against it. */}
      <div id="convocation" className="mt-6 scroll-mt-6 rounded-2xl p-6" style={{ background: C.card, border: bd }}>
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>{translate('apercu.convocation')}</SectionTitle>
          {/* Shown at all times, not only after saving: twelve called up for a game
              where only ten can be listed must be visible without counting boxes. */}
          <span className="rounded-md px-2 py-1 text-[12px] font-black" style={{ background: C.accentBg, color: C.accent }}>
            {translate('compte.convoque', { count: calledUp.size })}
          </span>
        </div>

        {/* Calling up writes; knowing whether you are called up does not — it is even
            the first thing a player comes here to read. The section therefore stays
            whole for everyone, as checkboxes for whoever calls up, as a list for
            whoever is called up. */}
        {manages ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...players].sort((a, b) => a.number - b.number).map((p) => (
                <PlayerCheckbox key={p.id} player={p} checked={calledUp.has(p.id)} onToggle={() => toggleCalledUp(p.id)} />
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="convoc-heure" label={translate('apercu.heureRdv')} type="time" value={meetTime} onChange={setMeetTime} />
              <Field id="convoc-lieu" label={translate('apercu.lieuRdv')} value={meetPlace} onChange={setMeetPlace} />
            </div>
            <div className="mt-4">
              <label htmlFor="convoc-note" className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('apercu.consignes')}</label>
              <textarea id="convoc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                className="mt-1.5 w-full rounded-[10px] p-3 text-sm" style={{ background: C.panel, border: bd, color: C.text }} />
            </div>

            <button onClick={saveCallUp} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
              {translate('apercu.enregistrerConvocation')}
            </button>

            {/* Like the league results: no synchronisation for the call-up, worded the
                same way as on the standings screen so as not to suggest two different
                limits. */}
            {!remoteEnabled() && <p className="mt-4 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('apercu.convocationLocale')}</p>}
          </>
        ) : calledUp.size === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>{translate('apercu.personneConvoquee')}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...players].filter((p) => calledUp.has(p.id)).sort((a, b) => a.number - b.number).map((p) => (
                <span key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.panel }}>
                  <span className="text-xs font-black" style={{ color: C.accent }}>N°{p.number}</span>
                  {p.lastName} {p.firstName}
                </span>
              ))}
            </div>
            {(meetTime || meetPlace) && (
              <p className="mt-4 text-sm" style={{ color: C.muted }}>{translate('apercu.rendezVous', { detail: [meetTime, meetPlace].filter(Boolean).join(' · ') })}</p>
            )}
            {note && <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: C.muted }}>{note}</p>}
          </>
        )}
      </div>

      {/* `justify-end` and not `justify-between`: without it, "Delete" disappearing
          would slide the rest of the row to the left. */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {/* The right is checked when the dialog opens, not re-derived afterwards:
            someone who locks themselves out while the confirmation is open can still
            confirm it. That is accepted — the scenario requires handing the tablet over
            mid-action, and `LiveMatch` re-evaluates `can()` on every render because
            recording a game lasts two hours, not because the other screens forgot
            to. */}
        {manages && (
          <button onClick={() => guard('manage', () => setAskDelete(true))} className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
            {translate('commun.supprimer')}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/match/${match.id}/watch`} target="_blank" className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}><Eye className="h-4 w-4" strokeWidth={2} />{translate('garde.suiviSpectateur')}</Link>
          {match.status === 'finished' ? (
            <Link to={`/match/${match.id}/summary`} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>{translate('apercu.voirResume')}</Link>
          ) : (
            // Starting or resuming is the scorer's table's gesture: the button is
            // theirs, and does not appear to a visitor reading the record.
            keepsScore && (
              <button onClick={start} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
                {translate(match.status === 'live' ? 'apercu.reprendreRencontre' : 'apercu.demarrerRencontre')}
              </button>
            )
          )}
        </div>
      </div>

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={remove}
        title={translate('apercu.supprimerTitre')} message={translate('apercu.supprimerTexte')} confirmLabel={translate('commun.supprimer')} danger />
    </div>
  )
}

function TeamCol({ id, name, role, coach, count }: { id: string; name: string; role: string; coach?: string; count?: number }) {
  const translate = useT()
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamBadge id={id} name={name} size="h-14 w-14 text-sm" />
      <span className="line-clamp-2 text-base font-extrabold">{name}</span>
      <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{role}</span>
      {coach && <span className="text-[12px]" style={{ color: C.faint }}>{translate('apercu.coach', { name: coach })}</span>}
      {count !== undefined && <span className="text-[12px]" style={{ color: C.faint }}>{translate('commun.joueur', { count })}</span>}
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold capitalize">{value}</p>
    </div>
  )
}
function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full text-sm" style={field} />
    </div>
  )
}
function PlayerCheckbox({ player, checked, onToggle }: { player: Player; checked: boolean; onToggle: () => void }) {
  const id = `convoque-${player.id}`
  return (
    <label htmlFor={id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: C.panel }}>
      <input id={id} type="checkbox" checked={checked} onChange={onToggle} />
      <span className="text-xs font-black" style={{ color: C.accent }}>N°{player.number}</span>
      {player.lastName} {player.firstName}
    </label>
  )
}
