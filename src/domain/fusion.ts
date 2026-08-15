/* L'extension `.js` détonne dans `src`, où le reste du domaine importe sans elle.
   Elle est nécessaire : ce fichier est le seul de `src` qu'`api/mutate` importe, il
   appartient donc aussi au projet `tsconfig.api`, dont la résolution `nodenext`
   l'exige. La résolution du navigateur l'accepte, l'inverse n'est pas vrai. */
import type { GameEvent, Match } from './types.js'

/**
 * Fusionne deux versions d'une feuille de match.
 *
 * Le cas : le coach corrige une faute depuis le banc pendant que le marqueur
 * saisit un panier. Deux appareils écrivent la même rencontre, et le dernier à
 * pousser ne doit pas effacer l'autre. C'est le seul document du produit où
 * « la modification la plus récente gagne » ne suffit pas, parce que le perdant
 * n'a pas tort — il a simplement noté autre chose.
 *
 * Ce n'est possible sans rien inventer que parce que le domaine s'y prêtait
 * déjà : chaque évènement porte un identifiant stable et une heure murale.
 *
 * Appelée **côté serveur**, dans `api/mutate`. Elle est pure et vit ici, avec le
 * reste du domaine, pour qu'on puisse la tester sans base ni réseau.
 */
export function mergeMatches(stored: Match, incoming: Match): Match {
  // Les ratures des deux côtés : une annulation faite sur un appareil vaut pour
  // l'autre, sinon l'union ressusciterait ce qu'il vient de retirer.
  const retracted = [...new Set([...(stored.retracted ?? []), ...(incoming.retracted ?? [])])]
  const struck = new Set(retracted)

  const byId = new Map<string, GameEvent>()
  for (const e of [...stored.events, ...incoming.events]) if (!struck.has(e.id)) byId.set(e.id, e)

  // Le départage se fait sur l'identifiant et non sur l'ordre d'arrivée : les deux
  // appareils doivent aboutir au même journal, quel que soit l'ordre où le serveur
  // les reçoit. Sans ça, la fusion ne serait pas commutative et deux miroirs
  // divergeraient en affichant chacun un journal « correct ».
  const events = [...byId.values()].sort((a, b) => a.wallClock - b.wallClock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    // `meta` et `roster` ne s'ajoutent pas, ils se remplacent : c'est l'écriture
    // la plus récente qui les porte, et `api/mutate` n'appelle cette fonction que
    // pour une écriture qui a déjà gagné l'arbitrage sur `modified_at`.
    ...incoming,
    events,
    ...(retracted.length ? { retracted } : {}),
    status: furthest(stored.status, incoming.status),
  }
}

const RANK = { setup: 0, live: 1, finished: 2 } as const

/**
 * Le statut ne recule jamais.
 *
 * Un appareil resté hors ligne une heure vide sa file avec un `status: 'live'`
 * périmé : il ne doit pas dé-terminer une rencontre close entre-temps. C'est le
 * seul champ où un écrasement retardataire serait à la fois visible et faux —
 * une feuille de match rouverte donne à croire qu'on peut encore la corriger.
 */
export function furthest(a: Match['status'], b: Match['status']): Match['status'] {
  return RANK[a] >= RANK[b] ? a : b
}
