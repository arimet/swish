/**
 * What an end-of-season cleanup can target, derived from the games that exist:
 * there is no league table and no season table, exactly as there is no folder table
 * for plays (see `folders`). A league emptied of its games therefore disappears on
 * its own, with nothing left to tidy up.
 *
 * These functions serve both sides: counting what an operation will destroy before
 * announcing it, and destroying it. An irreversible operation must not announce a
 * number computed any other way than by what it will actually delete.
 */
import { leagueLabel } from './ids'
import type { Match } from './types'

/** The leagues these games declare, sorted the French way. */
export const leagues = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => leagueLabel(m.meta)))].sort((a, b) => a.localeCompare(b, 'fr'))

/** The calendar years these games declare, most recent first. The model does not
 *  know about the sporting season (August–June): nothing in the data carries that
 *  split, so the calendar year is what we can offer honestly. A game with no date
 *  belongs to no year, and no year-based cleanup ever takes it. */
export const years = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => m.meta.date?.slice(0, 4)).filter((a): a is string => !!a))].sort().reverse()

/** The clubs whose games these are. Used to offer clearing sheets per team: the
 *  opponent never has a sheet, so it is not one of them. */
export const clubsOfGames = (matches: Match[]): string[] =>
  [...new Set(matches.map((m) => m.meta.clubId))]

export const ofLeague = (label: string) => (m: Match): boolean => leagueLabel(m.meta) === label
export const ofYear = (year: string) => (m: Match): boolean => m.meta.date?.slice(0, 4) === year

/** The sheets to clear for this club: its games carrying at least one event. A game
 *  still blank has nothing to lose — counting it would announce a destruction that
 *  would not happen. */
export const hasEvents = (clubId: string) => (m: Match): boolean => m.meta.clubId === clubId && m.events.length > 0
