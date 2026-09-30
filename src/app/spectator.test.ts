import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { subscribeBundle } from './spectator'

/* The smallest `EventSource` the subscription needs: the test drives its state and
   fires its handlers by hand, as the browser would. */
class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static last: FakeEventSource
  readyState = FakeEventSource.CONNECTING
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  constructor() { FakeEventSource.last = this }
  close() { this.readyState = FakeEventSource.CLOSED }
}

const real = globalThis.EventSource
let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
  vi.useRealTimers()
  globalThis.EventSource = real
})

const polls = () => fetchSpy.mock.calls.filter(([u]) => String(u) === '/api/match/m1').length

describe('subscribeBundle', () => {
  it('does not poll when the stream errors while reconnecting', () => {
    const stop = subscribeBundle('m1', () => {})
    FakeEventSource.last.onerror!()
    vi.advanceTimersByTime(10_000)
    expect(polls()).toBe(0)
    stop()
  })

  it('polls once the stream is closed, and stops when it opens again', () => {
    const stop = subscribeBundle('m1', () => {})
    const es = FakeEventSource.last
    es.readyState = FakeEventSource.CLOSED
    es.onerror!()
    vi.advanceTimersByTime(2500)
    expect(polls()).toBe(1)
    es.readyState = FakeEventSource.OPEN
    es.onopen!()
    vi.advanceTimersByTime(10_000)
    expect(polls()).toBe(1)
    stop()
  })
})
