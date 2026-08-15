import type { Table } from 'dexie'
import { db, type OutboxItem } from './db'

/**
 * Le miroir local et son tampon d'écriture.
 *
 * **La base serveur est la source de vérité**, IndexedDB en est le reflet. Ce
 * n'est pas une seconde vérité : c'est le prix du gymnase. La table de marque
 * écrit à chaque geste — plusieurs centaines de fois sur deux heures — et sans
 * base locale, ces écritures seraient soit un aller-retour réseau par tap, qui
 * s'arrête net sans couverture, soit un tampon en mémoire, qui meurt quand le
 * téléphone se verrouille.
 *
 * Activé uniquement si `VITE_SYNC_URL` est défini — sinon l'application reste
 * 100 % locale : aucune écriture dans la file, aucun appel réseau.
 */
const BASE = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/+$/, '') || ''
export const remoteEnabled = (): boolean => BASE !== ''

/** Le curseur d'hydratation : le plus grand numéro d'écriture déjà vu. */
const REV_KEY = 'swish-sync-rev'
/**
 * Le jeton d'écriture, saisi une fois par appareil.
 *
 * Il n'est pas dans le bundle, contrairement aux trois codes d'accès : ceux-là
 * gardent une porte que le client s'ouvre lui-même, celui-ci est vérifié par le
 * serveur. Il vit dans `localStorage` et non dans `sessionStorage`, comme
 * l'identité de joueur : c'est un réglage d'appareil, pas une session.
 */
export const TOKEN_KEY = 'swish-sync-token'

export const token = (): string => localStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (v: string) => {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
}

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-swish-token': token(),
})

type Kind = OutboxItem['kind']

interface RemoteState {
  rev: number
  docs: { kind: Kind; id: string; doc: unknown }[]
  /** Les `kind:id` que la base détient **encore**. */
  alive: string[]
}

/** Ce que la dernière tentative de synchronisation a donné. L'interface s'en sert
 *  pour dire à l'administrateur si son jeton passe, plutôt que d'échouer en
 *  silence comme le faisait la version Redis. */
export type State = 'idle' | 'ok' | 'token' | 'network'
let lastState: State = 'idle'
export const syncState = (): State => lastState

/** Ce qu'un écran a besoin de savoir : où en est l'envoi, et combien d'actions
 *  attendent encore. Le compte est la mesure honnête — il grossit si ça coince. */
export interface Health { state: State; pending: number }

/* On prévient plutôt que de faire interroger. Un sondage sur la table Dexie
   marcherait, mais `doFlush` sait exactement quand l'état change : le faire dire
   coûte moins et ne fabrique pas de latence entre l'échec et son affichage. */
const listeners = new Set<(s: Health) => void>()

/** S'abonne à la santé de la synchronisation. Renvoie de quoi se désabonner. */
export function onHealth(f: (s: Health) => void): () => void {
  listeners.add(f)
  void notify()
  return () => { listeners.delete(f) }
}

async function notify(): Promise<void> {
  if (!listeners.size) return
  const pending = await db.outbox.count()
  for (const f of listeners) f({ state: lastState, pending })
}

async function readState(): Promise<RemoteState | null> {
  if (!BASE) return null
  const since = Number(localStorage.getItem(REV_KEY)) || 0
  try {
    const r = await fetch(`${BASE}/state?since=${since}`, { headers: headers() })
    if (r.status === 401 || r.status === 503) { lastState = 'token'; return null }
    if (!r.ok) { lastState = 'network'; return null }
    lastState = 'ok'
    return (await r.json()) as RemoteState
  } catch { lastState = 'network'; return null }
}

/* Le genre d'un document dit dans quelle table du miroir il se range. La clef
   primaire n'est pas toujours `id` : un message est rangé sous son club, une
   convocation sous sa rencontre. Le balayage ci-dessous lit les clefs primaires
   de chaque table, il suit donc ces choix sans avoir à les connaître. */
const TABLES = {
  team: db.teams, player: db.players, match: db.matches,
  result: db.results, convocation: db.convocations, training: db.trainings,
  play: db.plays, message: db.messages,
} as const

/**
 * Aligne le miroir local sur la source de vérité.
 *
 * Deux moitiés, et c'est la seconde qu'on oublie. `docs` porte ce qui a changé.
 * `vivants` dit ce que la base détient encore : tout ce qui n'y figure pas est
 * supprimé en local. C'est ainsi qu'une suppression se propage, puisqu'elle
 * supprime vraiment la ligne côté serveur et ne laisse aucune trace à
 * transporter.
 *
 * **Une hydratation gagne, y compris quand elle est vide.** Le serveur fait foi
 * sans exception — c'est la propriété que ce chantier existe pour établir, et
 * une régression compatissante aurait envie de la casser.
 *
 * Une seule réserve, et ce n'en est pas une : ce qui attend dans la file n'est
 * pas effacé. Ce n'est pas du périmé que le serveur ignorerait, c'est une
 * écriture que la personne vient de faire et qui n'est pas encore partie.
 */
