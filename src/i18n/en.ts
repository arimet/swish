/**
 * The English catalogue — an addition, not the reference.
 *
 * French is the product's language and stays the default; English exists so that other
 * clubs can fork Swish and use it. Any key missing here falls back to French rather
 * than to the key itself: a half-translated screen is still usable, a screen strewn
 * with `dashboard.emptyTitle` is not.
 *
 * Basketball vocabulary follows FIBA usage, which is what the FFBB rules this app
 * implements are derived from — "scorer's table", "team foul", "bonus", "call-up".
 * Where French uses a federation term with no English equivalent (`e-marque`), the
 * term is kept and explained rather than invented.
 */
export const en: Record<string, string> = {
  // ── Shared vocabulary ─────────────────────────────────────────────────────
  'app.titre': 'Swish — Your team’s basketball hub',

  'commun.annuler': 'Cancel',
  'commun.confirmer': 'Confirm',
  'commun.supprimer': 'Delete',
  'commun.retirer': 'Remove',
  'commun.modifier': 'edit',
  'commun.fermer': 'close',
  'commun.enregistrer': 'Save',
  'commun.chargement': 'Loading…',
  'commun.joueur_un': '{count} player',
  'commun.joueur_autre': '{count} players',
  'commun.rencontre_un': '{count} game',
  'commun.rencontre_autre': '{count} games',

  // ── Shell and navigation ──────────────────────────────────────────────────
  'nav.monClub': 'My club',
  'nav.tableauDeBord': 'Dashboard',
  'nav.monEquipe': 'My team',
  'nav.calendrier': 'Schedule',
  'nav.championnat': 'League',
  'nav.equipes': 'Teams',
  'nav.schemas': 'Plays',
  'nav.administration': 'Administration',
  'nav.nouvelleRencontre': 'New game',
  'nav.rencontre': 'Game',
  'nav.rencontres': 'Games',
  'nav.credit': 'Made by Anthony Rimet ↗',

  // ── Access and identity ───────────────────────────────────────────────────
  'acces.titre': 'Access',
  'acces.enCours': 'Current access: {role}',
  'acces.codePlaceholder': 'Code',
  'acces.codeLabel': 'Access code',
  'acces.deverrouiller': 'Unlock',
  'acces.seVerrouiller': 'Lock',
  'acces.identifieComme': 'Identified as {nom}.',
  'acces.aucuneIdentite': 'No player identified on this device.',
  'acces.quiEtesVous': 'Who are you on the roster?',
  'acces.effectifVide': 'No players on the roster.',
  'acces.nePlusMIdentifier': 'Forget my identity',
  'acces.codeInconnu': 'Unknown code.',
  'acces.requis': '{role} access required',
  'acces.necessiteCode': 'This action requires that access code.',
  'acces.codeIncorrect': '{role} code required.',
  'role.visiteur': 'Visitor',
  'role.marque': 'Scorer’s table',
  'role.admin': 'Administrator',

  // ── Language ──────────────────────────────────────────────────────────────
  'langue.titre': 'Language',
  'langue.changer': 'Change language',
}
