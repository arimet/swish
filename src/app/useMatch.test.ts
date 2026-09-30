import { act, renderHook, waitFor } from '../test/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMatch } from './useMatch'
import { doc } from '../test/fakeApi'
import { saveMatch } from '../persistence/repositories'
import { fetchBundle, subscribeBundle, type SpectatorBundle } from './spectator'
import type { GameEvent, Match } from '../domain/types'

/* The real `subscribeBundle`, spied on: the tests below read the callback the hook gave
   it, to play the part of the live stream. Every other test still gets the real thing. */
vi.mock('./spectator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./spectator')>()
  return { ...actual, subscribeBundle: vi.fn(actual.subscribeBundle), fetchBundle: vi.fn(actual.fetchBundle) }
})
const streamCallback = () => vi.mocked(subscribeBundle).mock.calls.at(-1)![1]

const seed = (): Match => ({
  id: 'm1', meta: { championshipLabel: 'PRM', clubId: 'a', opponentId: 'b' },
  roster: ['p1'], events: [], status: 'live',
})

beforeEach(async () => { await saveMatch(seed()) })

describe('useMatch', () => {
  /**
   * The write fails: the screen must return to its previous state.
   *
   * The display preceded the write without ever checking it — and for three of the five
   * paths (`undo`, `removeLast`, `finish`), the write did not even have a `catch`: a
   * promise rejected into the void. The scoreboard could therefore announce a basket
   * the store did not have, and the point vanished on reload. On an official score, a
   * state that lies is worse than an action refused.
   */
  it('rolls back and says so when the save fails', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    // A valid event first, so as to start from a non-empty state.
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_START', period: 1, gameClock: 600 }) })
    await act(async () => { await result.current.dispatch({ type: 'CLOCK_START', period: 1, gameClock: 600 }) })
    expect(result.current.match!.events).toHaveLength(2)

    // The write leaves for the database and the network drops it: the one failure
    // mode this hook exists to handle.
    const put = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await act(async () => {
      await result.current.dispatch({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 1, gameClock: 590 })
    })
    put.mockRestore()

    // The basket is neither on screen nor in the database, and the failure is announced —
    // without exposing the exception's technical message.
    expect(result.current.match!.events).toHaveLength(2)
    expect(doc<Match>('match', 'm1')!.events).toHaveLength(2)
    expect(result.current.error).toMatch(/enregistrement impossible/i)
    expect(result.current.error).not.toMatch(/QuotaExceededError/)
  })

  it('"Finish" reports its failure, so that the caller does not leave the game', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())

    const put = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('bloqué'))
    let issue: boolean | undefined
    await act(async () => { issue = await result.current.finish() })
    put.mockRestore()

    expect(issue).toBe(false)
    expect(result.current.match!.status).toBe('live')
    expect(doc<Match>('match', 'm1')!.status).toBe('live')

    // And the nominal case does return `true`, otherwise we would never leave.
    await act(async () => { issue = await result.current.finish() })
    expect(issue).toBe(true)
    expect(doc<Match>('match', 'm1')!.status).toBe('finished')
  })

  it('two devices on one game: neither loses the other\'s events', async () => {
    const a = renderHook(() => useMatch('m1'))
    const b = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(a.result.current.match).not.toBeNull())
    await waitFor(() => expect(b.result.current.match).not.toBeNull())

    await act(async () => {
      await Promise.all([
        a.result.current.dispatch({ type: 'PERIOD_START', period: 1, gameClock: 600 }),
        b.result.current.dispatch({ type: 'TIMEOUT', team: 'A', period: 1, gameClock: 600 }),
      ])
    })

    expect(doc<Match>('match', 'm1')!.events.map((e) => e.type).sort()).toEqual(['PERIOD_START', 'TIMEOUT'])
  })

  it('loads the game, dispatches an event and saves', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_START', period: 1, gameClock: 600 }) })
    expect(result.current.match!.events).toHaveLength(1)
    expect(doc<Match>('match', 'm1')!.events).toHaveLength(1)
  })
  it('surfaces a validation error without crashing', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      await result.current.dispatch({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', period: 1, gameClock: 600 })
    })
    expect(result.current.error).toBeTruthy()
    expect(result.current.match!.events).toHaveLength(0)
  })
  it('dispatchMany saves several chained events in a single write', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      await result.current.dispatchMany([
        { type: 'PERIOD_END', period: 1, gameClock: 0 },
        { type: 'PERIOD_START', period: 2, gameClock: 600 },
      ])
    })
    expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
    const saved = doc<Match>('match', 'm1')
    expect(saved!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
  })
  it('finish() moves the status to finished and saves it', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    expect(result.current.match!.status).toBe('live')
    await act(async () => { await result.current.finish() })
    expect(result.current.match!.status).toBe('finished')
    const saved = doc<Match>('match', 'm1')
    expect(saved!.status).toBe('finished')
  })
  it('two synchronous dispatches (same act) both persist (nothing lost through a stale closure)', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      const p1 = result.current.dispatch({ type: 'PERIOD_END', period: 1, gameClock: 0 })
      const p2 = result.current.dispatch({ type: 'PERIOD_START', period: 2, gameClock: 600 })
      await Promise.all([p1, p2])
    })
    expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
    const saved = doc<Match>('match', 'm1')
    expect(saved!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
  })

  it('a stream message with another device\'s event shows on the screen', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    const theirs: GameEvent = { id: 'theirs', type: 'PERIOD_START', wallClock: 0, period: 1, gameClock: 600 }
    const bundle = { match: { ...result.current.match!, events: [theirs] }, players: [], teamNames: { A: 'A', B: 'B' } } as SpectatorBundle
    act(() => streamCallback()(bundle))
    // React Query tells its observers on a later tick, hence the wait.
    await waitFor(() => expect(result.current.match!.events.map((e) => e.id)).toEqual(['theirs']))
  })

  it('two taps in one act, the first write refused: only the first event leaves', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())

    const put = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('coupé'))
    await act(async () => {
      await Promise.all([
        result.current.dispatch({ type: 'PERIOD_END', period: 1, gameClock: 0 }),
        result.current.dispatch({ type: 'PERIOD_START', period: 2, gameClock: 600 }),
      ])
    })
    put.mockRestore()

    expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_START'])
    expect(doc<Match>('match', 'm1')!.events.map((e) => e.type)).toEqual(['PERIOD_START'])
  })

  it('a late one-off re-read does not hide a tap a newer stream message showed', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    const bundleOf = (events: GameEvent[]) =>
      ({ match: { ...result.current.match!, events }, players: [], teamNames: { A: 'A', B: 'B' } }) as SpectatorBundle

    // Tap A is refused; the re-read it triggers leaves, and its answer is held back.
    let answer!: (b: SpectatorBundle) => void
    vi.mocked(fetchBundle).mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const put = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('coupé'))
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_END', period: 1, gameClock: 0 }) })
    put.mockRestore()
    const stale = bundleOf([])

    // Tap B lands, and the stream shows it.
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_START', period: 2, gameClock: 600 }) })
    const b = result.current.match!.events
    expect(b.map((e) => e.type)).toEqual(['PERIOD_START'])
    act(() => streamCallback()(bundleOf(b)))

    // The older answer arrives last.
    await act(async () => { answer(stale) })
    await waitFor(() => expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_START']))
  })
})
