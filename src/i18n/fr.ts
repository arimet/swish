/**
 * Le catalogue français — la langue de référence du produit.
 *
 * C'est lui qui fait foi : l'anglais y retombe quand une clef lui manque, jamais
 * l'inverse. Les apostrophes sont typographiques (’) comme partout ailleurs dans
 * l'interface.
 *
 * Les clefs sont préfixées par l'écran ou le composant qui les emploie, sauf
 * `commun.*` — les mots qu'on retrouve sur cinq écrans (annuler, supprimer,
 * enregistrer) et qui doivent rester identiques d'un écran à l'autre. Une même action
 * nommée de deux façons dans la même application est un défaut, pas une nuance.
 */
export const fr: Record<string, string> = {
  // ── Vocabulaire commun ────────────────────────────────────────────────────
  'app.titre': 'Swish — Le hub de votre équipe de basket',

  'commun.annuler': 'Annuler',
  'commun.confirmer': 'Confirmer',
  'commun.supprimer': 'Supprimer',
  'commun.retirer': 'Retirer',
  'commun.modifier': 'modifier',
  'commun.fermer': 'fermer',
  'commun.enregistrer': 'Enregistrer',
  'commun.chargement': 'Chargement…',
  'commun.joueur_un': '{count} joueur',
  'commun.joueur_autre': '{count} joueurs',
  'commun.rencontre_un': '{count} rencontre',
  'commun.rencontre_autre': '{count} rencontres',

  // ── Coquille et navigation ────────────────────────────────────────────────
  'nav.monClub': 'Mon club',
  'nav.tableauDeBord': 'Tableau de bord',
  'nav.monEquipe': 'Mon équipe',
  'nav.calendrier': 'Calendrier',
  'nav.championnat': 'Championnat',
  'nav.equipes': 'Équipes',
  'nav.schemas': 'Schémas',
  'nav.administration': 'Administration',
  'nav.nouvelleRencontre': 'Nouvelle rencontre',
  'nav.rencontre': 'Rencontre',
  'nav.rencontres': 'Rencontres',
  'nav.credit': 'Fait par Anthony Rimet ↗',

  // ── Accès et identité ─────────────────────────────────────────────────────
  'acces.titre': 'Accès',
  'acces.enCours': 'Accès en cours : {role}',
  'acces.codePlaceholder': 'Code',
  'acces.codeLabel': 'Code d’accès',
  'acces.deverrouiller': 'Déverrouiller',
  'acces.seVerrouiller': 'Se verrouiller',
  'acces.identifieComme': 'Identifié comme {nom}.',
  'acces.aucuneIdentite': 'Aucun joueur identifié sur cet appareil.',
  'acces.quiEtesVous': 'Qui êtes-vous dans l’effectif ?',
  'acces.effectifVide': 'Aucun joueur dans l’effectif.',
  'acces.nePlusMIdentifier': 'Ne plus m’identifier',
  'acces.codeInconnu': 'Code inconnu.',
  'acces.requis': 'Accès {role} requis',
  'acces.necessiteCode': 'Cette action nécessite ce code d’accès.',
  'acces.codeIncorrect': 'Code {role} requis.',
  'role.visiteur': 'Visiteur',
  'role.marque': 'Table de marque',
  'role.admin': 'Administrateur',

  // ── Langue ────────────────────────────────────────────────────────────────
  'langue.titre': 'Langue',
  'langue.changer': 'Changer de langue',
}
