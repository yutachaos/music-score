import type { NoteEvent, Score } from './types'

const KEY = 'music-score.scores'

export function loadScores(): Score[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  // scores saved before clef support lack the field
  return (JSON.parse(raw) as { scores: Score[] }).scores.map((s) => ({
    ...s,
    clef: s.clef ?? 'treble',
  }))
}

export function saveScores(scores: Score[]) {
  localStorage.setItem(KEY, JSON.stringify({ scores }))
}

// four whole rests so the editor shows 4 empty measures as input guidance.
// Marked as placeholders so the first user input replaces them (rather than
// appending after).
const PLACEHOLDER_MEASURES = 4
const guideEvents: NoteEvent[] = Array.from({ length: PLACEHOLDER_MEASURES }, () => ({
  kind: 'rest' as const,
  duration: 1 as const,
  placeholder: true,
}))

export function newScore(): Score {
  return {
    id: crypto.randomUUID(),
    title: 'New score',
    clef: 'treble',
    keySig: 'C',
    timeSig: '4/4',
    tempo: 100,
    events: guideEvents.map((e) => ({ ...e })),
  }
}

export function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
