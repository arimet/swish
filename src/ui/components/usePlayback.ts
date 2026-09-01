/**
 * Running a play: the position, the transport, and the three rules that keep a loop
 * from misbehaving.
 *
 * It was the viewer's, and it is now shared with the editor, which plays a play in
 * place rather than sending the coach to another screen. A second copy of this loop
 * would have been a second place to get "stop at the end unless looping" wrong.
 */
import { useEffect, useState } from 'react'
import { transitions } from '../../domain/anim'
import type { Play } from '../../domain/plays'

/** A transition lasts a second and a half, twice that in slow motion. It is not
 *  adjustable: 1.5 s lets a movement be read without testing anyone's patience. */
const STEP_MS = 1500

/** The loop's tick. Twenty frames a second are enough for a sliding marker, and a
 *  timer can be driven from a test — which `requestAnimationFrame` cannot. */
const TICK_MS = 50

/** Is the system asking for less motion? Read when playback starts; this is not a
 *  comfort, it is the only correct way to treat someone motion disturbs. */
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function usePlayback(play: Play | null | undefined) {
  // Progress, in fractional steps: 1.5 is halfway from the second step to the
  // third. One number for the slider, the half-screens and the animation.
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(false)
  const [slow, setSlow] = useState(false)
  const last = play ? transitions(play) : 0

  useEffect(() => {
    if (!playing) return
    const duration = slow ? STEP_MS * 2 : STEP_MS
    const jump = reducedMotion()
    const tick = jump ? duration : TICK_MS
    const iv = window.setInterval(() => setPos((p) => {
      const next = jump ? Math.floor(p) + 1 : p + tick / duration
      if (next < last) return next
      // We land exactly on the last step before looping: otherwise it is never
      // seen.
      if (p < last) return last
      return looping ? 0 : last
    }), tick)
    return () => clearInterval(iv)
  }, [playing, slow, looping, last])

  // At the end without looping, playback stops on its own.
  useEffect(() => { if (playing && !looping && pos >= last) setPlaying(false) }, [playing, looping, pos, last])

  // Tab in the background: we cut. An animation that keeps running drains the
  // battery and ends up somewhere unexpected on return.
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  /**
   * The neighbouring step **in the direction of the gesture**, not the neighbour of
   * the rounding. From a fractional position — paused mid-transition, slider released
   * off a notch — `Math.round` has already "pre-advanced" by half a step, and adding
   * 1 would skip a whole step. A coach who pauses to comment and then taps "next"
   * must not watch the play stride over a stage.
   */
  const go = (delta: number) => {
    setPlaying(false)
    const target = delta > 0 ? Math.floor(pos) + 1 : Math.ceil(pos) - 1
    setPos(Math.min(last, Math.max(0, target)))
  }

  const start = () => {
    // Restarting from the end means replaying: otherwise the button would do
    // nothing.
    if (pos >= last) setPos(0)
    setPlaying(true)
  }

  return { pos, setPos, playing, setPlaying, looping, setLooping, slow, setSlow, last, go, start }
}
