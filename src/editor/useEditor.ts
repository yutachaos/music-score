import { useRef, useState } from 'react'
import type { NoteEvent, Pitch, Score } from '../model/types'
import { diatonicToPitch, pitchToDiatonic } from '../model/pitch'

export function useEditor(initial: Score) {
  const [score, setScore] = useState(initial)
  const [selected, setSelected] = useState<number | null>(null)
  const past = useRef<NoteEvent[][]>([])

  function commit(events: NoteEvent[]) {
    past.current.push(score.events)
    setScore((s) => ({ ...s, events }))
  }

  function insertEvent(ev: NoteEvent) {
    const at = selected === null ? score.events.length : selected + 1
    commit([...score.events.slice(0, at), ev, ...score.events.slice(at)])
    setSelected(at)
  }

  function deleteSelected() {
    if (selected === null) return
    commit(score.events.filter((_, i) => i !== selected))
    setSelected(null)
  }

  function movePitch(delta: number) {
    if (selected === null) return
    const ev = score.events[selected]
    if (ev.kind !== 'note') return
    const pitch: Pitch = {
      ...diatonicToPitch(pitchToDiatonic(ev.pitch!) + delta),
      ...(ev.pitch!.accidental && { accidental: ev.pitch!.accidental }),
    }
    commit(score.events.map((e, i) => (i === selected ? { ...e, pitch } : e)))
  }

  function moveSelection(delta: number) {
    if (score.events.length === 0) return
    setSelected((s) => {
      const next = (s === null ? score.events.length : s) + delta
      return Math.max(0, Math.min(score.events.length - 1, next))
    })
  }

  function undo() {
    const prev = past.current.pop()
    if (!prev) return
    setScore((s) => ({ ...s, events: prev }))
    setSelected(null)
  }

  function setMeta(meta: Partial<Pick<Score, 'title' | 'keySig' | 'timeSig' | 'tempo'>>) {
    setScore((s) => ({ ...s, ...meta }))
  }

  function replaceScore(next: Score) {
    setScore(next)
    setSelected(null)
    past.current = []
  }

  return {
    score,
    selected,
    setSelected,
    insertEvent,
    deleteSelected,
    movePitch,
    moveSelection,
    undo,
    setMeta,
    replaceScore,
  }
}

export type Editor = ReturnType<typeof useEditor>
