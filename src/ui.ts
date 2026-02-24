import type { Song } from './song'
import { computeVolumes, dominantInstruments } from './dynamics'

export type PlaybackState = 'stopped' | 'playing' | 'paused'

// --- Pure: compute log data from Song ---

export interface LogEntry {
    readonly type: 'section-header' | 'bar-line'
    readonly text: string
}

export function buildLogEntries(song: Song): LogEntry[] {
    const entries: LogEntry[] = []
    let lastSection = ''

    for (const bar of song.bars) {
        if (bar.section !== lastSection) {
            entries.push({
                type: 'section-header',
                text: `\u2500\u2500 ${bar.section} \u2500`,
            })
            lastSection = bar.section
        }

        const vols = computeVolumes(bar.energy, song.ordering)
        const active = dominantInstruments(vols).join(' ')
        const eBar =
            '\u2588'.repeat(Math.round(bar.energy * 10)).padEnd(10, '\u2591')
        const text = `Bar ${String(bar.bar).padStart(2)}: ${eBar} ${String(bar.bpm).padStart(3)}bpm ${bar.numeral.padEnd(5)} ${bar.chordSymbol.padEnd(6)} ${active}`

        entries.push({ type: 'bar-line', text })
    }

    return entries
}

// --- Impure: DOM rendering ---

export interface BarElements {
    readonly elements: HTMLDivElement[]
}

export function renderSongHeader(container: HTMLElement, song: Song): void {
    const bpmMin = Math.min(...song.bpmCurve)
    const bpmMax = Math.max(...song.bpmCurve)

    const lines = [
        `Seed: ${song.seed}`,
        `Key: ${song.tonic} minor`,
        `Structure: ${song.structName}`,
        `Character: ${song.orderName} (${song.ordering.join(' \u2192 ')})`,
        `Phrase: ${song.phrase.join(' \u2192 ')}`,
        `Chords: ${song.chordSymbols.join(' \u2192 ')}`,
        `BPM: ${bpmMin}\u2013${bpmMax}  Bars: ${song.totalBars}`,
        '',
    ]

    for (const line of lines) {
        const div = document.createElement('div')
        div.textContent = line
        div.style.padding = '2px 4px'
        container.appendChild(div)
    }
}

export function renderLog(
    container: HTMLElement,
    entries: readonly LogEntry[],
): BarElements {
    const barElements: HTMLDivElement[] = []

    for (const entry of entries) {
        const div = document.createElement('div')
        div.textContent = entry.text

        if (entry.type === 'section-header') {
            div.className = 'section-header'
        } else {
            div.className = 'bar-line'
            barElements.push(div)
        }

        container.appendChild(div)
    }

    return { elements: barElements }
}

export function highlightBar(
    barElements: BarElements,
    activeIndex: number,
): void {
    for (let i = 0; i < barElements.elements.length; i++) {
        const el = barElements.elements[i]
        if (el === undefined) continue
        if (i === activeIndex) {
            el.classList.add('active')
            el.scrollIntoView({ block: 'nearest' })
        } else {
            el.classList.remove('active')
        }
    }
}

export function updateStatus(
    el: HTMLElement,
    song: Song,
    state: PlaybackState,
): void {
    const label = state.charAt(0).toUpperCase() + state.slice(1)
    el.textContent = `${label} \u2014 seed: ${song.seed} | ${song.tonic} minor | ${song.structName} | ${song.orderName}`
}

export function updateButtons(
    playBtn: HTMLButtonElement,
    pauseBtn: HTMLButtonElement,
    state: PlaybackState,
): void {
    playBtn.disabled = state === 'playing'
    pauseBtn.disabled = state === 'stopped'
    pauseBtn.textContent = state === 'paused' ? 'Resume' : 'Pause'
}
