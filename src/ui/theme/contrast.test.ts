import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The palette's legibility check.
 *
 * `themes.css` used to announce its ratios in comments, which checks nothing: the
 * next touch-up leaves the sentence intact and breaks the measurement. That happened
 * several times. The figures therefore left the comments and came here: this test
 * reads the tokens back from the file and redoes the computation, for both themes, on
 * every pair that actually carries text.
 *
 * The threshold is WCAG AA for body text, 4.5:1. The measured ratios are well above
 * it: the margin is there so that an adjustment of one or two per cent does not bring
 * the suite down.
 */

/* The file is read from the project root, and not through `import.meta.url`: the
   test environment is jsdom, where `import.meta.url` is an http URL that
   `readFileSync` refuses. An `import … ?raw` does not work either — Vitest replaces
   CSS imports with an empty string. Vitest runs from `vite.config.ts`'s directory, so
   this relative path is stable there. */
const CHEMIN = 'src/ui/theme/themes.css'
const CSS = readFileSync(CHEMIN, 'utf8')

/** The tokens of the block whose selector contains `marque`, flattened.
 *
 *  `themes.css` has neither nesting nor `@media` rules, so a "selector { body }" pair
 *  is found by the brace. A real CSS parser would be one more dependency for reading
 *  `--name: value` lines. The selector is matched by fragment, and not compared
 *  character by character: the test must not break because a comma moved line. */
