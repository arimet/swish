import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth'

function Probe({ onGuardedManage }: { onGuardedManage?: () => void }) {
  const { role, playerId, can, guard, setPlayer } = useAuth()
  return (
    <div>
      <p>rôle : {role}</p>
      <p>joueur : {playerId ?? 'aucun'}</p>
      <p>score : {can('score') ? 'oui' : 'non'}</p>
      <p>manage : {can('manage') ? 'oui' : 'non'}</p>
      <button onClick={() => guard('manage', () => onGuardedManage?.())}>Action gérée</button>
      <button onClick={() => setPlayer('p1')}>Choisir p1</button>
    </div>
  )
}

const renderProbe = (props?: { onGuardedManage?: () => void }) => render(<AuthProvider><Probe {...props} /></AuthProvider>)

const saisirCode = async (code: string) => {
  const input = await screen.findByPlaceholderText('Code')
  await userEvent.type(input, code)
  await userEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('table des droits', () => {
  it('un visiteur ne peut ni saisir ni gérer', async () => {
    renderProbe()
    expect(await screen.findByText('score : non')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })

  it('la table de marque saisit mais ne gère pas', async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('marque')
    expect(await screen.findByText('rôle : marque')).toBeInTheDocument()
    expect(screen.getByText('score : oui')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })

  it("l'administrateur saisit et gère", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('admin')
    expect(await screen.findByText('rôle : admin')).toBeInTheDocument()
    expect(screen.getByText('score : oui')).toBeInTheDocument()
    expect(screen.getByText('manage : oui')).toBeInTheDocument()
  })
})

describe('code inconnu', () => {
  it("ne donne aucun rôle et laisse le rôle courant inchangé", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('n-importe-quoi')
    // Le dialogue reste ouvert, avec un message nommant l'accès requis.
    expect(await screen.findByText(/Code Administrateur requis/)).toBeInTheDocument()
    expect(screen.getByText('rôle : visiteur')).toBeInTheDocument()
  })
})

describe('code joueur', () => {
  it("ne donne ni score ni manage", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('joueur')
    // Le rôle reste visiteur : le code joueur n'accorde aucun droit d'écriture.
    expect(await screen.findByText('rôle : visiteur')).toBeInTheDocument()
    expect(screen.getByText('score : non')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })
})

describe('identité de joueur', () => {
  it('survit à un remontage du provider dans un nouvel onglet, le rôle non', async () => {
    const { unmount } = renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('admin')
    expect(await screen.findByText('rôle : admin')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choisir p1' }))
    expect(await screen.findByText('joueur : p1')).toBeInTheDocument()

    unmount()
    // Un nouvel onglet vide sessionStorage (le rôle expire avec lui) mais pas
    // localStorage (l'identité de joueur reste posée sur l'appareil).
    sessionStorage.clear()
    renderProbe()
    expect(await screen.findByText('joueur : p1')).toBeInTheDocument()
    expect(screen.getByText('rôle : visiteur')).toBeInTheDocument()
  })
})

describe('guard', () => {
  it("n'exécute pas l'action quand le droit manque, et l'exécute quand il est acquis", async () => {
    const onGuardedManage = vi.fn()
    renderProbe({ onGuardedManage })
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    expect(onGuardedManage).not.toHaveBeenCalled()

    await saisirCode('admin')
    expect(onGuardedManage).toHaveBeenCalledTimes(1)

    // Le droit est désormais acquis : un nouvel appel exécute directement.
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    expect(onGuardedManage).toHaveBeenCalledTimes(2)
  })
})
