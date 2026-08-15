/**
 * The club's playbook. Each card shows a thumbnail of the first step: a coach
 * recognises a play by its shape, not by its name. Twenty plays is the point where
 * filing starts: a folder bar, a search, and the most recently edited first.
 * Reading is ungated — searching, filtering and playing ask for no code; creating,
 * duplicating, filing and deleting are administrative, and their buttons only render
 * for whoever has the right. The guards stay in place: a hidden button is a display
 * convenience, not a protection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { folders, newPlay, type Play } from '../../domain/plays'
import { deletePlay, listPlays, savePlay } from '../../persistence/repositories'
import { remoteEnabled } from '../../persistence/remote'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { PlayBoard } from '../components/PlayBoard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { C, bd, Ic, ICON, PageTitle } from '../olive/kit'

/** The two card actions that are not "Play": drawn, not written. A word the same
 *  size as "Play" gave them the same weight, while one copies and the other
 *  destroys. */
const ICON_COPY = 'M9 9h11v11H9zM15 5.5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1.5'
const ICON_TRASH = 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7M10 11v5M14 11v5'

/** Case- and accent-insensitive: at the sideline you type "defense" and you want to
 *  find "défense". */
const deaccent = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** A play's folder, normalised. Empty string = "Unfiled", which doubles as a tab: a
 *  real folder is never empty (cf. `folders`). */
const folderOf = (s: Play) => s.folder?.trim() ?? ''

const DATALIST = 'dossiers-connus'

