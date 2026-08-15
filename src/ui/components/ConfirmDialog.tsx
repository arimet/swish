import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { C } from '../olive/kit'

/** Confirmation interne (remplace window.confirm).
 *
 *  `saisieAttendue` réserve un cran de plus aux actions qui vident l'appareil : tant
 *  que ce texte n'est pas recopié exactement, la confirmation reste inerte. Un clic
 *  unique n'est pas à la hauteur d'une destruction qu'aucune corbeille ne rattrape. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger, saisieAttendue, onConfirm, onClose }: {
  open: boolean; title: string; message?: string
  confirmLabel?: string; cancelLabel?: string; danger?: boolean; saisieAttendue?: string
  onConfirm: () => void; onClose: () => void
}) {
  const [saisie, setSaisie] = useState('')
  // La saisie repart à zéro à chaque fermeture : rouvrir le dialogue ne doit pas
  // trouver la confirmation déjà remplie par la fois d'avant.
  const fermer = () => { setSaisie(''); onClose() }
  const bloqué = !!saisieAttendue && saisie.trim() !== saisieAttendue
  return (
    <Dialog open={open} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-sm border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{title}</DialogTitle></DialogHeader>
        {message && <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>{message}</p>}
        {saisieAttendue && (
          <>
            <label htmlFor="confirm-saisie" className="mt-1 text-[13px] font-semibold">
              Saisissez « {saisieAttendue} » pour confirmer
            </label>
            <input
              id="confirm-saisie" autoFocus value={saisie} onChange={(e) => setSaisie(e.target.value)}
              className="w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-4 py-3 text-sm outline-none transition focus:border-[var(--c-accent)]"
            />
          </>
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={fermer} className="flex-1 rounded-xl bg-[var(--c-card2)] py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{cancelLabel}</button>
          <button
            onClick={() => { onConfirm(); fermer() }} disabled={bloqué}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-[var(--c-on-brand)] transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 ${danger ? 'bg-[var(--c-danger-fill)] text-[var(--c-on-danger)]' : 'bg-[var(--c-brand)]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
