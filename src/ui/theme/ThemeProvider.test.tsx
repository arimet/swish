import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeSwitcher } from './ThemeSwitcher'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark')
})

describe('ThemeProvider', () => {
  it('applique le thème Jour (light) par défaut sur <html>', () => {
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // Le sombre n'a pas d'entrée dans l'interface, mais il n'est pas mort : une
  // préférence déjà écrite est respectée au démarrage.
  it('respecte un thème Nuit déjà enregistré', () => {
    localStorage.setItem('theme', 'dark')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('bascule en mode Nuit via le switcher', async () => {
    render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /nuit/i }))
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
