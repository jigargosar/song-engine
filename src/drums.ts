export type EnergyLevel = 'low' | 'mid' | 'high' | 'peak'

export type DrumStep = 0 | 1
export type DrumPattern = readonly [
    DrumStep, DrumStep, DrumStep, DrumStep,
    DrumStep, DrumStep, DrumStep, DrumStep,
]

export interface DrumEvent {
    readonly time: number
    readonly vel: number
}

export function energyLevel(energy: number): EnergyLevel {
    if (energy < 0.25) return 'low'
    if (energy < 0.55) return 'mid'
    if (energy < 0.85) return 'high'
    return 'peak'
}

const KICK: Record<EnergyLevel, readonly DrumPattern[]> = {
    low:  [[1,0,0,0, 0,0,0,0], [1,0,0,0, 0,0,1,0], [0,0,0,0, 1,0,0,0]],
    mid:  [[1,0,0,0, 1,0,0,0], [1,0,0,0, 0,0,1,0], [1,0,1,0, 0,0,0,0]],
    high: [[1,0,0,0, 1,0,1,0], [1,0,1,0, 0,0,1,0], [1,0,0,1, 1,0,0,0]],
    peak: [[1,0,1,0, 1,0,1,0], [1,0,0,1, 1,0,1,0], [1,1,0,0, 1,0,1,0]],
}

const SNARE: Record<EnergyLevel, readonly DrumPattern[]> = {
    low:  [[0,0,0,0, 1,0,0,0], [0,0,0,0, 0,0,1,0], [0,0,0,0, 1,0,0,0]],
    mid:  [[0,0,0,0, 1,0,0,0], [0,0,0,0, 1,0,0,1], [0,0,1,0, 0,0,1,0]],
    high: [[0,0,0,0, 1,0,0,0], [0,0,0,0, 1,0,0,1], [0,0,1,0, 1,0,0,0]],
    peak: [[0,0,0,0, 1,0,0,1], [0,0,1,0, 1,0,0,1], [0,0,0,1, 1,0,1,0]],
}

const HAT: Record<EnergyLevel, readonly DrumPattern[]> = {
    low:  [[1,0,0,0, 0,0,0,0], [1,0,0,0, 1,0,0,0], [0,0,1,0, 0,0,1,0]],
    mid:  [[1,0,1,0, 1,0,1,0], [1,0,0,1, 1,0,0,1], [1,1,0,0, 1,1,0,0]],
    high: [[1,1,1,1, 1,1,1,0], [1,1,1,0, 1,1,1,1], [1,0,1,1, 1,0,1,1]],
    peak: [[1,1,1,1, 1,1,1,1], [1,1,1,1, 1,0,1,1], [1,0,1,1, 1,1,1,0]],
}

const SILENT: DrumPattern = [0, 0, 0, 0, 0, 0, 0, 0]

export function selectKickPattern(level: EnergyLevel, variant: number): DrumPattern {
    return KICK[level][variant % KICK[level].length] ?? SILENT
}

export function selectSnarePattern(level: EnergyLevel, variant: number): DrumPattern {
    return SNARE[level][variant % SNARE[level].length] ?? SILENT
}

export function selectHatPattern(level: EnergyLevel, variant: number): DrumPattern {
    return HAT[level][variant % HAT[level].length] ?? SILENT
}
