import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MatchMeta } from '../../domain/types'

type Editable = Pick<MatchMeta, 'championshipLabel' | 'matchNumber' | 'date' | 'time' | 'venue' | 'referee1' | 'referee2'>

/** Édition des informations d'une rencontre (méta), depuis le résumé. */
export function MatchMetaDialog({ open, meta, onClose, onSave }: {
  open: boolean; meta: MatchMeta; onClose: () => void; onSave: (patch: Editable) => void
}) {
  const [v, setV] = useState<Editable>(meta)
  useEffect(() => { if (open) setV(meta) }, [open, meta])
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  const cls = 'mt-1.5 w-full rounded-xl border border-white/10 bg-[#202024] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[#ff4d6d] [color-scheme:dark]'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg border-none bg-[#161618] p-5 text-white [&>button]:text-white/60">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">Modifier la rencontre</DialogTitle></DialogHeader>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <Field label="Championnat" className="sm:col-span-2"><input value={v.championshipLabel ?? ''} onChange={set('championshipLabel')} className={cls} /></Field>
          <Field label="Rencontre n°"><input value={v.matchNumber ?? ''} onChange={set('matchNumber')} className={cls} /></Field>
          <Field label="Lieu"><input value={v.venue ?? ''} onChange={set('venue')} className={cls} /></Field>
          <Field label="Date"><input type="date" value={v.date ?? ''} onChange={set('date')} className={cls} /></Field>
          <Field label="Heure"><input type="time" value={v.time ?? ''} onChange={set('time')} className={cls} /></Field>
          <Field label="Arbitre 1"><input value={v.referee1 ?? ''} onChange={set('referee1')} className={cls} /></Field>
          <Field label="Arbitre 2"><input value={v.referee2 ?? ''} onChange={set('referee2')} className={cls} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold transition hover:bg-white/20">Annuler</button>
          <button onClick={() => { onSave(v); onClose() }} className="rounded-xl bg-[#ff4d6d] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110">Enregistrer</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </label>
  )
}
