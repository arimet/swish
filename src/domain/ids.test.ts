import { describe, expect, it } from 'vitest'
import { newId, periodLength, elapsedGlobal } from './ids'

describe('helpers horloge', () => {
  it('periodLength: 600s en période normale, 300s en prolongation', () => {
    expect(periodLength(1)).toBe(600)
    expect(periodLength(4)).toBe(600)
    expect(periodLength(5)).toBe(300)
  })
  it('elapsedGlobal cumule les périodes précédentes + écoulé de la période', () => {
    expect(elapsedGlobal(1, 600)).toBe(0)      // début période 1
    expect(elapsedGlobal(1, 540)).toBe(60)     // 1 min jouée
    expect(elapsedGlobal(2, 600)).toBe(600)    // début période 2
    expect(elapsedGlobal(5, 300)).toBe(2400)   // début OT1 = 4*600
  })
  it('newId génère des ids uniques', () => {
    expect(newId()).not.toBe(newId())
  })
})
