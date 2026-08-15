import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Le contrôle de lisibilité de la palette.
 *
 * `themes.css` annonçait ses rapports en commentaire, ce qui ne vérifie rien : la
 * retouche suivante laisse la phrase intacte et casse la mesure. C'est arrivé
 * plusieurs fois. Les chiffres ont donc quitté les commentaires pour venir ici :
 * ce test relit les jetons dans le fichier et refait le calcul, pour les deux
 * thèmes, sur chaque paire qui porte réellement du texte.
 *
 * Le seuil est celui de WCAG AA pour du texte courant, 4,5:1. Les rapports
 * mesurés sont bien au-dessus : la marge est là pour qu'un ajustement d'un ou
 * deux pour cent ne fasse pas tomber la suite.
 */

/* Le fichier est lu depuis la racine du projet, et non via `import.meta.url` :
   l'environnement de test est jsdom, où `import.meta.url` est une URL http que
   `readFileSync` refuse. Un `import … ?raw` ne marche pas non plus — Vitest
   remplace les imports CSS par une chaîne vide. Vitest exécute depuis le
   répertoire de `vite.config.ts`, donc ce chemin relatif y est stable. */
const CHEMIN = 'src/ui/theme/themes.css'
const CSS = readFileSync(CHEMIN, 'utf8')

/** Les jetons du bloc dont le sélecteur contient `marque`, à plat.
 *
 *  `themes.css` n'a ni imbrication ni règle `@media`, donc une paire
 *  « sélecteur { corps } » se repère à la parenthèse. Une vraie analyse CSS
 *  serait une dépendance de plus pour lire des lignes `--nom: valeur`. Le
 *  sélecteur est cherché par fragment, et non comparé au caractère près : le
 *  test ne doit pas casser parce qu'une virgule a changé de ligne. */
