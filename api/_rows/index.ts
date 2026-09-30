import type { Store } from './db.js'
import { teams } from './team.js'
import { players } from './player.js'
import { matches } from './match.js'
import { results } from './result.js'
import { convocations } from './convocation.js'
import { trainings } from './training.js'
import { plays } from './play.js'
import { messages } from './message.js'

/** The eight document kinds the client speaks, each mapped to its tables. */
export const STORES = {
  team: teams, player: players, match: matches, result: results,
  convocation: convocations, training: trainings, play: plays, message: messages,
// A `Store<T>` is invariant in `T`, so no narrower bound accepts all eight kinds.
// oxlint-disable-next-line no-explicit-any
} as const satisfies Record<string, Store<any>>

export type Kind = keyof typeof STORES

export const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in STORES

/** Loosely typed access for the routes, which receive documents as JSON. */
export const store = (k: Kind) => STORES[k] as unknown as Store<unknown>
