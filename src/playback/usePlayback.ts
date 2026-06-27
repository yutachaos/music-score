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
          s.stop()
          timing.current?.reset()
          begin()
        },
      },
    })
    await s.prime()
    const ctx = abcjs.synth.activeAudioContext()
    const beats = visualObj.getBeatsPerMeasure()
    const beatSec = visualObj.millisecondsPerMeasure() / beats / 1000

    // TimingCallbacks adds 16ms slop so beatCallback fires 16ms early.
    // Adding that offset back aligns ctx.currentTime with the actual audio beat.
    const BEAT_SLOP = 0.016
    begin = () => {
      if (synth.current !== s) return
      timing.current?.start()
      s.start()
      // Pre-schedule beat 0 click immediately so there's no gap at loop boundaries.
      // beatCallback fires via rAF and can be up to 16ms late; beat 0 would be silent
      // without this. beatCallback skips beat 0 to avoid a double click.
      if (metronome !== 'off') {
        const bus = clickBus.current!
        const t0 = ctx.currentTime + BEAT_SLOP
        if (metronome === 'downbeat') clickAt(ctx, bus, t0, true)
        else if (metronome === 'offbeat') clickAt(ctx, bus, t0 + beatSec / 2, false)
        // backbeat: beat 0 is not a backbeat beat, no click needed
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
      beatCallback: (beatNumber: number) => {
        if (metronome === 'off' || synth.current !== s) return
        // Beat 0 is pre-scheduled in begin() to avoid gap at loop boundaries.
        if (beatNumber === 0) return
        const bus = clickBus.current!
        const beatTime = ctx.currentTime + BEAT_SLOP
        const beatInMeasure = beatNumber % beats
        if (metronome === 'backbeat') {
          if (beatInMeasure === 1 || (beats >= 4 && beatInMeasure === 3))
            clickAt(ctx, bus, beatTime, false)
        } else if (metronome === 'offbeat') {
          clickAt(ctx, bus, beatTime + beatSec / 2, false)
        } else {
          clickAt(ctx, bus, beatTime, beatInMeasure === 0)
        }
      },
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
