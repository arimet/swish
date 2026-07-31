import type { Period } from './types'

export function newId(): string {
  return crypto.randomUUID()
}
export function periodLength(period: Period): number {
  return period <= 4 ? 600 : 300
}
export function elapsedGlobal(period: Period, gameClock: number): number {
  let before = 0
  for (let p = 1; p < period; p++) before += periodLength(p)
  return before + (periodLength(period) - gameClock)
}
