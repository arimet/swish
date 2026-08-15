import { useEffect, useState } from 'react'
import { CloudOff, TriangleAlert } from 'lucide-react'
import { remoteEnabled, surSante, type Sante } from '../../persistence/remote'
import { useT } from '../../i18n'
import { C } from '../olive/kit'

/**
 * Ce que le partage est en train de faire, quand il ne le fait pas.
 *
 * Le défaut qu'il répare : un envoi qui échoue était avalé en silence. Un
 * marqueur pouvait croire des spectateurs en train de suivre une rencontre qui
 * ne leur parvenait plus, et un coach croire son effectif partagé.
 *
 * TROIS CHOIX QUI COMPTENT PLUS QUE LE PICTOGRAMME.
 *
 * **Ce n'est pas une alerte.** Rien n'est perdu quand un envoi échoue : la saisie
 * est en base locale et la file repartira seule. Annoncer un incident ferait
 * paniquer un bénévole en plein match pour un problème qui n'en est pas un — et
 * mentir, accessoirement. Le texte dit donc d'abord que la saisie est gardée.
 *
 * **Ce n'est pas un toast.** Un toast s'efface ; la condition, elle, dure. Un
 * gymnase sans réseau, c'est deux heures. On montre un état tant qu'il est vrai,
 * et il disparaît de lui-même quand la file se vide.
 *
 * **Le compte est la mesure honnête.** « En attente » ne dit pas si ça avance ;
 * un nombre qui grossit, si. C'est aussi ce qui distingue un accroc d'une panne.
 *
 * Rien ne s'affiche tant que tout va bien : sur cet écran, le silence est une
 * information, et une pastille verte permanente n'en serait pas une.
 */
export function EtatSynchro({ compact = false }: { compact?: boolean }) {
  const trad = useT()
  const [sante, setSante] = useState<Sante>({ etat: 'inactif', enAttente: 0 })

  useEffect(() => (remoteEnabled() ? surSante(setSante) : undefined), [])

  // Une file non vide juste après un geste est l'état NORMAL : elle se vide sous
  // la seconde. Sans la condition sur l'état, la pastille clignoterait à chaque
  // panier — au milieu de l'écran qu'on regarde le moins longtemps.
  if (!remoteEnabled() || sante.enAttente === 0 || sante.etat === 'ok' || sante.etat === 'inactif') return null

  const bloque = sante.etat === 'jeton'
  const Icone = bloque ? TriangleAlert : CloudOff
  // Le jeton ne se réparera pas tout seul, le réseau si : deux couleurs, deux
  // durées de vie. L'ambre dit « ça attend », le danger dit « ça demande un geste ».
  const teinte = bloque ? { fond: C.dangerBg, encre: C.danger } : { fond: C.amberBg, encre: C.amber }

  return (
    <span
      role="status"
      title={trad(bloque ? 'sync.refuseDetail' : 'sync.horsReseauDetail')}
      aria-label={`${trad('sync.compte', { count: sante.enAttente })} — ${trad(bloque ? 'sync.refuseDetail' : 'sync.horsReseauDetail')}`}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
      style={{ background: teinte.fond, color: teinte.encre }}
    >
      <Icone className="h-[14px] w-[14px] shrink-0" strokeWidth={2.2} />
      {/* Le compte seul quand la place manque — c'est lui qui porte l'information,
          le libellé ne fait que la nommer. Le nom accessible reste entier. */}
      <span className="nums">{sante.enAttente}</span>
      {!compact && <span>{trad(bloque ? 'sync.refuse' : 'sync.horsReseau')}</span>}
    </span>
  )
}
