import { Seed } from './rng'
import { generateSong } from './song'
import type { Song } from './song'
import { startPlayback } from './playback'
import type { PlaybackControls } from './playback'
import {
    buildLogEntries,
    renderSongHeader,
    renderLog,
    highlightBar,
    updateStatus,
    updateButtons,
} from './ui'
import type { BarElements, PlaybackState } from './ui'

// --- DOM (fail loud if missing) ---

function queryEl<T extends HTMLElement>(selector: string): T {
    const el = document.querySelector<T>(selector)
    if (!el) throw new Error(`Missing element: ${selector}`)
    return el
}

const dom = {
    log: queryEl<HTMLDivElement>('#log'),
    status: queryEl<HTMLDivElement>('#status'),
    playBtn: queryEl<HTMLButtonElement>('#btn-play'),
    pauseBtn: queryEl<HTMLButtonElement>('#btn-pause'),
    newBtn: queryEl<HTMLButtonElement>('#btn-new'),
    seedInput: queryEl<HTMLInputElement>('#seed-input'),
}

// --- State (ISI: can't be paused without controls, can't have barEls without song) ---

type AppState =
    | { tag: 'stopped' }
    | { tag: 'playing'; song: Song; controls: PlaybackControls; barEls: BarElements }
    | { tag: 'paused'; song: Song; controls: PlaybackControls; barEls: BarElements }

let appState: AppState = { tag: 'stopped' }

// --- Rendering (derived from state) ---

function render(state: AppState): void {
    const playbackState: PlaybackState = state.tag
    updateButtons(dom.playBtn, dom.pauseBtn, playbackState)

    switch (state.tag) {
        case 'stopped':
            dom.status.textContent = 'Stopped'
            break
        case 'playing':
        case 'paused':
            updateStatus(dom.status, state.song, playbackState)
            break
    }
}

// --- Seed resolution ---

function resolveSeed(): Seed {
    const val = dom.seedInput.value.trim()
    const seed = Seed(val ? parseInt(val, 10) : Date.now() % 100000)
    dom.seedInput.value = String(seed)
    return seed
}

// --- Rendering a song into the log ---

function renderSongLog(song: Song): BarElements {
    dom.log.innerHTML = ''
    renderSongHeader(dom.log, song)
    const entries = buildLogEntries(song)
    return renderLog(dom.log, entries)
}

// --- Actions ---

async function playSeed(seed: Seed): Promise<void> {
    // Stop any current playback
    if (appState.tag !== 'stopped') {
        appState.controls.stop()
    }

    dom.seedInput.value = String(seed)
    const song = generateSong(seed)
    const barEls = renderSongLog(song)

    const controls = await startPlayback(song, {
        onBarChange(barIndex) {
            highlightBar(barEls, barIndex)
        },
        onComplete() {
            appState = { tag: 'stopped' }
            render(appState)
        },
    })

    appState = { tag: 'playing', song, controls, barEls }
    render(appState)
}

function togglePause(): void {
    switch (appState.tag) {
        case 'stopped':
            return
        case 'playing':
            appState.controls.pause()
            appState = { ...appState, tag: 'paused' }
            break
        case 'paused':
            appState.controls.resume()
            appState = { ...appState, tag: 'playing' }
            break
    }
    render(appState)
}

// --- Wire up ---

dom.playBtn.addEventListener('click', () => {
    playSeed(resolveSeed()).catch(console.error)
})

dom.pauseBtn.addEventListener('click', togglePause)

dom.newBtn.addEventListener('click', () => {
    const seed = Seed(Date.now() % 100000)
    playSeed(seed).catch(console.error)
})

render(appState)
