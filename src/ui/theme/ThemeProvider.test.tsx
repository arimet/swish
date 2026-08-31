import { act, render, screen } from '../../test/render'
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
    // Dark is the product's identity and not an economy mode: a first launch must show
    // the ink canvas and the lemon accent, which is what the visual world is. The system
    // preference is deliberately not consulted — see `initialTheme`. Light exists and is
    // one click away.
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('a saved "light" choice is honoured, despite the dark default', () => {
    // This is what makes ignoring the system preference acceptable: an explicit choice,
    // by contrast, is not up for debate.
    localStorage.setItem(THEME_KEY, 'light')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  // The toggle now lives in the header, so the choice can be remembered: a saved
  // dark theme read back on start traps nobody, it is one click away.
  it('picks the saved dark theme back up on start', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    render(<ThemeProvider><div>x</div></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('switches to light mode through the switcher, and saves it', async () => {
    // We start from dark, so the toggle on offer is the light one.
    render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /jour/i }))
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
