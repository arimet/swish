/**
 * The scorer's table's buttons: one size and five looks, shared by every dialog the
 * table opens, so a primary reads as one everywhere and a foul as a foul.
 *
 * No borders: filled surfaces on the card, a shade lighter on hover. The outlines they
 * replaced drew a grid of boxes over the dialog, which is what made it look like a
 * form rather than a control panel.
 */
export const BTN = 'inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent-bd)] disabled:pointer-events-none'

/** The one action a screen is for. Disabled, it turns neutral instead of a faded
 *  brand: a washed-out lemon reads as "almost on", grey reads as "not yet". */
export const PRIMARY = 'bg-[var(--c-brand)] font-black text-[var(--c-on-brand)] shadow-[0_8px_20px_-10px_var(--c-accent-bd)] hover:brightness-105 disabled:bg-[var(--c-card2)] disabled:text-[var(--c-faint)] disabled:shadow-none'

/** An ordinary entry. */
export const SECONDARY = 'bg-[var(--c-card2)] text-[var(--c-text)] hover:bg-[var(--c-border)] disabled:opacity-40'

/** A secondary that stands out: the and-one, a choice offered after the main one. */
export const ACCENT = 'bg-[var(--c-accent-bg)] font-black text-[var(--c-accent)] ring-1 ring-inset ring-[var(--c-accent-bd)] hover:bg-[var(--c-accent-bd)]'

/** A foul, or anything that takes away. */
export const DANGER = 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:bg-[var(--c-danger-fill)] hover:text-[var(--c-on-danger)] disabled:opacity-40'

/** The yes of a deletion. */
export const DANGER_FILLED = 'bg-[var(--c-danger-fill)] font-black text-[var(--c-on-danger)] hover:brightness-110'

/** A two-way switch's track and its two faces (made/missed, made/missed per attempt). */
export const SEGMENTS = 'grid gap-1 rounded-2xl bg-[var(--c-card2)] p-1'
export const SEGMENT = 'h-11 rounded-xl text-sm font-bold transition-[background-color,color,box-shadow] duration-150'
export const SEGMENT_OFF = 'text-[var(--c-muted)] hover:text-[var(--c-text)]'
export const SEGMENT_BRAND = 'bg-[var(--c-brand)] text-[var(--c-on-brand)] shadow-sm'
/** The other face: raised on the track rather than coloured — a miss is not a fault. */
export const SEGMENT_PLAIN = 'bg-[var(--c-card)] text-[var(--c-text)] shadow-sm'
