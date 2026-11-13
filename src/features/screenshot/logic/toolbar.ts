/** GNOME's three capture types (its Selection, Screen and Window toggles). */
export type CaptureType = 'screen' | 'window' | 'selection';

/** The macOS toolbar's buttons. */
export type Choice = 'screen' | 'window' | 'selection' | 'record-screen' | 'record-selection';

/** GNOME's toggles: the capture type, and screencast (`_castButton`) or screenshot. */
export type Toggles = { type: CaptureType; cast: boolean };

/** What GNOME can do right now. */
export type Abilities = { windows: boolean; recording: boolean };

/** Left to right, as on macOS. */
export const CHOICES: Choice[] = ['screen', 'window', 'selection', 'record-screen', 'record-selection'];

/** The toggles a button sets. */
export function togglesFor(choice: Choice): Toggles {
    switch (choice) {
        case 'record-screen':
            return { type: 'screen', cast: true };
        case 'record-selection':
            return { type: 'selection', cast: true };
        default:
            return { type: choice, cast: false };
    }
}

/** The button GNOME's toggles light up. GNOME cannot record a window. */
export function choiceOf(toggles: Toggles): Choice {
    if (!toggles.cast) return toggles.type;
    return toggles.type === 'screen' ? 'record-screen' : 'record-selection';
}

export function isRecording(choice: Choice): boolean {
    return choice === 'record-screen' || choice === 'record-selection';
}

/** Window needs windows to pick; the record buttons need GNOME's screencast service. */
export function isAvailable(choice: Choice, abilities: Abilities): boolean {
    if (choice === 'window') return abilities.windows;
    if (isRecording(choice)) return abilities.recording;
    return true;
}