function tokens(marque: string): Record<string, string> {
  const blocs = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  // **Every** block of the theme, merged, and not the first found: a theme is now
  // written in two blocks — the application chrome, then the court. Reading only the
  // first left the floor's tokens out of the test, that is unchecked while looking
  // checked.
  const correspondants = blocs.filter(([, selecteur]) => selecteur.includes(marque))
  if (correspondants.length === 0) throw new Error(`bloc introuvable dans themes.css : ${marque}`)
  const out: Record<string, string> = {}
  for (const bloc of correspondants) {
    for (const [, name, value] of bloc[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim()
  }
  return out
}

/** WCAG relative luminance of a `#rrggbb`. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`non-hex colour, out of this test's reach: ${hex}`)
  const canaux = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2]
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const AA = 4.5

/** Ink → the backgrounds it actually lands on in the application. */
const INK_PAIRS: [ink: string, grounds: string[]][] = [
  ['--c-text', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  ['--c-muted', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  ['--c-faint', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  // The accent in two roles, each measured in its own direction — that is the whole
  // point of the separation. `accent` is an **ink**: it is measured on the backgrounds
  // it writes on. `brand` is a **background**: it is measured under the ink it carries.
  // Conflating the two forced a single token to pass both tests, which pushed it to the
  // darkest end of the hue.
  // `--c-accent-bg` is the pills' background ("2 days ago", the jersey number, the
  // "you" mark): the accent ink writes there, so the pair counts as much as the other
  // semantic hues and their backgrounds.
  ['--c-accent', ['--c-card', '--c-card2', '--c-panel', '--c-accent-bg', '--c-on-accent']],
  ['--c-brand', ['--c-on-brand']],
  ['--c-green', ['--c-card', '--c-card2', '--c-green-bg']],
  ['--c-danger', ['--c-card', '--c-card2', '--c-danger-bg']],
  ['--c-amber', ['--c-card', '--c-card2', '--c-amber-bg']],
  ['--c-info', ['--c-card', '--c-card2', '--c-info-bg']],
  // The vivid fills and the ink each one carries. It is this pairing that makes the
  // palette vivid: a colour that does not have to read as small text on white no longer
  // needs darkening, and it was the darkening that made
  // l'ensemble terne.
  ['--c-on-green', ['--c-green-fill']],
  ['--c-on-danger', ['--c-danger-fill']],
  ['--c-on-gold', ['--c-gold-fill']],
  ['--c-on-info', ['--c-info-fill']],
  // The number written on the playbook's attack disc. It used to draw on `--t-ink`,
  // the paths' ink, until the light hardwood turned that dark: the number ended up
  // black on red, at 2.4:1.
  ['--t-on-attack', ['--t-attack']],
]

/** The court: the markers on the hardwood, and on the key that raises it. A court
 *  line is contextual geometry rather than a component — it has its own, lower
 *  threshold, otherwise it would have to be darkened until it competed for attention
 *  with the markers it is meant to situate. */
const COURT_PAIRS: [marker: string, threshold: number][] = [
  ['--t-ink', AA],
  ['--t-attack', AA],
  ['--t-def', AA],
  ['--t-ball', AA],
  ['--t-line', 2.5],
]

describe.each([
  ['thème clair', "data-theme='light'"],
  ['thème sombre', "data-theme='dark'"],
])('%s', (_nom, marque) => {
  const t = tokens(marque)

  it.each(INK_PAIRS)('%s reads on its backgrounds', (ink, grounds) => {
    for (const ground of grounds) {
      // Veiled backgrounds (`rgba(…)`) depend on what is beneath them: the
      // measurement is meaningless without compositing, and the dark theme uses them
      // for all its pills. We skip them rather than invent a background.
      if (!t[ground]?.startsWith('#')) continue
      expect(contrast(t[ink], t[ground]), `${ink} sur ${ground}`).toBeGreaterThanOrEqual(AA)
    }
  })

  /* Six assertions used to live here, on an `--sb-*` family belonging to the scorer's
   * table de marque, mesurée contre deux constantes `#232326` / `#1c1c20` écrites à
   * by hand in this file.
   *
   * They went with the family, and it is worth noting *why* they have no replacements
   * rather than reading a loss of coverage into it: the banner became a card of the
   * application (`--c-card`, ink `--c-text`, controls `--c-card2`, clock
   * `--c-green-fill` / `--c-danger-fill`). All those pairs are in `PAIRES` above,
   * measured for both themes.
   *
   * Two defects of those assertions are worth remembering. They measured a **literal**
   * background that was already no longer the banner's — `--scoreboard` was an
   * `oklch()`, never `#232326` — so they checked legibility on an imaginary surface.
   * And a conformity assertion was needed **on top**, because a hard-coded value can
   * have impeccable contrast while being the wrong colour: that happened, an orange
   * from the previous world had stayed there. A `var(--c-accent)` cannot drift, and so
   * no longer needs watching.
   */

  // The court now follows the theme: every marker must read on the hardwood **and**
  // on the key, which is a stronger plane. Checking one without the other would let
  // through a marker that disappears precisely in the area where most of the play is
  // drawn.
  it.each(COURT_PAIRS)('%s reads on the hardwood and on the key', (marker, threshold) => {
    // `--t-paint` counts as much as the wood: the key is painted, and the low posts
    // stand there. Checking only the hardwood let through a red attack disc on a royal
    // blue key, at 1.54:1.
    for (const ground of ['--t-court', '--t-court-hi', '--t-paint']) {
      expect(contrast(t[marker], t[ground]), `${marker} sur ${ground}`).toBeGreaterThanOrEqual(threshold)
    }
  })

  // Three levels of grey that blurred together would be one level with three names —
  // which is what made the hierarchy unreadable before.
  it('the three text levels stay distinct', () => {
    expect(contrast(t['--c-text'], t['--c-muted'])).toBeGreaterThan(1.6)
    expect(contrast(t['--c-muted'], t['--c-faint'])).toBeGreaterThan(1.05)
  })

  // The **application's** planes step: the well hollowed into a card, the
  // application's background, then the card itself. A reversed order would make
  // mentir la profondeur.
  //
  // This is a test of order, not of gap, by design. Towards black, contrast ratios
  // collapse: two near-blacks an eye separates without effort measure only 1.1:1, and
  // demanding 1.25 would force the whole dark theme to lighten into grey. What actually
  // draws a card's edge there is `--c-border`'s hairline and the drop shadow — hence
  // the check that follows.
  it('the application\'s planes step from the well up to the card', () => {
    const order = ['--c-panel', '--c-frame', '--c-card']
    const lightnesses = order.map((n) => luminance(t[n]))
    const monotone = (signe: number) => lightnesses.every((v, i) => i === 0 || signe * (v - lightnesses[i - 1]) > 0)
    expect(monotone(1) || monotone(-1), `planes in the order ${order.join(' → ')}: ${lightnesses.map((v) => v.toFixed(4)).join(', ')}`).toBe(true)
  })

  /**
   * The gutter, which does not belong to that stack: it is the desk the application
   * is laid on, visible only above `lg`.
   *
   * It used to be in the ordering test just above, held to be the lowest plane in both
   * themes. That was the requirement too many, and it demanded the impossible on dark:
   * under a frame at 0.007 lightness there is only black left, and a gutter at 0.002
   * reads exactly like one at 0.004 — black. The dark theme therefore had no gutter,
   * only a screen edge.
   *
   * The two real requirements do not depend on the theme: it must be **visible**, and
   * it must never **dominate** the card — that second point is what forbids the real
   * defect of before, a pale grey gutter (#b9bcc4) in which the application floated.
   * The direction of the gap follows the room available: under the paper on light,
   * above the frame on dark.
   */
  it('the gutter is visible without dominating the card', () => {
    const [page, frame, card] = ['--c-page', '--c-frame', '--c-card'].map((n) => luminance(t[n]))
    expect(Math.abs(page - frame), `gouttière ${page.toFixed(4)} contre cadre ${frame.toFixed(4)}`).toBeGreaterThan(0.003)
    expect(page, `gouttière ${page.toFixed(4)} contre carte ${card.toFixed(4)}`).toBeLessThan(card)
  })

  it('the border detaches the card from its background', () => {
    expect(contrast(t['--c-border'], t['--c-card']), 'border on card').toBeGreaterThan(1.08)
    expect(contrast(t['--c-card'], t['--c-card2']), 'card against card2').toBeGreaterThan(1.08)
  })
})
