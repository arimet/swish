import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressionChart } from './ProgressionChart'

describe('ProgressionChart', () => {
  it('rend un SVG avec deux polylignes', () => {
    const { container } = render(
      <ProgressionChart points={[{ t: 0, a: 0, b: 0 }, { t: 60, a: 2, b: 3 }]} width={400} height={200} />,
    )
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })
})
