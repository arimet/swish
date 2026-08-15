import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  /**
   * L'écriture échoue : l'écran doit revenir à l'état d'avant.
   *
   * L'affichage précédait l'écriture sans jamais la vérifier — et pour trois des cinq
   * chemins (`undo`, `removeLast`, `finish`), l'écriture n'avait même pas de `catch` :
   * une promesse rejetée dans le vide. Le tableau d'affichage pouvait donc annoncer un
   * panier que la base n'avait pas, et le point disparaissait au rechargement. Sur un
   * score officiel, un état qui mente est plus grave qu'une action refusée.
   */
  it('revient en arrière et le dit quand l’enregistrement échoue', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())
    // Un évènement valide d'abord, pour partir d'un état non vide.
    await act(async () => { await result.current.dispatch({ type: 'PERIOD_START', period: 1, gameClock: 600 }) })
    await act(async () => { await result.current.dispatch({ type: 'CLOCK_START', period: 1, gameClock: 600 }) })
    expect(result.current.match!.events).toHaveLength(2)

    const put = vi.spyOn(db.matches, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await act(async () => {
      await result.current.dispatch({ type: 'SCORE', team: 'A', playerId: 'p1', kind: '2int', period: 1, gameClock: 590 })
    })
    put.mockRestore()

    // Le panier n'est ni à l'écran ni en base, et l'échec est annoncé — sans exposer
    // le message technique de l'exception.
    expect(result.current.match!.events).toHaveLength(2)
    expect((await db.matches.get('m1'))!.events).toHaveLength(2)
    expect(result.current.error).toMatch(/enregistrement impossible/i)
    expect(result.current.error).not.toMatch(/QuotaExceededError/)
  })

  it('« Terminer » signale son échec, pour que l’appelant ne quitte pas la rencontre', async () => {
    const { result } = renderHook(() => useMatch('m1'))
    await waitFor(() => expect(result.current.match).not.toBeNull())

    const put = vi.spyOn(db.matches, 'put').mockRejectedValueOnce(new Error('bloqué'))
    let issue: boolean | undefined
    await act(async () => { issue = await result.current.finish() })
    put.mockRestore()

    expect(issue).toBe(false)
    expect(result.current.match!.status).toBe('live')
    expect((await db.matches.get('m1'))!.status).toBe('live')

    // Et le cas nominal renvoie bien `true`, sinon on ne quitterait jamais.
    await act(async () => { issue = await result.current.finish() })
    expect(issue).toBe(true)
    expect((await db.matches.get('m1'))!.status).toBe('finished')
  })

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
