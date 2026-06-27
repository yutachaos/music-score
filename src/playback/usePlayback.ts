import { useCallback, useRef, useState } from 'react'
import abcjs, { type TuneObject } from 'abcjs'

export type MetronomeMode = 'off' | 'downbeat' | 'offbeat' | 'backbeat'

export interface PlayOptions {
  program?: number
  metronome?: MetronomeMode
  countIn?: boolean
  loop?: boolean
}

// oscillator beep scheduled on the synth's own AudioContext, so the clicks
// share the audio clock with the notes and cannot drift
function clickAt(ctx: AudioContext, out: GainNode, time: number, accent: boolean) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = accent ? 1600 : 1100
  gain.gain.setValueAtTime(0.4, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
  osc.connect(gain)
  gain.connect(out)
  osc.start(time)
  osc.stop(time + 0.06)
}

export function usePlayback() {
  const [playing, setPlaying] = useState(false)
  const synth = useRef<InstanceType<typeof abcjs.synth.CreateSynth> | null>(null)
  const timing = useRef<abcjs.TimingCallbacks | null>(null)
  const timer = useRef<number | null>(null)
  const clickBus = useRef<GainNode | null>(null)
  const highlighted = useRef<Element[]>([])

  function clearHighlight() {
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
  }

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    timing.current?.stop()
    timing.current = null
    synth.current?.stop()
    synth.current = null
    clickBus.current?.disconnect()
    clickBus.current = null
    for (const el of highlighted.current) el.classList.remove('playing')
    highlighted.current = []
    setPlaying(false)
  }, [])

  async function play(visualObj: TuneObject, opts: PlayOptions = {}) {
    stop()
    const { program = 0, metronome = 'off', countIn = false, loop = false } = opts
    const s = new abcjs.synth.CreateSynth()
    let begin!: () => void
    await s.init({
      visualObj,
      options: {
        program,
        // abcjs reads onEnded from the nested options, not the init root
        onEnded: () => {
          if (synth.current !== s || !loop) return
          timing.current?.reset()
          begin()
        },
      },
    })
    const { duration } = await s.prime()
    const ctx = abcjs.synth.activeAudioContext()
    const beats = visualObj.getBeatsPerMeasure()
    const beatSec = visualObj.millisecondsPerMeasure() / beats / 1000

    begin = () => {
      if (synth.current !== s) return
      const bus = clickBus.current!
      timing.current?.start()
      s.start()
      if (metronome !== 'off') {
        // Anchor after s.start() so click beat-0 aligns with note beat-0
        const anchor = ctx.currentTime
        if (metronome === 'backbeat') {
          for (let k = 0; k * beatSec < duration; k++) {
            const b = k % beats
            if (b === 1 || (beats >= 4 && b === 3))
              clickAt(ctx, bus, anchor + k * beatSec, false)
          }
        } else if (metronome === 'offbeat') {
          for (let k = 0; (k + 0.5) * beatSec < duration; k++)
            clickAt(ctx, bus, anchor + (k + 0.5) * beatSec, false)
        } else {
          for (let k = 0; k * beatSec < duration; k++) {
            const accent = k % beats === 0
            clickAt(ctx, bus, anchor + k * beatSec, accent)
          }
        }
      }
    }

    const startAll = () => {
      const bus = ctx.createGain()
      bus.connect(ctx.destination)
      clickBus.current?.disconnect()
      clickBus.current = bus
      if (countIn) {
        const t0 = ctx.currentTime
        for (let k = 0; k < beats; k++) clickAt(ctx, bus, t0 + k * beatSec, k === 0)
        timer.current = window.setTimeout(begin, beats * beatSec * 1000)
      } else {
        begin()
      }
    }

    const t = new abcjs.TimingCallbacks(visualObj, {
      eventCallback: (ev) => {
        clearHighlight()
        if (!ev) {
          if (!loop) setPlaying(false)
          return
        }
        const els = (ev.elements ?? []).flat() as Element[]
        for (const el of els) el.classList.add('playing')
        highlighted.current = els
      },
    })
    synth.current = s
    timing.current = t
    setPlaying(true)
    startAll()
  }

  return { playing, play, stop }
}
