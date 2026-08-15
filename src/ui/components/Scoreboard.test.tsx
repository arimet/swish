import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreSide } from './Scoreboard'

/**
 * Le seul mouvement authorial du produit : le score accuse réception du geste qui
 * l'a changé, et il dit *dans quel sens*.
 *
 * Ce qui se teste ici n'est pas l'animation — un navigateur la joue, jsdom non —
 * mais la **décision** : quelle classe est posée, quand, et surtout quand elle ne
 * l'est pas. C'est ce dernier point qui compte le plus : l'écran de la table de
 * marque se rerend une fois par seconde à cause du chrono, et un mouvement qui se
 * redéclencherait au tic serait un clignotement permanent à côté du nombre que
 * cinq personnes regardent.
 */
const mount = (score: number) =>
  render(<ScoreSide align="right" color="#fff" name="VIGNOT" score={score} lead />)

const nombre = (value: number) => screen.getByText(String(value))

describe('ScoreSide — the score\'s acknowledgement', () => {
  it('does not move on the first render', () => {
    // À l'ouverture, le score n'a pas changé : il était déjà là. Une chorégraphie
    // de chargement n'a rien à faire sur un écran de saisie.
    mount(38)
    expect(nombre(38).className).not.toMatch(/score-(up|down)/)
  })

  it('rises when someone scores', () => {
    const { rerender } = mount(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={40} lead />)
    expect(nombre(40)).toHaveClass('score-up')
  })

  it('falls when someone undoes', () => {
    // Une annulation qui se lirait comme un panier serait pire que pas de mouvement.
    const { rerender } = mount(40)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={38} lead />)
    expect(nombre(38)).toHaveClass('score-down')
  })

  it('does not re-trigger when the score does not change', () => {
    // Le cas du tic de chrono : le parent rerend, le score est le même. Le nœud
    // doit être le *même* nœud — sinon le navigateur rejouerait le keyframe.
    const { rerender } = mount(38)
    const avant = nombre(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={38} lead={false} />)
    expect(nombre(38)).toBe(avant)
  })

  it('replays the motion on every basket, even of the same value', () => {
    // Deux lancers francs de suite : le nœud doit être remplacé les deux fois,
    // sinon le second panier passerait inaperçu.
    const { rerender } = mount(38)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={39} lead />)
    const premier = nombre(39)
    rerender(<ScoreSide align="right" color="#fff" name="VIGNOT" score={40} lead />)
    expect(nombre(40)).not.toBe(premier)
    expect(nombre(40)).toHaveClass('score-up')
  })
})