export async function hydrate(): Promise<boolean> {
  const s = await readState()
  if (!s) return false

  const pending = new Set((await db.outbox.toArray()).map((o) => `${o.kind}:${o.id}`))
  const alive = new Set(s.alive)

  // Les huit tables, et pas seulement celles que `docs` touche : le balayage des
  // morts lit les clefs primaires de chacune. Dexie les veut dans un tableau
  // au-delà de cinq.
  await db.transaction('rw', Object.values(TABLES), async () => {
    // Le document vient du serveur tel qu'il y a été rangé. Le transtypage assume
    // ce que TypeScript ne peut pas vérifier ici : chaque genre a sa table, et
    // `GENRES` côté serveur refuse tout ce qui n'en est pas un.
    for (const d of s.docs) await (TABLES[d.kind] as Table<unknown, string> | undefined)?.put(d.doc)
    for (const [kind, table] of Object.entries(TABLES) as [Kind, (typeof TABLES)[Kind]][]) {
      const ids = (await table.toCollection().primaryKeys()) as string[]
      const dead = ids.filter((id) => !alive.has(`${kind}:${id}`) && !pending.has(`${kind}:${id}`))
      if (dead.length) await table.bulkDelete(dead)
    }
  })

  localStorage.setItem(REV_KEY, String(s.rev))
  return true
}

/** Rafraîchit depuis le serveur (à appeler à l'ouverture des pages de listes). */
export async function refresh(): Promise<void> { if (BASE) await hydrate() }

// --- File d'attente sortante ---

async function enqueue(op: Omit<OutboxItem, 'ts' | 'seq' | 'modifiedAt'>): Promise<void> {
  if (!BASE) return // mode local : rien à synchroniser
  // L'horodatage est posé ICI, au moment du geste, et pas à l'arrivée sur le
  // serveur. C'est ce qui fait gagner la modification la plus récente et non la
  // plus récemment reçue : une file bloquée deux heures par un gymnase sans
  // réseau n'écrase pas une correction faite entre-temps sur un autre appareil.
  await db.outbox.add({ ...op, ts: Date.now(), modifiedAt: new Date().toISOString() })
  void notify()
  flush()
}
export const enqueuePut = (kind: Kind, id: string, doc: unknown) => enqueue({ kind, op: 'put', id, doc })
export const enqueueDel = (kind: Kind, id: string) => enqueue({ kind, op: 'del', id })

let flushing = false
let timer: ReturnType<typeof setTimeout> | undefined

/** Vide la file vers le serveur (dédupliquée par entité). Débounce par défaut. */
export function flush(delay = 700): void {
  if (!BASE) return
  clearTimeout(timer)
  timer = setTimeout(() => { void doFlush() }, delay)
}

async function doFlush(): Promise<void> {
  if (!BASE || flushing) return
  flushing = true
  try {
    const items = await db.outbox.orderBy('seq').toArray()
    if (items.length) {
      // Déduplication : on ne garde que la dernière opération par (kind:id).
      const byKey = new Map<string, OutboxItem>()
      for (const it of items) byKey.set(`${it.kind}:${it.id}`, it)
      const ops = [...byKey.values()].map((it) => ({
        kind: it.kind, op: it.op, id: it.id, modifiedAt: it.modifiedAt,
        ...(it.op === 'put' ? { doc: it.doc } : {}),
      }))
      const body = JSON.stringify({ ops })
      /*
       * `keepalive` laisse l'envoi survivre à la fermeture de l'onglet — précieux
       * quand quelqu'un quitte l'application juste après une saisie. Mais le
       * navigateur le **plafonne à 64 Ko**, et au-delà `fetch` échoue sèchement,
       * sans jamais atteindre le réseau.
       *
       * Ce n'est pas théorique : une seule rencontre pèse des dizaines de
       * kilooctets une fois son journal d'évènements sérialisé, et un premier
       * envoi qui rattrape une saison en dépasse largement le seuil. L'échec
       * tombait dans le `catch` avec les pannes de réseau, donc la file
       * réessayait indéfiniment un envoi qui ne pouvait pas aboutir.
       *
       * Au-delà du seuil on envoie donc sans `keepalive` : un gros lot perdu à la
       * fermeture reste dans la file et repart au démarrage suivant, ce qui est
       * infiniment préférable à un lot qui ne part jamais.
       */
      const r = await fetch(`${BASE}/mutate`, {
        method: 'POST', headers: headers(), body,
        keepalive: new Blob([body]).size < 60_000,
      })
      // Un jeton refusé n'est pas un incident de réseau : réessayer ne servira à
      // rien tant que personne n'aura corrigé le réglage. On garde la file — les
      // écritures ne sont pas perdues — et on le fait dire à l'administration.
      if (r.status === 401 || r.status === 503) lastState = 'token'
      else if (r.ok) { lastState = 'ok'; await db.outbox.bulkDelete(items.map((i) => i.seq!)) }
      else lastState = 'network'
    }
  } catch { lastState = 'network' } finally {
    flushing = false
    await notify()
  }
}

// Vide la file dès que la connexion revient.
if (typeof window !== 'undefined' && BASE) window.addEventListener('online', () => flush(0))

/** Force l'envoi immédiat de la file et permet de l'attendre. À utiliser après
 *  une écriture que l'utilisateur peut suivre d'une navigation : sans cela, le
 *  débounce laisse une fenêtre pendant laquelle une hydratation écraserait
 *  l'écriture avec un état serveur pas encore au courant. */
export function flushNow(): Promise<void> {
  clearTimeout(timer)
  return doFlush()
}
