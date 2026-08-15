/**
 * La combinaison arrivée par un lien. Tout le schéma est dans le fragment de
 * l'URL : rien à installer, rien à synchroniser, aucun serveur à interroger.
 * D'où la place de cet écran — hors de la coquille et **hors du garde de club** :
 * celui qui reçoit le lien n'a peut-être jamais ouvert l'application, et le
 * renvoyer vers l'écran de bienvenue lui cacherait ce qu'on lui a envoyé.
 *
 * Lire est libre. Seul « Ajouter à ma bibliothèque » écrit, et passe donc par le
 * code administrateur.
 *
 * C'est le seul bouton d'écriture du dépôt qui reste visible sans le droit, et
 * c'est délibéré : cet écran vit hors de la coquille, il n'a donc pas le menu
 * d'accès sous la main. Le masquer condamnerait l'import — un coach qui reçoit
 * le lien sur un téléphone où sa session est neuve n'aurait plus aucune porte
 * pour saisir son code. Ici, le bouton EST la porte.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'
import { newId } from '../../domain/ids'
import { decoder } from '../../domain/partage'
import type { Play } from '../../domain/plays'
import { savePlay } from '../../persistence/repositories'
import { courtWidth, PlayBoard } from '../components/PlayBoard'
import { C, bd } from '../olive/kit'

export function SchemaRecu() {
  const translate = useT()
  const { hash } = useLocation()
  const { guard } = useAuth()
  const { clubId, ready } = useClub()
  const navigate = useNavigate()
  const [schema, setSchema] = useState<Play | null | undefined>(undefined)
  const [index, setIndex] = useState(0)

  // `useLocation().hash` porte le « # » : le code commence au caractère suivant.
  const code = hash.slice(1)

  useEffect(() => {
    let vivant = true
    decoder(code).then((s) => { if (vivant) setSchema(s) })
    return () => { vivant = false }
  }, [code])

  if (schema === undefined) return <Ecran><p style={{ color: C.muted }}>{translate('recu.ouverture')}</p></Ecran>
  if (schema === null) return (
    <Ecran>
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-extrabold">{translate('recu.lienAbime')}</p>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            {translate('recu.lienExplication')}
          </p>
          <Link to="/" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>
            {translate('recu.ouvrirSwish')}
          </Link>
        </div>
      </div>
    </Ecran>
  )

  const last = schema.steps.length - 1
  // Le défilement se borne, il ne boucle pas — même règle que la consultation.
  const aller = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)))

  // Un schéma neuf : nouvel identifiant, club de celui qui reçoit. L'import ne
  // peut donc écraser aucun schéma existant, même si l'expéditeur et le
  // destinataire partagent la même base.
  const ajouter = () => guard('manage', async () => {
    if (!clubId) return
    const s: Play = { ...schema, id: newId(), clubId }
    await savePlay(s)
    navigate(`/schemas/${s.id}`)
  })

  // Même bornage de largeur que la consultation : c'est le rapport du viewBox
  // qui doit tenir, le demi-terrain déborderait sinon sur un écran large.
  const large = courtWidth(schema.court)

  return (
    <Ecran>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 p-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.accent }}>{translate('recu.titre')}</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{schema.name}</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {translate(schema.court === 'half' ? 'sch.demiTerrain' : 'sch.terrainComplet')} · {translate('sch.compteTemps', { count: schema.steps.length })}{schema.defense ? ` ${translate('sch.defense')}` : ''}
          </p>
        </div>

        {schema.note && <p className="rounded-2xl p-4 text-sm" style={{ background: C.card, border: bd, color: C.muted }}>{schema.note}</p>}

        <div className="select-none" style={{ maxWidth: large }}>
          <PlayBoard schema={schema} stepIndex={index} />
        </div>

        <div className="flex select-none items-center gap-3" style={{ maxWidth: large }}>
          <Pas label={translate('lecteur.precedent')} onClick={() => aller(-1)} disabled={index === 0}>◀</Pas>
          <span className="flex-1 text-center text-sm font-extrabold">{translate('sch.temps', { n: index + 1, total: schema.steps.length })}</span>
          <Pas label={translate('lecteur.suivant')} onClick={() => aller(1)} disabled={index === last}>▶</Pas>
        </div>

        {/* Tant que les équipes ne sont pas chargées, on ne sait pas si un club
            est réglé : proposer l'un ou l'autre trop tôt ferait clignoter l'écran. */}
        {ready && (clubId ? (
          <button onClick={ajouter} className="rounded-2xl py-3.5 text-sm font-black text-[var(--c-on-brand)]" style={{ background: C.brand, maxWidth: large }}>
            {translate('recu.ajouter')}
          </button>
        ) : (
          <Link to="/" className="rounded-2xl py-3.5 text-center text-sm font-black text-[var(--c-on-brand)]" style={{ background: C.brand, maxWidth: large }}>
            {translate('recu.choisirClub')}
          </Link>
        ))}

        <p className="text-[12px]" style={{ color: C.faint }}>
          {translate('recu.rienAInstaller')}
        </p>
      </div>
    </Ecran>
  )
}

/** Le fond plein du lecteur : ce lien s'ouvre le plus souvent sur un téléphone,
 *  hors de la coquille et de son menu. */
function Ecran({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh" style={{ background: C.frame, color: C.text }}>{children}</div>
}

function Pas({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick} aria-label={label} disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
      style={{ background: C.card, border: bd, color: C.text }}
    >
      {children}
    </button>
  )
}
