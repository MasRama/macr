// The battery menu's lines, from UPower's display device.

/** UPower's device states. */
export enum BatteryState {
    UNKNOWN = 0,
    CHARGING = 1,
    DISCHARGING = 2,
    EMPTY = 3,
    FULLY_CHARGED = 4,
    PENDING_CHARGE = 5,
    PENDING_DISCHARGE = 6,
}

export interface BatteryReading {
    percentage: number;
    state: BatteryState;
    /** Seconds; 0 while UPower does not know. */
    timeToEmpty: number;
    timeToFull: number;
}

export type BatteryTime =
    | { kind: 'remaining' | 'until-full'; value: string }
    | { kind: 'calculating' | 'charged' | 'not-charging' };

export interface BatteryStatus {
    percent: string;
    /** What powers the computer. */
    source: 'battery' | 'adapter';
    time: BatteryTime | null;
}

/** Seconds as h:mm. */
export function clockTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export function batteryStatus(reading: BatteryReading): BatteryStatus {
    const { state } = reading;
    const onBattery = state === BatteryState.DISCHARGING || state === BatteryState.EMPTY || state === BatteryState.PENDING_DISCHARGE;
    return { percent: `${Math.round(reading.percentage)}%`, source: onBattery ? 'battery' : 'adapter', time: timeOf(reading) };
}

function timeOf({ state, timeToEmpty, timeToFull }: BatteryReading): BatteryTime | null {
    switch (state) {
        case BatteryState.DISCHARGING:
            return timeToEmpty > 0 ? { kind: 'remaining', value: clockTime(timeToEmpty) } : { kind: 'calculating' };
        case BatteryState.CHARGING:
            return timeToFull > 0 ? { kind: 'until-full', value: clockTime(timeToFull) } : { kind: 'calculating' };
        case BatteryState.FULLY_CHARGED:
            return { kind: 'charged' };
        case BatteryState.PENDING_CHARGE:
            return { kind: 'not-charging' };
        default:
            return null;
    }
}
