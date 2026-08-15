import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_KEY, ThemeProvider } from './ThemeProvider'
import { ThemeSwitcher } from './ThemeSwitcher'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.classList.remove('dark')
})

describe('ThemeProvider', () => {
  it('starts dark when nothing is saved', () => {
    // Le sombre est l'identité du produit et non un mode d'économie : un premier
    // lancement doit montrer le canevas encre et l'accent citron, qui est ce que le
    // monde visuel est. La préférence système n'est délibérément pas consultée —
    // voir `initialTheme`. Le clair existe et s'obtient d'un clic.
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('a saved "light" choice is honoured, despite the dark default', () => {
    // C'est ce qui rend acceptable d'ignorer la préférence système : le choix
    // explicite, lui, ne se discute pas.
    localStorage.setItem(THEME_KEY, 'light')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // La bascule vit maintenant dans l'en-tête, donc le choix peut se mémoriser :
  // un « Nuit » relu au démarrage n'enferme plus personne, on en sort d'un clic.
  it('picks the saved dark theme back up on start', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('switches to light mode through the switcher, and saves it', async () => {
    // On part du sombre, donc la bascule offerte est « Jour ».
    render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /jour/i }))
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
