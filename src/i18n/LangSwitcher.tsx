import { LANGUES, useLangue, useT } from './index'

/**
 * Le sélecteur de langue, jumeau du sélecteur de thème et posé à côté de lui.
 *
 * Deux langues seulement, donc une **bascule** et non une liste déroulante : un menu
 * pour choisir entre deux valeurs demande deux gestes là où un seul suffit. Le bouton
 * affiche le code de la langue **courante** — c'est ce que fait un onglet de langue
 * partout ailleurs, et c'est ce qu'on cherche du regard pour savoir où l'on est. Son
 * nom accessible, lui, annonce la langue vers laquelle il mène, sinon un lecteur
 * d'écran annoncerait l'état sans dire ce que le bouton fait.
 *
 * Le libellé reste en capitales à deux lettres pour tenir dans le même rond de 36 px
 * que le thème : un drapeau aurait été plus court encore, mais un drapeau désigne un
 * pays et non une langue — et ni le français ni l'anglais n'en ont qu'un.
 */
export function LangSwitcher() {
  const { langue, setLangue } = useLangue()
  const t = useT()
  const suivante = LANGUES[(LANGUES.findIndex((l) => l.code === langue) + 1) % LANGUES.length]
  return (
    <button
      onClick={() => setLangue(suivante.code)}
      aria-label={`${t('langue.changer')} — ${suivante.nom}`}
      title={suivante.nom}
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-[12px] font-black uppercase tracking-tight text-foreground transition hover:bg-muted active:scale-95"
    >
      {langue}
    </button>
  )
}
