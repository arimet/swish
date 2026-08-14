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

  // Tant qu'aucun écran n'offre la bascule, une préférence mémorisée ne peut que
  // piéger : un « dark » laissé par une version précédente enfermait son
  // propriétaire dans un thème dont rien ne permettait de sortir. On l'ignore, et
  // on l'efface au passage.
  it('ignore un thème Nuit laissé par une version précédente', () => {
    localStorage.setItem('theme', 'dark')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBeNull()
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
