import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQueryClient } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '../test/render'
import { count, put } from '../test/fakeApi'
import { docKey, usePlayerCounts, usePlayers, useTeams } from './queries'
import { deletePlayer, savePlayer, saveTeam } from './repositories'
import type { Player, Team } from '../domain/types'

/**
 * The reading layer, and what it promises the screens.
 *
 * These are not tests of React Query. They are tests of the four decisions taken on top
 * of it, each of which has a defect on the other side of it:
 *
 * — **one cache entry per kind**, so two rosters share one request;
 * — **a write invalidates only what it touched**, so deleting a player does not cost the
 *   schedule its match sheets;
 * — **an accepted document is filed rather than re-read**, so a gesture in the play
 *   editor costs one request and not two;
 * — **`select` keeps a stable identity**, without which a screen running an effect on
 *   its data loops for ever.
 */

const team = (id: string, name: string): Team => ({ id, name })
const player = (id: string, teamId: string, number: number): Player =>
  ({ id, teamId, number, lastName: `N${number}`, firstName: 'X' })

/* The counter below spies on the global `fetch` the fake API installed. Restoring it
   between cases is not tidiness: a spy left in place is captured as the "real" fetch by
   the next one, and the second case then reads through a chain that no longer answers. */
afterEach(() => { vi.restoreAllMocks() })

/** Counts the reads of one kind, whatever else the fake API is asked for. */
function readsOf(kind: string) {
  const seen = { n: 0 }
  const real = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input).includes(`kind=${kind}`) && (init?.method ?? 'GET') === 'GET') seen.n++
    return real(input, init)
  })
  return seen
}

describe('one cache entry per kind', () => {
  it('two teams\' rosters share a single request', async () => {
    await saveTeam(team('ta', 'A')); await saveTeam(team('tb', 'B'))
    await savePlayer(player('p1', 'ta', 7)); await savePlayer(player('p2', 'tb', 9))
    const reads = readsOf('player')

    // Both rosters, plus the tally the teams list shows: three callers, one key.
    const { result } = renderHook(() => ({
      a: usePlayers('ta'),
      b: usePlayers('tb'),
      counts: usePlayerCounts(),
    }))
    await waitFor(() => expect(result.current.a.data).toHaveLength(1))
    await waitFor(() => expect(result.current.b.data).toHaveLength(1))

    expect(result.current.a.data![0].id).toBe('p1')
    expect(result.current.b.data![0].id).toBe('p2')
    expect(result.current.counts.data).toEqual({ ta: 1, tb: 1 })
    expect(reads.n, 'reads of the player kind').toBe(1)
  })

  it('a filtered roster keeps the same array between renders', async () => {
    // Without this, `select` hands back a new array on every render, and a screen with
    // an effect on its roster — `OliveShell` forgetting a departed player — never stops
    // re-running it.
    await saveTeam(team('ta', 'A'))
    await savePlayer(player('p1', 'ta', 7))
    const { result, rerender } = renderHook(() => usePlayers('ta'))
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    const first = result.current.data
    rerender()
    rerender()
    expect(result.current.data).toBe(first)
  })
})

describe('what a write does to the cache', () => {
  it('files the accepted document instead of reading it back', async () => {
    await saveTeam(team('ta', 'A'))
    const { result } = renderHook(() => ({ teams: useTeams(), client: useQueryClient() }))
    await waitFor(() => expect(result.current.teams.data).toHaveLength(1))

    await act(async () => { await saveTeam({ id: 'ta', name: 'A', coach: 'Dupont' }) })

    // The single-document entry is right without anyone having read it: the server took
    // exactly this document.
    expect(result.current.client.getQueryData(docKey('team', 'ta')))
      .toEqual({ id: 'ta', name: 'A', coach: 'Dupont' })
  })

  it('a deletion becomes `null`, which is how an absent document is spelled', async () => {
    await saveTeam(team('ta', 'A'))
    await savePlayer(player('p1', 'ta', 7))
    const { result } = renderHook(() => ({ players: usePlayers('ta'), client: useQueryClient() }))
    await waitFor(() => expect(result.current.players.data).toHaveLength(1))

    await act(async () => { await deletePlayer('p1') })

    expect(result.current.client.getQueryData(docKey('player', 'p1'))).toBeNull()
    await waitFor(() => expect(result.current.players.data).toHaveLength(0))
  })

  it('leaves the kinds it did not touch alone', async () => {
    // The point of announcing ops rather than clearing everything. A roster edit used to
    // cost the schedule its match sheets — ninety kilobytes for five games.
    await saveTeam(team('ta', 'A'))
    const { result } = renderHook(() => ({ teams: useTeams(), players: usePlayers('ta') }))
    await waitFor(() => expect(result.current.teams.data).toHaveLength(1))
    await waitFor(() => expect(result.current.players.data).toEqual([]))
    const teamReads = readsOf('team')

    await act(async () => { await savePlayer(player('p1', 'ta', 7)) })
    await waitFor(() => expect(result.current.players.data).toHaveLength(1))

    expect(teamReads.n, 'reads of the team kind after a player was written').toBe(0)
  })
})

/**
 * The screens' side of it: a write anywhere reaches every screen showing the same kind,
 * with nothing at the call site to remember. That is what replaced the `reload()` each
 * screen used to keep — and the defects were always the forgotten one.
 */
describe('the bridge, seen from a screen', () => {
  function Roster({ teamId }: { teamId: string }) {
    const { data } = usePlayers(teamId)
    return <ul>{(data ?? []).map((p) => <li key={p.id}>{p.lastName}</li>)}</ul>
  }

  it('a screen follows a write it did not make', async () => {
    await saveTeam(team('ta', 'A'))
    await savePlayer(player('p1', 'ta', 7))
    render(<Roster teamId="ta" />)
    expect(await screen.findByText('N7')).toBeInTheDocument()

    await act(async () => { await savePlayer(player('p2', 'ta', 12)) })

    expect(await screen.findByText('N12')).toBeInTheDocument()
  })

  it('a fixture filed behind the API is not seen, and that is deliberate', async () => {
    // `put` writes straight into the store, past `/api/mutate`: it is a test's
    // arrangement, not a gesture. Nothing announces it, so nothing invalidates — which
    // is why `src/test/render.tsx` gives every case its own empty client instead of
    // trying to keep one in step with fixtures filed behind its back.
    await saveTeam(team('ta', 'A'))
    render(<Roster teamId="ta" />)
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument())

    put('player', 'p9', player('p9', 'ta', 9))

    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('N9')).not.toBeInTheDocument()
    expect(count('player')).toBe(1)
  })
})
