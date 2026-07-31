import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Confirmation interne (remplace window.confirm). */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger, onConfirm, onClose }: {
  open: boolean; title: string; message?: string
  confirmLabel?: string; cancelLabel?: string; danger?: boolean
  onConfirm: () => void; onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm border-none bg-[#161618] p-5 text-white [&>button]:text-white/60">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{title}</DialogTitle></DialogHeader>
        {message && <p className="text-[13px] leading-relaxed" style={{ color: '#8a8a90' }}>{message}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-bold transition hover:bg-white/20">{cancelLabel}</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition hover:brightness-110 ${danger ? 'bg-red-500' : 'bg-[#ff4d6d]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
