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

describe('the rights table', () => {
  it('a visitor can neither record nor manage', async () => {
    renderProbe()
    expect(await screen.findByText('score : non')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })

  it('the scorer\'s table records but does not manage', async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('marque')
    expect(await screen.findByText('rôle : scorer')).toBeInTheDocument()
    expect(screen.getByText('score : oui')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })

  it("the administrator records and manages", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('admin')
    expect(await screen.findByText('rôle : admin')).toBeInTheDocument()
    expect(screen.getByText('score : oui')).toBeInTheDocument()
    expect(screen.getByText('manage : oui')).toBeInTheDocument()
  })
})

describe('an unknown code', () => {
  it("grants no role and leaves the current one unchanged", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('n-importe-quoi')
    // Le dialogue reste ouvert, avec un message nommant l'accès requis.
    expect(await screen.findByText(/Code Administrateur requis/)).toBeInTheDocument()
    expect(screen.getByText('rôle : visitor')).toBeInTheDocument()
  })
})

describe('the player code', () => {
  it("grants neither score nor manage", async () => {
    renderProbe()
    await userEvent.click(screen.getByRole('button', { name: 'Action gérée' }))
    await saisirCode('joueur')
    // Le rôle reste visiteur : le code joueur n'accorde aucun droit d'écriture.
    expect(await screen.findByText('rôle : visitor')).toBeInTheDocument()
    expect(screen.getByText('score : non')).toBeInTheDocument()
    expect(screen.getByText('manage : non')).toBeInTheDocument()
  })
})

describe('player identity', () => {
  it('survives a remount of the provider in a new tab; the role does not', async () => {
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
    expect(screen.getByText('rôle : visitor')).toBeInTheDocument()
  })
})

describe('guard', () => {
  it("does not run the action when the right is missing, and runs it once it is held", async () => {
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
