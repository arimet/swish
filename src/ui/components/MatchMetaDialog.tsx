import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MatchMeta } from '../../domain/types'
import { useT } from '../../i18n'

type Editable = Pick<MatchMeta, 'championshipLabel' | 'matchNumber' | 'date' | 'time' | 'venue' | 'referee1' | 'referee2'>

/** Édition des informations d'une rencontre (méta), depuis le résumé. */
export function MatchMetaDialog({ open, meta, onClose, onSave }: {
  open: boolean; meta: MatchMeta; onClose: () => void; onSave: (patch: Editable) => void
}) {
  const trad = useT()
  const [v, setV] = useState<Editable>(meta)
  useEffect(() => { if (open) setV(meta) }, [open, meta])
  const set = (k: keyof Editable) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  const cls = 'mt-1.5 w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] px-3.5 py-2.5 text-sm text-[var(--c-text)] outline-none transition focus:border-[var(--c-accent)]'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg border-none bg-[var(--c-card)] p-5 text-[var(--c-text)]">
        <DialogHeader><DialogTitle className="text-lg font-extrabold">{trad('meta.titre')}</DialogTitle></DialogHeader>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <Field label={trad('champ.championnat')} className="sm:col-span-2"><input value={v.championshipLabel ?? ''} onChange={set('championshipLabel')} className={cls} /></Field>
          <Field label={trad('meta.numero')}><input value={v.matchNumber ?? ''} onChange={set('matchNumber')} className={cls} /></Field>
          <Field label={trad('match.lieu')}><input value={v.venue ?? ''} onChange={set('venue')} className={cls} /></Field>
          <Field label={trad('match.date')}><input type="date" value={v.date ?? ''} onChange={set('date')} className={cls} /></Field>
          <Field label={trad('match.heure')}><input type="time" value={v.time ?? ''} onChange={set('time')} className={cls} /></Field>
          <Field label={trad('meta.arbitre1')}><input value={v.referee1 ?? ''} onChange={set('referee1')} className={cls} /></Field>
          <Field label={trad('meta.arbitre2')}><input value={v.referee2 ?? ''} onChange={set('referee2')} className={cls} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl bg-[var(--c-card2)] px-4 py-2.5 text-sm font-bold transition hover:bg-[var(--c-border)]">{trad('commun.annuler')}</button>
          <button onClick={() => { onSave(v); onClose() }} className="rounded-xl bg-[var(--c-brand)] px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)] transition hover:brightness-110">{trad('commun.enregistrer')}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-muted)]">{label}</span>
      {children}
    </label>
  )
}
