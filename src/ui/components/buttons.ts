/**
 * The scorer's table's buttons: one size and five looks, shared by every dialog the
 * table opens, so a primary reads as one everywhere and a foul as a foul.
 *
 * Square-ish (8 px) and neutral. The brand's lemon is kept for the brand — the logo,
 * the player's dot — and out of the controls: spread over every selected state it
 * turned the dialog green, and a colour that is everywhere stops meaning anything.
 * What is chosen reads by contrast instead: ink on the card, raised on its track.
 */
export const BTN = 'inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-muted)] disabled:pointer-events-none'

/** The one action a screen is for: ink, the strongest contrast the theme has (white
 *  on the dark card, black on the light one). Disabled, it fades to the surface. */
export const PRIMARY = 'bg-[var(--c-text)] font-bold text-[var(--c-card)] hover:opacity-90 disabled:bg-[var(--c-card2)] disabled:text-[var(--c-faint)]'

/** An ordinary entry: a flat surface, a shade lighter on hover. */
export const SECONDARY = 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-border)] disabled:opacity-40'

/** A choice offered beside the main one (the and-one): outlined, not filled. */
export const OUTLINE = 'bg-transparent text-[var(--c-text)] ring-1 ring-inset ring-[var(--c-border)] hover:bg-[var(--c-card2)]'

/** A foul, or anything that takes away. */
export const DANGER = 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)] disabled:opacity-40'

/** The yes of a deletion. */
export const DANGER_FILLED = 'bg-[var(--c-danger-fill)] font-bold text-[var(--c-on-danger)] hover:brightness-110'

/** A switch's track and its faces (made/missed, the number of free throws). */
export const SEGMENTS = 'grid gap-1 rounded-lg bg-[var(--c-card2)] p-1'
export const SEGMENT = 'h-11 rounded-md text-sm font-semibold transition-[background-color,color,box-shadow] duration-150'
export const SEGMENT_OFF = 'text-[var(--c-muted)] hover:text-[var(--c-text)]'
/** The face chosen: raised on its track, in ink. */
export const SEGMENT_ON = 'bg-[var(--c-card)] font-bold text-[var(--c-text)] shadow-sm ring-1 ring-inset ring-[var(--c-border)]'
/** A chosen item outside a track (a player picked): ink, like the primary. */
export const PICKED = 'bg-[var(--c-text)] font-bold text-[var(--c-card)]'
