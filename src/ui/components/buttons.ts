/**
 * The scorer's table's buttons: one size and five looks, shared by every dialog the
 * table opens, so a primary reads as one everywhere and a foul as a foul.
 *
 * Square-ish (8 px), and the brand's green as a line rather than a fill: filled, it
 * covered every selected state and turned the dialog green; outlined, it still says
 * "this one" — the primary, the face chosen, the player picked — without flooding.
 * Everything else is a neutral surface.
 */
/** Everything but the size: the match screen's buttons are a notch smaller (44 px)
 *  than the dialogs' (48 px), and two heights in one class list would be a coin toss. */
export const BTN_BASE = 'inline-flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-muted)] disabled:pointer-events-none'
export const BTN = `${BTN_BASE} h-12 px-3 text-sm`
export const BTN_SM = `${BTN_BASE} h-11 px-3 text-xs`

/** The one action a screen is for: a green line, nothing filled. Disabled, the line
 *  goes grey. */
export const PRIMARY = 'bg-transparent font-bold text-[var(--c-accent)] ring-2 ring-inset ring-[var(--c-brand)] hover:bg-[var(--c-hover)] disabled:text-[var(--c-faint)] disabled:ring-1 disabled:ring-[var(--c-border)]'

/** An ordinary entry: a flat surface, a shade lighter on hover. */
export const SECONDARY = 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-border)] disabled:opacity-40'

/** A choice offered beside the main one (the and-one): outlined, not filled. */
export const OUTLINE = 'bg-transparent text-[var(--c-text)] ring-1 ring-inset ring-[var(--c-border)] hover:bg-[var(--c-card2)]'

/** A foul, or anything that takes away. */
export const DANGER = 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)] disabled:opacity-40'

/** What stops or ends, outlined like the primary: the clock's "Stop". */
export const DANGER_OUTLINE = 'bg-transparent font-bold text-[var(--c-danger)] ring-2 ring-inset ring-[var(--c-danger-fill)] hover:bg-[var(--c-hover)]'

/** The yes of a deletion. */
export const DANGER_FILLED = 'bg-[var(--c-danger-fill)] font-bold text-[var(--c-on-danger)] hover:brightness-110'

/** A switch's track and its faces (made/missed, the number of free throws). */
export const SEGMENTS = 'grid gap-1 rounded-lg bg-[var(--c-card2)] p-1'
export const SEGMENT = 'h-11 rounded-md text-sm font-semibold transition-[background-color,color,box-shadow] duration-150'
export const SEGMENT_OFF = 'text-[var(--c-muted)] hover:text-[var(--c-text)]'
/** The face chosen: outlined in green on its track. */
export const SEGMENT_ON = 'bg-transparent font-bold text-[var(--c-accent)] ring-2 ring-inset ring-[var(--c-brand)]'
/** A chosen item outside a track (a player picked): outlined in green too. */
export const PICKED = 'bg-transparent font-bold text-[var(--c-accent)] ring-2 ring-inset ring-[var(--c-brand)]'
