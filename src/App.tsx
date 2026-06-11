import { useEffect, useRef, useState } from 'react'
import type { TuneObject } from 'abcjs'
import { scoreToAbcWithRanges, type NoteNameStyle } from './model/abc'
import { staffPitch } from './model/pitch'
import type { Accidental, Duration, Score } from './model/types'
import { ScoreView } from './editor/ScoreView'
import { Palette } from './editor/Palette'
import { useEditor } from './editor/useEditor'
import { usePlayback } from './playback/usePlayback'
import { download, loadScores, newScore, saveScores } from './model/store'
import { OmrPage } from './omr/OmrPage'
import type { NoteEvent } from './model/types'

const initialScores = (() => {
  const stored = loadScores()
  return stored.length > 0 ? stored : [newScore()]
})()

export default function App() {
  const [storedScores, setStoredScores] = useState<Score[]>(initialScores)
  const editor = useEditor(initialScores[0])
  const [duration, setDuration] = useState<Duration>(4)
  const [dotted, setDotted] = useState(false)
  const [accidental, setAccidental] = useState<Accidental | ''>('')
  const [noteNames, setNoteNames] = useState<NoteNameStyle>('off')
  const [transpose, setTranspose] = useState(0)
  const playback = usePlayback()
  const visualRef = useRef<TuneObject | null>(null)

  const { score } = editor
  const { abc, eventRanges } = scoreToAbcWithRanges(score, {
    noteNames,
    nameTranspose: transpose,
  })

  const stopPlayback = playback.stop
  useEffect(() => stopPlayback, [abc, transpose, stopPlayback])

  // current edits merged into the list; persisted by the effect below
  const scores = storedScores.map((s) => (s.id === score.id ? score : s))

  useEffect(() => {
    saveScores(scores)
  }, [scores])

  function switchScore(id: string) {
    const found = scores.find((s) => s.id === id)
    if (!found) return
    setStoredScores(scores)
    editor.replaceScore(found)
  }

  function addScore() {
    const s = newScore()
    setStoredScores([...scores, s])
    editor.replaceScore(s)
  }

  function deleteScore() {
    if (!window.confirm(`Delete "${score.title}"?`)) return
    const rest = scores.filter((s) => s.id !== score.id)
    const next = rest.length > 0 ? rest : [newScore()]
    setStoredScores(next)
    editor.replaceScore(next[0])
  }

  function importOmr(events: NoteEvent[], clef: Score['clef']) {
    const s = { ...newScore(), title: 'Scan score', clef, events }
    setStoredScores([...scores, s])
    editor.replaceScore(s)
  }

  function importJson(file: File) {
    file.text().then((text) => {
      const imported = JSON.parse(text) as Score
      const s: Score = { ...imported, clef: imported.clef ?? 'treble', id: crypto.randomUUID() }
      setStoredScores([...scores, s])
      editor.replaceScore(s)
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        editor.undo()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        editor.movePitch(1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        editor.movePitch(-1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        editor.moveSelection(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        editor.moveSelection(1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        editor.deleteSelected()
      } else if (e.key === 't') {
        editor.toggleTie()
      } else if (e.key === 'Escape') {
        editor.setSelected(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function handleStaffClick(steps: number) {
    const pitch = staffPitch(steps, score.clef)
    editor.insertEvent({
      kind: 'note',
      pitch: accidental ? { ...pitch, accidental } : pitch,
      duration,
      ...(dotted && { dotted }),
    })
  }

  return (
    <main>
      <header>
        <h1>Music Score</h1>
        <input
          value={score.title}
          onChange={(e) => editor.setMeta({ title: e.target.value })}
          aria-label="Title"
        />
      </header>
      <div className="scores-bar">
        <label>
          Score
          <select value={score.id} onChange={(e) => switchScore(e.target.value)}>
            {scores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addScore}>New</button>
        <button onClick={deleteScore}>Delete</button>
        <button onClick={() => download(`${score.title}.json`, JSON.stringify(score, null, 2), 'application/json')}>
          Export JSON
        </button>
        <button onClick={() => download(`${score.title}.abc`, abc, 'text/plain')}>Export ABC</button>
        <label className="file-button">
          Import JSON
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importJson(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <Palette
        duration={duration}
        onDuration={setDuration}
        dotted={dotted}
        onDotted={setDotted}
        accidental={accidental}
        onAccidental={setAccidental}
        clef={score.clef}
        onClef={(clef) => editor.setMeta({ clef })}
        keySig={score.keySig}
        onKeySig={(keySig) => editor.setMeta({ keySig })}
        timeSig={score.timeSig}
        onTimeSig={(timeSig) => editor.setMeta({ timeSig })}
        onInsertRest={() =>
          editor.insertEvent({ kind: 'rest', duration, ...(dotted && { dotted }) })
        }
        tieActive={editor.selected !== null && !!score.events[editor.selected]?.tie}
        onToggleTie={editor.toggleTie}
      />
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => {
            if (playback.playing) playback.stop()
            else if (visualRef.current) playback.play(visualRef.current)
          }}
        >
          {playback.playing ? '■ Stop' : '▶ Play'}
        </button>
        <label>
          Tempo {score.tempo}
          <input
            type="range"
            min={40}
            max={220}
            value={score.tempo}
            onChange={(e) => editor.setMeta({ tempo: Number(e.target.value) })}
          />
        </label>
        <label>
          Transpose {transpose > 0 ? `+${transpose}` : transpose}
          <input
            type="range"
            min={-12}
            max={12}
            value={transpose}
            onChange={(e) => setTranspose(Number(e.target.value))}
          />
        </label>
        <label>
          Note names
          <select value={noteNames} onChange={(e) => setNoteNames(e.target.value as NoteNameStyle)}>
            <option value="off">Off</option>
            <option value="doremi">Do-re-mi</option>
            <option value="cde">CDE</option>
          </select>
        </label>
      </div>
      <p className="hint">
        Click the staff to insert a note (after the selected one) / ↑↓: pitch / ←→: move selection /
        t: tie / Delete: remove / Ctrl+Z: undo / Esc: deselect
      </p>
      <div className="score-card">
        <ScoreView
          abc={abc}
          eventRanges={eventRanges}
          selected={editor.selected}
          transpose={transpose}
          onSelectEvent={editor.setSelected}
          onStaffClick={handleStaffClick}
          onRender={(v) => {
            visualRef.current = v
          }}
        />
      </div>
      <OmrPage onImport={importOmr} />
    </main>
  )
}
