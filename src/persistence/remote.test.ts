import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { db } from './db'

/**
 * Le miroir face à la source de vérité.
 *
 * `remote.ts` lit `VITE_SYNC_URL` **à l'import**, et la configuration de vitest
 * la vide pour toute la suite (voir `vite.config.ts`) : ce fichier la repose donc
 * lui-même, puis importe le module dynamiquement. C'est la seule façon d'exercer
 * le chemin distant sans forcer les cinquante autres fichiers de test à le
 * traverser.
 */
async function moduleDistant() {
  vi.stubEnv('VITE_SYNC_URL', '/api')
  vi.resetModules()
  return import('./remote')
}

/** Une réponse d'hydratation, telle que `GET /api/state` la renvoie. */
const etat = (docs: unknown[], alive: string[], rev = 1) =>
  ({ ok: true, status: 200, json: async () => ({ rev, docs, alive }) })

beforeEach(async () => {
  await db.teams.clear(); await db.players.clear(); await db.matches.clear(); await db.outbox.clear()
  localStorage.clear()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('hydrate — le serveur fait foi', () => {
  it('écrit ce que le serveur envoie', async () => {
    const { hydrate } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () =>
      etat([{ kind: 'team', id: 'ta', doc: { id: 'ta', name: 'VIGNOT' } }], ['team:ta'])))

    expect(await hydrate()).toBe(true)
    expect((await db.teams.get('ta'))?.name).toBe('VIGNOT')
  })

  it('supprime en local ce qui ne figure plus au manifeste', async () => {
    // C'est la propriété qui remplace les pierres tombales : une suppression
    // supprime vraiment la ligne côté serveur, donc rien ne la décrit — c'est
    // l'absence de l'identifiant qui la porte.
    await db.teams.put({ id: 'retiree', name: 'PARTIE' })
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    const { hydrate } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => etat([], ['team:ta'])))

    await hydrate()
    expect(await db.teams.get('retiree')).toBeUndefined()
    expect(await db.teams.get('ta')).toBeDefined()
  })

  it('une hydratation vide vide le miroir', async () => {
    // Le test existe pour verrouiller l'invariant, pas malgré lui : « on ne va
    // quand même pas effacer ses données » est exactement la régression
    // compatissante qui rendrait au miroir un statut de seconde vérité.
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    await db.players.put({ id: 'p1', teamId: 'ta', number: 4, lastName: 'X', firstName: 'Y' })
    const { hydrate } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => etat([], [])))

    await hydrate()
    expect(await db.teams.count()).toBe(0)
    expect(await db.players.count()).toBe(0)
  })

  it('n’efface pas ce qui attend dans la file', async () => {
    // Ce n'est pas du périmé que le serveur ignorerait : c'est une écriture que
    // la personne vient de faire et qui n'est pas encore partie.
    await db.teams.put({ id: 'neuve', name: 'CRÉÉE HORS LIGNE' })
    await db.outbox.add({ kind: 'team', op: 'put', id: 'neuve', ts: Date.now(), modifiedAt: new Date().toISOString() })
    const { hydrate } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => etat([], [])))

    await hydrate()
    expect(await db.teams.get('neuve')).toBeDefined()
  })

  it('avance le curseur, et le renvoie à la requête suivante', async () => {
    const { hydrate } = await moduleDistant()
    const appels: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { appels.push(url); return etat([], [], 42) }))

    await hydrate()
    await hydrate()
    expect(appels[0]).toContain('since=0')
    expect(appels[1]).toContain('since=42')
  })

  it('un jeton refusé ne touche pas au miroir', async () => {
    await db.teams.put({ id: 'ta', name: 'VIGNOT' })
    const { hydrate, syncState } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))

    expect(await hydrate()).toBe(false)
    expect(await db.teams.get('ta')).toBeDefined()
    expect(syncState()).toBe('token')
  })
})

