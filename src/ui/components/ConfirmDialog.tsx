import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { C } from '../olive/kit'
import { useT } from '../../i18n'
import { BTN, DANGER_FILLED, PRIMARY, SECONDARY } from './buttons'

/** An in-app confirmation (replaces window.confirm).
 *
 *  `expectedInput` reserves one more notch for the actions that empty the device:
 *  until that text is copied out exactly, the confirmation stays inert. A single
 *  click is not equal to a destruction no bin can undo. */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, danger, expectedInput, onConfirm, onClose }: {
  open: boolean; title: string; message?: string
  confirmLabel?: string; cancelLabel?: string; danger?: boolean; expectedInput?: string
  onConfirm: () => void; onClose: () => void
}) {
  const translate = useT()
  const [typed, setTyped] = useState('')
  /* The default labels resolve here and not in the signature: a default parameter
     cannot call a hook. */
  const confirmText = confirmLabel ?? translate('common.confirm')
  const cancelText = cancelLabel ?? translate('common.cancel')
  // The input resets on every close: reopening the dialog must not find the
  // confirmation already filled in from last time.
  const close = () => { setTyped(''); onClose() }
  const blocked = !!expectedInput && typed.trim() !== expectedInput
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-sm border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{title}</DialogTitle></DialogHeader>
        {message && <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>{message}</p>}
        {expectedInput && (
          <>
            <label htmlFor="confirm-saisie" className="mt-1 text-[13px] font-semibold">
              {translate('dialog.typeToConfirm', { text: expectedInput ?? '' })}
            </label>
            <input
              id="confirm-saisie" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-4 py-3 text-sm outline-none transition focus:border-[var(--c-accent)]"
            />
          </>
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={close} className={`${BTN} flex-1 ${SECONDARY}`}>{cancelText}</button>
          <button
            onClick={() => { onConfirm(); close() }} disabled={blocked}
            className={`${BTN} flex-1 ${danger ? `${DANGER_FILLED} disabled:opacity-40` : PRIMARY}`}
          >
            {confirmText}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
