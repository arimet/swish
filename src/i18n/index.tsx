import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fr } from './fr'
import { en } from './en'

/**
 * Les deux langues de l'application.
 *
 * Le **français est la langue du produit** et le restera : les utilisateurs sont un
 * club français, tout le vocabulaire est celui de la FFBB, et l'anglais n'est pas une
 * traduction « par défaut » qu'on aurait négligé de faire. Il s'ajoute pour que
 * d'autres équipes puissent forker le projet et s'en servir — c'est l'objectif que le
 * README annonce, et il serait creux si l'interface restait unilingue.
 *
 * Conséquence directe sur le repli : une clef absente de l'anglais retombe sur le
 * **français**, jamais sur la clef elle-même. Un écran à moitié traduit reste un écran
 * qu'on peut utiliser ; un écran semé de `dashboard.emptyTitle` ne l'est pas.
 */
export type Langue = 'fr' | 'en'

export const LANGS: { code: Langue; nom: string }[] = [
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
]

const CATALOGS: Record<Langue, Record<string, string>> = { fr, en }

/** Mémorisée sur l'appareil, comme le thème — et pour la même raison : on ne
 *  redemande pas sa langue à quelqu'un à chaque ouverture. */
export const LANG_KEY = 'swish-lang'

const isLang = (v: string | null): v is Langue => v === 'fr' || v === 'en'

/**
 * La langue au premier rendu : le choix mémorisé, sinon le **français**.
 *
 * La langue du navigateur n'est délibérément pas consultée, alors que c'est l'usage.
 * Le français est la langue du produit et non une localisation parmi d'autres ; suivre
 * `navigator.language` ferait ouvrir Swish en anglais au club auquel il est destiné,
 * dès que le portable de la table de marque est réglé en anglais — ce qui arrive.
 * L'anglais existe pour qui le demande, et le sélecteur est dans l'en-tête de chaque
 * écran. C'est le même raisonnement que le thème, qui ignore `prefers-color-scheme`
 * pour la même raison : une identité de produit n'est pas une préférence système.
 */
export function initialLang(): Langue {
  const stockee = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY)
  return isLang(stockee) ? stockee : 'fr'
}

/**
 * La langue courante, lisible hors de React.
 *
 * Les formateurs de date (`fmtDate` du kit, la barre de mois du calendrier) sont des
 * fonctions ordinaires appelées dans huit fichiers, souvent depuis des sous-composants
 * qui n'ont pas de crochet. Leur faire remonter la langue en paramètre demanderait
 * d'ajouter `useLangue()` à une dizaine d'endroits pour une valeur qui est, elle,
 * franchement globale — c'est la même pour tout l'écran, toujours.
 *
 * Le champ est écrit **avant** le `setState` du sélecteur : au moment où React refait
 * le rendu, il porte déjà la nouvelle langue, et ce rendu traverse tout l'arbre puisque
 * le fournisseur est à la racine. Aucun écran ne peut donc afficher une date dans la
 * langue précédente.
 */
let current: Langue = 'fr'
export const currentLang = (): Langue => current

/**
 * Remplace les paramètres `{nom}` d'un modèle.
 *
 * Le pluriel passe par deux clefs suffixées `_un` / `_autre` plutôt que par une
 * bibliothèque : les deux langues du projet partagent la même règle simple (un contre
 * le reste), et zéro y suit le pluriel dans les deux cas — « 0 joueur » est un cas
 * français à part, traité par le catalogue quand il compte, pas par une règle générale.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (tout, key) => {
    const v = params[key]
    return v === undefined ? tout : String(v)
  })
}

export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Fabrique la fonction de traduction d'une langue. Exportée à part pour les rares
 *  appelants hors composant (messages de règle du domaine, tests). */
export function translator(lang: Langue): Translate {
  const catalog = CATALOGS[lang] ?? fr
  return (key, params) => {
    const count = params?.count
    if (typeof count === 'number') {
      // Zéro n'accorde pas pareil dans les deux langues : le français le met au
      // singulier (« 0 joueur »), l'anglais au pluriel (« 0 players »). C'est la seule
      // divergence entre leurs règles, et elle se voit — un effectif vide et une
      // rencontre sans convoqué s'affichent tous les deux à zéro.
      const suffix = count === 1 || (lang === 'fr' && count === 0) ? '_un' : '_autre'
      const template = catalog[key + suffix] ?? fr[key + suffix]
      if (template) return interpolate(template, params)
    }
    // Repli sur le français, jamais sur la clef : voir l'en-tête du fichier.
    return interpolate(catalog[key] ?? fr[key] ?? key, params)
  }
}

interface Ctx {
  lang: Langue
  setLang: (l: Langue) => void
  t: Translate
}

/* La valeur par défaut n'est pas `null`, contrairement au contexte d'authentification
   qui, lui, lève hors de son fournisseur. La différence est délibérée : « quel est mon
   rôle » n'a pas de réponse sensée hors contexte, alors que « dans quelle langue » en a
   toujours une. Un composant rendu sans fournisseur — c'est le cas de la cinquantaine
   de fichiers de test qui montent un écran isolé — parle donc français au lieu de
   planter. */
const Ctx = createContext<Ctx>({ lang: 'fr', setLang: () => {}, t: translator('fr') })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Langue>(() => (current = initialLang()))

  // L'attribut `lang` du document suit le choix. Ce n'est pas décoratif : il décide de
  // la césure, des guillemets, de la voix d'un lecteur d'écran et de la traduction
  // automatique proposée par le navigateur. Le document naissait en `lang="en"` alors
  // que tout son contenu était français.
  useEffect(() => {
    document.documentElement.lang = lang
    // Le titre de l'onglet suit aussi : `index.html` ne peut en porter qu'un seul, et
    // il resterait français dans une application passée à l'anglais.
    document.title = translator(lang)('app.titre')
  }, [lang])

  const setLang = useCallback((l: Langue) => {
    localStorage.setItem(LANG_KEY, l)
    current = l
    setLangState(l)
  }, [])

  const valeur = useMemo(() => ({ lang, setLang, t: translator(lang) }), [lang, setLang])
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

/**
 * La fonction de traduction du composant courant.
 *
 * Par convention on l'affecte à `trad` et non à `t`, alors que `t` est l'usage dans
 * l'écosystème. La raison est concrète : `t` est déjà pris une quinzaine de fois dans
 * ce dépôt comme nom de paramètre — `teams.map((t) => …)`, `trainings.filter((t) => …)`,
 * `const t = teamTotals(match).team`. TypeScript signale bien la collision, mais la
 * signaler quinze fois pour un caractère gagné est un mauvais échange.
 */
export function useT(): Translate {
  return useContext(Ctx).t
}

/** La langue courante et de quoi en changer — pour le sélecteur, et lui seul. */
export function useLang() {
  const { lang, setLang } = useContext(Ctx)
  return { lang, setLang }
}
