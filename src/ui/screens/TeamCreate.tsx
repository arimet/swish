import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { newId } from '../../domain/ids'
import { saveTeam, savePlayer } from '../../persistence/repositories'
import type { Player } from '../../domain/types'
import { C, bd, NumBadge } from '../olive/kit'
import { useAuth } from '../../app/auth'
import { useClub } from '../../app/club'
import { useT } from '../../i18n'

type Draft = Omit<Player, 'id' | 'teamId'>
const field: CSSProperties = { height: 44, borderRadius: 12, background: C.panel, border: bd, color: C.text, padding: '0 14px', outline: 'none', fontSize: 14 }
const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{children}</label>

export function TeamCreate() {
  const trad = useT()
  const navigate = useNavigate()
  const { guard, fonder } = useAuth()
  const { clubId, teams, setClub } = useClub()
  const [name, setName] = useState(''); const [coach, setCoach] = useState('')
  const [roster, setRoster] = useState<Draft[]>([])
  const [num, setNum] = useState(''); const [ln, setLn] = useState(''); const [fn, setFn] = useState('')

  const addToRoster = () => {
    if (!num || !ln.trim()) return
    setRoster((r) => [...r, { number: Number(num), lastName: ln.trim().toUpperCase(), firstName: fn.trim() }])
    setNum(''); setLn(''); setFn('')
  }
  /* La fondation du club : aucune équipe n'existe encore. C'est le seul instant où
     l'application se crée un premier administrateur sans code — voir `fonder()` dans
     `app/auth.tsx` pour la justification, et le bouton plus bas pour ce que ça change.
     La condition est bien « aucune équipe » et non « aucun club suivi » : celui qui a
     simplement effacé son choix de club n'est pas un fondateur. */
  const fondation = teams.length === 0

  const create = async () => {
    if (!name.trim()) return
    const teamId = newId()
    await saveTeam({ id: teamId, name: name.trim(), coach: coach.trim() || undefined })
    for (const p of roster) await savePlayer({ id: newId(), teamId, ...p })
    // Aucun club suivi : l'équipe qu'on vient de créer le devient, sinon la
    // garde renvoie droit vers l'écran de bienvenue qu'on quitte à peine.
    if (!clubId) setClub(teamId)
    // Le fondateur devient administrateur, sur cet appareil et pour cette session.
    // Sans cela, le bénévole qui vient de saisir son effectif restait « Visiteur » :
    // plus un seul bouton de création sur cinq écrans, et rien ne lui disait que
    // « Accès » dans la barre latérale était le passage.
    if (fondation) fonder()
    navigate(`/teams/${teamId}`)
  }

  return (
    <div className="p-6">
      <Link to="/teams" className="-mx-2 inline-block px-2 py-1.5 text-sm font-semibold" style={{ color: C.muted }}>{trad('equipe.retourEquipes')}</Link>
      {/* Un vrai titre, et non plus le sous-titre qui en tenait lieu : cet écran
          vit hors de la coquille, son en-tête ne le nomme donc pas à sa place. */}
      <h1 className="mb-6 mt-2 text-2xl font-extrabold tracking-tight">{trad('creation.titre')}</h1>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5 self-start rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <div><Label htmlFor="team-name">{trad('creation.nomEquipe')}</Label>
            <input id="team-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={trad('creation.nomPlaceholder')} style={{ ...field, width: '100%' }} /></div>
          <div><Label htmlFor="team-coach">{trad('equipe.entraineur')}</Label>
            <input id="team-coach" value={coach} onChange={(e) => setCoach(e.target.value)} placeholder={trad('creation.entraineurPlaceholder')} style={{ ...field, width: '100%' }} /></div>
          <p className="text-[12px]" style={{ color: C.muted }}>{trad('creation.joueurAjoute', { count: roster.length })}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
          <Label>{trad('creation.joueurs')}</Label>
          {roster.length > 0 && (
            <ul className="mb-3 grid gap-1.5 sm:grid-cols-2">
              {roster.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: C.panel }}>
                  <NumBadge n={p.number} size="h-7 w-7 rounded-lg text-xs" />
                  <span className="font-semibold">{p.lastName}</span><span style={{ color: C.muted }}>{p.firstName}</span>
                  <button onClick={() => setRoster((r) => r.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold" style={{ color: C.accent }}>{trad('equipe.retirer')}</button>
                </li>
              ))}
            </ul>
          )}
          {/* Trois étiquettes réelles, au-dessus de leurs champs. Le mot était
              auparavant dans le `placeholder` : il disparaissait à la première
              frappe, donc au moment précis où l'on vérifie qu'on remplit la bonne
              case, et un lecteur d'écran n'annonçait qu'« champ de saisie ». */}
          <div className="grid grid-cols-[68px_1fr_1fr_44px] items-end gap-2">
            <div><Label htmlFor="roster-num">{trad('equipe.numero')}</Label>
              <input id="roster-num" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" style={{ ...field, textAlign: 'center', width: '100%' }} /></div>
            <div><Label htmlFor="roster-last">{trad('equipe.nom')}</Label>
              <input id="roster-last" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={{ ...field, width: '100%' }} /></div>
            <div><Label htmlFor="roster-first">{trad('equipe.prenom')}</Label>
              <input id="roster-first" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addToRoster()} style={{ ...field, width: '100%' }} /></div>
            <button onClick={addToRoster} aria-label={trad('creation.ajouterJoueur')} className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold text-[var(--c-on-brand)]" style={{ background: C.brand }}>+</button>
          </div>
          {roster.length === 0 && <p className="mt-3 text-sm" style={{ color: C.muted }}>{trad('creation.consigne')}</p>}
        </div>
      </div>

      {/* Le bouton reste visible sans le droit — cet écran vit hors de la coquille et
          sans menu d'accès, le masquer rendrait l'application impossible à démarrer.
          Le raisonnement s'arrêtait là, et « la garde réclame le code au moment de
          créer » était précisément le mur : sur une installation vierge, le tout
          premier bénévole recevait une demande de code administrateur que personne ne
          lui a donné, pour la seule action qui rend l'application utilisable. Un
          bouton visible qui ouvre une porte fermée à clé ne vaut pas mieux qu'un
          bouton masqué.
          La fondation ne demande donc rien : aucune équipe n'existe, il n'y a aucune
          donnée à protéger, et le code administrateur défend des données et non un
          accès. Dès la deuxième équipe, la garde reprend son travail. */}
      <div className="mt-6 flex justify-end gap-3">
        <Link to="/teams" className="rounded-xl px-5 py-3 text-sm font-semibold" style={{ border: bd, color: C.muted }}>{trad('commun.annuler')}</Link>
        <button onClick={() => (fondation ? create() : guard('manage', create))} disabled={!name.trim()} className="rounded-xl px-6 py-3 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40" style={{ background: C.brand }}>
          {fondation ? trad('creation.creerMonEquipe') : trad('creation.creerEquipe')}
        </button>
      </div>
    </div>
  )
}