describe('la santé de la synchronisation', () => {
  it('annonce le nombre d’actions en attente et l’état du dernier envoi', async () => {
    // Le compte est la mesure honnête : « en attente » ne dit pas si ça avance,
    // un nombre qui grossit, si.
    const { enqueuePut, flushNow, onHealth } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    const vus: { state: string; pending: number }[] = []
    const stop = onHealth((s) => vus.push(s))

    await enqueuePut('team', 'ta', { id: 'ta' })
    await enqueuePut('team', 'tb', { id: 'tb' })
    await flushNow()
    stop()

    expect(vus.at(-1)).toEqual({ state: 'token', pending: 2 })
  })

  it('retombe à zéro quand la file part', async () => {
    // C'est ce qui fait disparaître la pastille toute seule : elle ne s'efface pas
    // au bout d'un délai, elle s'efface quand la condition cesse d'être vraie.
    const { enqueuePut, flushNow, onHealth } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))
    const vus: { state: string; pending: number }[] = []
    const stop = onHealth((s) => vus.push(s))

    await enqueuePut('team', 'ta', { id: 'ta' })
    await flushNow()
    stop()

    expect(vus.at(-1)).toEqual({ state: 'ok', pending: 0 })
  })

  it('cesse d’annoncer une fois désabonné', async () => {
    const { enqueuePut, onHealth } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))
    let appels = 0
    onHealth(() => { appels++ })()

    await enqueuePut('team', 'ta', { id: 'ta' })
    expect(appels).toBe(0)
  })
})

describe('la file d’attente', () => {
  it('date chaque opération au moment du geste, pas de l’envoi', async () => {
    // L'arbitrage des conflits repose entièrement là-dessus : une file bloquée
    // deux heures par un gymnase sans réseau ne doit pas écraser une correction
    // faite entre-temps sur un autre appareil.
    const { enqueuePut } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })))

    const avant = Date.now()
    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    const [item] = await db.outbox.toArray()

    expect(item.modifiedAt).toBeTruthy()
    expect(Date.parse(item.modifiedAt)).toBeGreaterThanOrEqual(avant)
  })

  it('garde la file quand le serveur refuse le jeton', async () => {
    const { enqueuePut, flushNow, syncState } = await moduleDistant()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))

    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    await flushNow()

    expect(await db.outbox.count()).toBe(1)
    expect(syncState()).toBe('token')
  })

  it('n’envoie pas un gros lot en `keepalive` — le navigateur le plafonne à 64 Ko', async () => {
    // Sans cette précaution, `fetch` échoue sèchement au-delà du quota, l'échec
    // tombe dans le `catch` avec les pannes de réseau, et la file réessaie
    // indéfiniment un envoi qui ne peut pas aboutir. Une seule rencontre pèse
    // des dizaines de kilooctets une fois son journal sérialisé.
    const { enqueuePut, flushNow } = await moduleDistant()
    const appels: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { appels.push(init); return { ok: true, status: 204 } }))

    await enqueuePut('match', 'gros', { pave: 'x'.repeat(70_000) })
    await flushNow()
    expect(appels.at(-1)?.keepalive).toBe(false)

    await db.outbox.clear()
    await enqueuePut('team', 'ta', { id: 'ta', name: 'VIGNOT' })
    await flushNow()
    expect(appels.at(-1)?.keepalive).toBe(true)
  })

  it('ne garde que la dernière opération par entité', async () => {
    const { enqueuePut, flushNow } = await moduleDistant()
    let envoye: { ops: { id: string; doc: { name: string } }[] } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      envoye = JSON.parse(init.body as string); return { ok: true, status: 204 }
    }))

    await enqueuePut('team', 'ta', { id: 'ta', name: 'PREMIER' })
    await enqueuePut('team', 'ta', { id: 'ta', name: 'DERNIER' })
    await flushNow()

    expect(envoye!.ops).toHaveLength(1)
    expect(envoye!.ops[0].doc.name).toBe('DERNIER')
    expect(await db.outbox.count()).toBe(0)
  })
})
