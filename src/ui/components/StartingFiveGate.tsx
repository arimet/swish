import type { Player } from '../../domain/types'
import { C } from '../olive/kit'
import { useT } from '../../i18n'

/* La marque, comme sur la table de marque : `--team-a` valait un presque-noir en
   thème clair, d'où des anneaux et des filets noirs sur cet écran. */
const TEAM_A = C.brand

/**
 * Porte d'entrée avant tout démarrage de chrono : notre équipe doit désigner
 * son cinq de départ (STARTING_FIVE) avant que le match live ne s'affiche.
 */
export function StartingFiveGate({
  rosterA, requiredA, selected, onToggle, onStart, canStart, onExit,
}: {
  rosterA: Player[]
  requiredA: number
  selected: string[]
  onToggle: (playerId: string) => void
  onStart: () => void
  canStart: boolean
  onExit?: () => void
}) {
  const translate = useT()
  return (
    /* La table de marque vit hors de la coquille : cet écran porte donc lui-même
       son fond et sa hauteur, sinon il flotterait sur le gris de la page. */
    <div className="min-h-dvh overflow-y-auto" style={{ background: C.frame, color: C.text }}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-8 text-center">
          {onExit && (
            <button onClick={onExit} className="float-left text-sm font-semibold text-muted-foreground hover:text-foreground">
              {translate('cinq.quitter')}
            </button>
          )}
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{translate('cinq.titre')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{translate('cinq.consigne')}</p>
        </div>

        <div className="mx-auto grid max-w-md gap-5">
          <StartingFivePanel title={translate('cinq.monEquipe')} color={TEAM_A} players={rosterA} required={requiredA}
            chosen={selected} onToggle={onToggle} />
        </div>

        <div className="sticky bottom-4 mt-8 flex justify-center">
          <button
            disabled={!canStart}
            onClick={onStart}
            className="rounded-2xl bg-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40"
          >
            {translate('cinq.demarrer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function StartingFivePanel({ title, color, players, required, chosen, onToggle }: {
  title: string; color: string; players: Player[]; required: number; chosen: string[]
  onToggle: (id: string) => void
}) {
  const translate = useT()
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4" style={{ boxShadow: `inset 0 3px 0 0 ${color}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} />
          <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
        </div>
        <span className="nums rounded-full bg-muted px-2.5 py-1 text-sm font-bold text-muted-foreground">
          {chosen.length}/{required}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[...players].sort((a, b) => a.number - b.number).map((p) => {
          const isChosen = chosen.includes(p.id)
          const disabled = !isChosen && chosen.length >= required
          return (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => onToggle(p.id)}
              className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background p-2.5 text-left transition hover:bg-muted active:scale-[0.98] disabled:opacity-35"
              style={isChosen ? { boxShadow: `inset 0 0 0 2px ${color}`, borderColor: 'transparent' } : undefined}
            >
              <span
                className="nums grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--c-card2)] text-sm font-extrabold text-[var(--c-text)]"
                style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
              >
                {p.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.lastName}</span>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-black"
                style={isChosen ? { background: color, color: C.onBrand } : { border: `1.5px solid ${C.border}`, color: 'transparent' }}>
                ✓
              </span>
            </button>
          )
        })}
        {players.length === 0 && (
          <p className="col-span-2 py-4 text-center text-sm text-muted-foreground">{translate('cinq.equipeVide')}</p>
        )}
      </div>
    </div>
  )
}
