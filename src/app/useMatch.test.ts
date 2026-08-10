import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMatch } from './useMatch'
import { db } from '../persistence/db'
import { saveMatch } from '../persistence/repositories'
import type { Match } from '../domain/types'

const seed = (): Match => ({
  id: 'm1', meta: { championshipLabel: 'PRM', clubId: 'a', opponentId: 'b' },
  roster: ['p1'], events: [], status: 'live',
})

beforeEach(async () => { await db.matches.clear(); await saveMatch(seed()) })

describe('useMatch', () => {
  it('charge le match, dispatch un évènement et persiste', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_START', period: 1, gameClock: 600 }) })
    expect(result.current.match!.events).toHaveLength(1)
    expect((await db.matches.get('m1'))!.events).toHaveLength(1)
  })
  it('expose une erreur de validation sans planter', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      await result.current.dispatch({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '3', period: 1, gameClock: 600 })
    })
    expect(result.current.error).toBeTruthy()
    expect(result.current.match!.events).toHaveLength(0)
  })
  it('dispatchMany persiste plusieurs évènements enchaînés en une seule sauvegarde', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      await result.current.dispatchMany([
        { type: 'PERIOD_END', period: 1, gameClock: 0 },
        { type: 'PERIOD_START', period: 2, gameClock: 600 },
      ])
    })
    expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
    const saved = await db.matches.get('m1')
    expect(saved!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
  })
  it('finish() passe le statut à finished et le persiste', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    expect(result.current.match!.status).toBe('live')
    await act(async () => { await result.current.finish() })
    expect(result.current.match!.status).toBe('finished')
    const saved = await db.matches.get('m1')
    expect(saved!.status).toBe('finished')
  })
  it('deux dispatch synchrones (même act) persistent tous les deux (pas de perte via une closure périmée)', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    await act(async () => {
      const p1 = result.current.dispatch({ type: 'PERIOD_END', period: 1, gameClock: 0 })
      const p2 = result.current.dispatch({ type: 'PERIOD_START', period: 2, gameClock: 600 })
      await Promise.all([p1, p2])
    })
    expect(result.current.match!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
    const saved = await db.matches.get('m1')
    expect(saved!.events.map((e) => e.type)).toEqual(['PERIOD_END', 'PERIOD_START'])
  })
})