export function SchemaList() {
  const translate = useT()
  const { clubId } = useClub()
  const { can, guard } = useAuth()
  const manages = can('manage')
  const navigate = useNavigate()
  const [schemas, setSchemas] = useState<Play[] | null>(null)
  // The play whose deletion has been asked for: the right is checked when the dialog
  // opens, as on the team record.
  const [toDelete, setToDelete] = useState<Play | null>(null)
  // `null` = the "All" tab, `''` = "Unfiled", otherwise the folder's name.
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // The play whose folder is being entered, and the value being typed.
  const [pickingFolder, setPickingFolder] = useState<{ id: string; value: string } | null>(null)

  const reload = useCallback(() => {
    if (clubId) listPlays(clubId).then(setSchemas)
  }, [clubId])
  useEffect(() => { reload() }, [reload])

  // Guard first, write second: the play is only created once the right is held,
  // otherwise a visitor would leave empty plays behind their refusals.
  const create = () => guard('manage', async () => {
    if (!clubId) return
    const s: Play = { id: newId(), ...newPlay(clubId, 'half', false), name: translate('sch.nouveauNom') }
    await savePlay(s)
    navigate(`/schemas/${s.id}/edit`)
  })

  const duplicate = (s: Play) => guard('manage', async () => {
    // Deep copy: the steps and their arrows would otherwise be shared, and touching
    // up the copy would modify the original.
    await savePlay({ ...structuredClone(s), id: newId(), name: translate('sch.copieDe', { name: s.name }) })
    reload()
  })

  const remove = async () => {
    if (!toDelete) return
    await deletePlay(toDelete.id)
    reload()
  }

  // Guard first, mutate second: the scorer's table does not even open the input,
  // rather than typing a folder only to be refused on submit.
  const openFolderPicker = (s: Play) => guard('manage', () => setPickingFolder({ id: s.id, value: folderOf(s) }))
  const setFolder = (s: Play) => guard('manage', async () => {
    const value = pickingFolder?.value.trim()
    await savePlay({ ...s, folder: value || undefined })
    setPickingFolder(null)
    reload()
  })

  const all = useMemo(() => schemas ?? [], [schemas])
  const folderList = useMemo(() => folders(all), [all])
  const hasUnfiled = all.some((s) => !folderOf(s))

  // Filter, then order: the active folder, the search across name and note, and the
  // order from most recently edited to oldest. Plays from before the timestamp have
  // no `updatedAt`; the empty string sends them last without ever comparing an
  // `undefined`.
  const visible = useMemo(() => {
    const q = deaccent(query.trim())
    return all
      .filter((s) => activeFolder === null || folderOf(s) === activeFolder)
      .filter((s) => !q || deaccent(`${s.name} ${s.note ?? ''}`).includes(q))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }, [all, activeFolder, query])

  return (
    <div className="p-6">
      <PageTitle
        action={manages && (
          <button onClick={create} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('sch.nouveau')}
          </button>
        )}
      />

      {schemas === null ? (
        <div className="h-40 animate-pulse rounded-2xl" style={{ background: C.card }} />
      ) : schemas.length === 0 ? (
        // The empty state says what is filed here and what you get out of it, not
        // merely that there is nothing: "no plays" has never made anyone want to draw
        // one. And you have to be able to draw one: to someone without the write
        // right, the invitation to draw would say nothing but a refusal. They read
        // instead who fills this library, and wait for it to be filled.
        <div className="rounded-2xl px-6 py-14 text-center" style={{ border: `1px dashed ${C.border}` }}>
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: C.accentBg, color: C.accent }}>
            <Ic d={ICON.matches} className="h-7 w-7" />
          </span>
          <p className="text-base font-extrabold">{translate('sch.bibliothequeVide')}</p>
          {manages ? (
            <>
              <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: C.muted }}>
                {translate('sch.videGere')}
              </p>
              <button onClick={create} className="mt-5 rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
                {translate('sch.dessinerPremiere')}
              </button>
            </>
          ) : (
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: C.muted }}>
              {translate('sch.videVisiteur')}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* The tabs are derived from the plays: an emptied folder disappears on
                its own, and "Unfiled" only shows while something is left to file. */}
            <div role="group" aria-label={translate('sch.dossiers')} className="flex flex-wrap gap-1.5">
              <Tab active={activeFolder === null} onClick={() => setActiveFolder(null)}>{translate('sch.tous')}</Tab>
              {folderList.map((d) => (
                <Tab key={d} active={activeFolder === d} onClick={() => setActiveFolder(d)}>{d}</Tab>
              ))}
              {hasUnfiled && <Tab active={activeFolder === ''} onClick={() => setActiveFolder('')}>{translate('sch.sansDossier')}</Tab>}
            </div>
            {/* The magnifier inside the field: on a folder bar that keeps growing, a
                bare rectangle no longer reads as anything but one more tab. */}
            <div className="relative ml-auto w-full sm:w-72">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center" style={{ color: C.faint }}>
                <Ic d={ICON.search} className="h-4 w-4" />
              </span>
              <input
                type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                aria-label={translate('sch.rechercher')} placeholder={translate('sch.rechercherPlaceholder')}
                className="h-10 w-full rounded-xl pl-9 pr-3 text-sm"
                style={{ background: C.panel, border: bd, color: C.text }}
              />
            </div>
          </div>

          {/* One suggestion list for every card: it avoids spelling duplicates without
              imposing folder management. */}
          <datalist id={DATALIST}>{folderList.map((d) => <option key={d} value={d} />)}</datalist>

          {visible.length === 0 ? (
            <p className="rounded-2xl py-16 text-center text-sm" style={{ border: `1px dashed ${C.border}`, color: C.muted }}>
              {translate('sch.aucunResultat')}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
              {visible.map((s) => (
                <article key={s.id} className="flex flex-col rounded-2xl p-3" style={{ background: C.card, border: bd }}>
                  {/* The thumbnail and the name lead to the reading screen; the buttons
                      stay outside the link, a button inside a link is not clickable. */}
                  <Link to={`/schemas/${s.id}`} className="block transition hover:-translate-y-0.5">
                    {/* Fixed height, whatever the court: following its ratio, a full
                        court's thumbnail would be twice the others, the grid would align
                        the row on it and clip it at the bottom. The SVG fits inside the box
                        without distortion (`preserveAspectRatio`) — a full court therefore
                        appears narrower, which reads perfectly well. No pointer conversion
                        here: `remplit` is safe. */}
                    <div className="h-[150px] sm:h-[200px]">
                      <PlayBoard schema={s} stepIndex={0} apercu remplit />
                    </div>
                    <h3 className="mt-2.5 truncate text-[15px] font-extrabold tracking-tight">{s.name}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] font-bold" style={{ color: C.muted }}>
                      <span className="rounded-md px-1.5 py-0.5" style={{ background: C.card2 }}>
                        {translate(s.court === 'half' ? 'sch.demiTerrain' : 'sch.terrainComplet')}
                      </span>
                      <span>{translate('sch.compteTemps', { count: s.steps.length })}</span>
                      {s.defense && <span>{translate('sch.defense')}</span>}
                    </p>
                    {s.note && <p className="mt-1 truncate text-[12px]" style={{ color: C.faint }}>{s.note}</p>}
                  </Link>

                  {/* The folder stays readable by everyone — it is a classification, not
                      an action — but only whoever can file gets a button to change
                      it. */}
                  <div className="mt-2 text-[12px] font-bold">
                    {!manages ? (
                      <span className="inline-block rounded-md px-1.5 py-0.5" style={{ background: C.card2, color: s.folder ? C.accent : C.faint }}>
                        {s.folder || translate('sch.sansDossier')}
                      </span>
                    ) : pickingFolder?.id === s.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(e) => { e.preventDefault(); setFolder(s) }}
                      >
                        <input
                          list={DATALIST} aria-label={translate('sch.dossier')} autoFocus value={pickingFolder.value}
                          onChange={(e) => setPickingFolder({ id: s.id, value: e.target.value })}
                          placeholder={translate('sch.nomDossier')} className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[12px] font-semibold"
                          style={{ background: C.panel, border: bd, color: C.text }}
                        />
                        <button type="submit" className="rounded-lg px-2 py-1.5" style={{ color: C.accent }}>{translate('sch.ranger')}</button>
                      </form>
                    ) : (
                      <button
                        onClick={() => openFolderPicker(s)} aria-label={translate('sch.dossierDe', { name: s.name })}
                        className="rounded-md px-2 py-1.5" style={{ background: C.card2, color: s.folder ? C.accent : C.faint }}
                      >
                        {s.folder || translate('sch.sansDossier')}
                      </button>
                    )}
                  </div>

                  {/* Three weights, three shapes: "Play" — what you come to do at the
                      sideline, without going through the record — takes the row and
                      carries the accent; duplicate and delete withdraw into squares,
                      destruction alone outlined in the accent. Their accessible names stay
                      whole: it is the word that goes, not the label. Both squares write:
                      without the right, "Play" holds the row alone. */}
                  <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5" style={{ borderColor: C.border }}>
                    <Link
                      to={`/schemas/${s.id}/lecteur`}
                      className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl text-[13px] font-black"
                      style={{ background: C.accentBg, color: C.accent, border: `1px solid ${C.accentBd}` }}
                    >
                      {translate('sch.jouer')}
                    </Link>
                    {manages && (
                      <>
                        <button
                          onClick={() => duplicate(s)} aria-label={translate('sch.dupliquer')} title={translate('sch.dupliquer')}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                          style={{ background: C.card2, border: bd, color: C.muted }}
                        >
                          <Ic d={ICON_COPY} className="h-[17px] w-[17px]" />
                        </button>
                        <button
                          onClick={() => guard('manage', () => setToDelete(s))} aria-label={translate('commun.supprimer')} title={translate('commun.supprimer')}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                          style={{ border: `1px solid ${C.accentBd}`, color: C.accent }}
                        >
                          <Ic d={ICON_TRASH} className="h-[17px] w-[17px]" />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* Worded the same way as the trainings and the outside results: one limit to
          remember, not one per screen. */}
      {!remoteEnabled() && <p className="mt-8 max-w-[65ch] text-[12px]" style={{ color: C.faint }}>{translate('sch.schemasLocaux')}</p>}

      <ConfirmDialog
        open={!!toDelete} danger
        title={translate('sch.supprimerTitre')}
        message={toDelete ? translate('sch.supprimerTexte', { name: toDelete.name }) : undefined}
        confirmLabel={translate('commun.supprimer')} onConfirm={remove} onClose={() => setToDelete(null)}
      />
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} aria-pressed={active}
      className="rounded-lg px-3 py-1.5 text-[12px] font-bold"
      style={active ? { background: C.brand, color: C.onBrand } : { background: C.card2, color: C.muted, border: bd }}
    >
      {children}
    </button>
  )
}