function tokens(marque: string): Record<string, string> {
  const blocs = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  // **Tous** les blocs du thème, fusionnés, et non le premier trouvé : un thème
  // s'écrit maintenant en deux blocs — le chrome de l'application, puis le
  // terrain. Ne lire que le premier laissait les jetons du parquet hors du test,
  // c'est-à-dire non vérifiés tout en ayant l'air de l'être.
  const correspondants = blocs.filter(([, selecteur]) => selecteur.includes(marque))
  if (correspondants.length === 0) throw new Error(`bloc introuvable dans themes.css : ${marque}`)
  const out: Record<string, string> = {}
  for (const bloc of correspondants) {
    for (const [, name, value] of bloc[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim()
  }
  return out
}

/** Luminance relative WCAG d'un `#rrggbb`. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`couleur non hexadécimale, hors de portée de ce test : ${hex}`)
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

/** Encre → les fonds sur lesquels elle tombe réellement dans l'application. */
const PAIRES: [encre: string, fonds: string[]][] = [
  ['--c-text', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  ['--c-muted', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  ['--c-faint', ['--c-card', '--c-card2', '--c-panel', '--c-frame']],
  // L'orange en deux rôles, et chacun mesuré dans son propre sens — c'est toute la
  // raison d'être de la séparation. `accent` est une **encre** : on la mesure sur
  // les fonds où elle écrit. `brand` est un **fond** : on la mesure sous l'encre
  // qu'elle porte. Confondre les deux forçait un seul jeton à passer les deux
  // épreuves, ce qui le poussait au bout le plus sombre de la teinte.
  // `--c-accent-bg` est le fond des pastilles (« il y a 2 jours », le numéro de
  // maillot, la marque « vous ») : l'encre-accent y écrit, donc la paire compte
  // autant que les autres teintes sémantiques et leur fond.
  ['--c-accent', ['--c-card', '--c-card2', '--c-panel', '--c-accent-bg', '--c-on-accent']],
  ['--c-brand', ['--c-on-brand']],
  ['--c-green', ['--c-card', '--c-card2', '--c-green-bg']],
  ['--c-danger', ['--c-card', '--c-card2', '--c-danger-bg']],
  ['--c-amber', ['--c-card', '--c-card2', '--c-amber-bg']],
  ['--c-info', ['--c-card', '--c-card2', '--c-info-bg']],
  // Les remplissages vifs et l'encre que chacun porte. C'est ce couple qui rend la
  // palette vive : une couleur qui n'a pas à se lire comme petit texte sur du blanc
  // n'a plus besoin d'être assombrie, et c'est l'assombrissement qui rendait
  // l'ensemble terne.
  ['--c-on-green', ['--c-green-fill']],
  ['--c-on-danger', ['--c-danger-fill']],
  ['--c-on-gold', ['--c-gold-fill']],
  ['--c-on-info', ['--c-info-fill']],
  // Le numéro écrit sur le disque d'attaque du tableau tactique. Il tirait sur
  // `--t-ink`, l'encre des trajets, jusqu'à ce que le parquet clair fasse virer
  // celle-ci au sombre : le numéro s'est retrouvé en noir sur rouge, à 2,4:1.
  ['--t-on-attack', ['--t-attack']],
]

/** Le terrain : les repères sur le parquet, et sur la raquette qui le rehausse.
 *  La ligne de terrain est de la géométrie de contexte et non un composant — elle
 *  a son propre seuil, plus bas, sinon il faudrait la foncer jusqu'à ce qu'elle
 *  dispute l'attention aux repères qu'elle est censée situer. */
const TERRAIN: [repere: string, seuil: number][] = [
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

  it.each(PAIRES)('%s se lit sur ses fonds', (encre, fonds) => {
    for (const fond of fonds) {
      // Les fonds voilés (`rgba(…)`) dépendent de ce qu'il y a dessous : la
      // mesure n'a pas de sens sans composition, et le thème sombre les emploie
      // pour toutes ses pastilles. On les saute plutôt que d'inventer un fond.
      if (!t[fond]?.startsWith('#')) continue
      expect(contrast(t[encre], t[fond]), `${encre} sur ${fond}`).toBeGreaterThanOrEqual(AA)
    }
  })

  /* Ici vivaient six assertions sur une famille `--sb-*` propre au bandeau de la
   * table de marque, mesurée contre deux constantes `#232326` / `#1c1c20` écrites à
   * la main dans ce fichier.
   *
   * Elles ont disparu avec la famille, et il faut noter *pourquoi* elles n'ont pas
   * de remplaçantes plutôt que de croire à une perte de couverture : le bandeau est
   * devenu une carte de l'application (`--c-card`, encre `--c-text`, commandes
   * `--c-card2`, chrono `--c-green-fill` / `--c-danger-fill`). Toutes ces paires
   * sont dans `PAIRES` ci-dessus, mesurées pour les deux thèmes.
   *
   * Deux défauts de ces assertions valent d'être retenus. Elles mesuraient un fond
   * **littéral** qui n'était déjà plus celui du bandeau — `--scoreboard` valait un
   * `oklch()`, jamais `#232326` — donc elles vérifiaient une lisibilité sur une
   * surface imaginaire. Et il fallait une assertion de conformité **en plus**, parce
   * qu'une valeur en dur peut avoir un contraste irréprochable tout en étant de la
   * mauvaise couleur : c'est arrivé, un orange du monde précédent était resté là. Un
   * `var(--c-accent)` ne peut pas dériver, et n'a donc plus besoin d'être surveillé.
   */

  // Le terrain suit maintenant le thème : chaque repère doit se lire sur le parquet
  // **et** sur la raquette, qui est un plan plus soutenu. Vérifier l'un sans l'autre
  // laisserait passer un repère qui disparaît précisément dans la zone où l'essentiel
  // du jeu se dessine.
  it.each(TERRAIN)('%s se lit sur le parquet et sur la raquette', (repere, seuil) => {
    // `--t-paint` compte autant que le bois : la raquette est peinte, et les
    // postes bas y stationnent. Ne vérifier que le parquet a laissé passer un
    // disque d'attaque rouge sur une raquette bleu roi, à 1,54:1.
    for (const fond of ['--t-court', '--t-court-hi', '--t-paint']) {
      expect(contrast(t[repere], t[fond]), `${repere} sur ${fond}`).toBeGreaterThanOrEqual(seuil)
    }
  })

  // Trois niveaux de gris qui se confondraient ne seraient qu'un seul niveau
  // avec trois noms — c'est ce qui rendait la hiérarchie illisible avant.
  it('the three text levels stay distinct', () => {
    expect(contrast(t['--c-text'], t['--c-muted'])).toBeGreaterThan(1.6)
    expect(contrast(t['--c-muted'], t['--c-faint'])).toBeGreaterThan(1.05)
  })

  // Les plans **de l'application** s'échelonnent : le puits creusé dans une carte,
  // le fond de l'application, puis la carte elle-même. Un ordre inversé ferait
  // mentir la profondeur.
  //
  // C'est un test d'ordre, et pas d'écart, à dessein. Vers le noir, les rapports
  // de contraste s'écrasent : deux presque-noirs qu'un œil sépare sans peine ne
  // mesurent que 1,1:1, et exiger 1,25 forcerait tout le thème sombre à s'éclaircir
  // en gris. Ce qui dessine réellement le bord d'une carte là-bas, c'est le filet
  // de `--c-border` et l'ombre portée — d'où la vérification qui suit.
  it('the application\'s planes step from the well up to the card', () => {
    const ordre = ['--c-panel', '--c-frame', '--c-card']
    const clarites = ordre.map((n) => luminance(t[n]))
    const monotone = (signe: number) => clarites.every((v, i) => i === 0 || signe * (v - clarites[i - 1]) > 0)
    expect(monotone(1) || monotone(-1), `plans dans l’ordre ${ordre.join(' → ')} : ${clarites.map((v) => v.toFixed(4)).join(', ')}`).toBe(true)
  })

  /**
   * La gouttière, qui n'appartient pas à cette pile : c'est le bureau sur lequel
   * l'application est posée, visible seulement au-delà de `lg`.
   *
   * Elle était dans le test d'ordre juste au-dessus, tenue pour le plan le plus bas
   * dans les deux thèmes. C'était l'exigence de trop, et elle demandait l'impossible
   * en sombre : sous un cadre à 0,007 de clarté, il ne reste que du noir, et une
   * gouttière à 0,002 comme à 0,004 se lit exactement pareil — noir. Le thème sombre
   * n'avait donc pas de gouttière, seulement un bord d'écran.
   *
   * Les deux vraies exigences, elles, ne dépendent pas du thème : elle doit se
   * **voir**, et elle ne doit jamais **dominer** la carte — c'est ce second point qui
   * interdit le vrai défaut d'avant, une gouttière gris pâle (#b9bcc4) dans laquelle
   * l'application flottait. Le sens de l'écart, lui, suit la place disponible : sous
   * le papier en clair, au-dessus du cadre en sombre.
   */
  it('the gutter is visible without dominating the card', () => {
    const [page, frame, card] = ['--c-page', '--c-frame', '--c-card'].map((n) => luminance(t[n]))
    expect(Math.abs(page - frame), `gouttière ${page.toFixed(4)} contre cadre ${frame.toFixed(4)}`).toBeGreaterThan(0.003)
    expect(page, `gouttière ${page.toFixed(4)} contre carte ${card.toFixed(4)}`).toBeLessThan(card)
  })

  it('the border detaches the card from its background', () => {
    expect(contrast(t['--c-border'], t['--c-card']), 'bordure sur carte').toBeGreaterThan(1.08)
    expect(contrast(t['--c-card'], t['--c-card2']), 'carte contre carte2').toBeGreaterThan(1.08)
  })
})
