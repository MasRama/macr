/** A battery as UPower reports it, kind as UPower's kind string ("battery", "mouse", ...). */
export interface BatteryDevice {
    kind: string;
    /** 0 to 100. */
    percentage: number;
    present: boolean;
    /** True for the computer's own battery, false for a mouse's or headset's. */
    powerSupply: boolean;
    charging: boolean;
    name: string;
}

/** The macOS small Batteries widget holds four rings. */
export const BATTERIES_MAX = 4;

/** Kinds that are not a battery of their own. */
const NOT_BATTERIES = new Set(['unknown', 'line-power', 'ups', 'monitor', 'computer']);

/** The devices the widget shows: the computer's battery first, then the others by name. */
export function shownBatteries<T extends BatteryDevice>(devices: readonly T[]): T[] {
    const own = (device: T) => device.kind === 'battery' && device.powerSupply;
    return devices
        .filter((device) => device.present && !NOT_BATTERIES.has(device.kind))
        .sort((a, b) => Number(own(b)) - Number(own(a)) || a.name.localeCompare(b.name))
        .slice(0, BATTERIES_MAX);
}

export type BatteryLevel = 'normal' | 'low' | 'charging';

/** Green while charging or above 20%, red at 20% or less, as on macOS. */
export function batteryLevel(device: BatteryDevice): BatteryLevel {
    if (device.charging) return 'charging';
    return device.percentage <= 20 ? 'low' : 'normal';
}

const ICONS: Record<string, string[]> = {
    battery: ['computer-laptop-symbolic', 'computer-symbolic'],
    mouse: ['input-mouse-symbolic'],
    keyboard: ['input-keyboard-symbolic'],
    touchpad: ['input-touchpad-symbolic'],
    'gaming-input': ['input-gaming-symbolic'],
    pen: ['input-tablet-symbolic'],
    tablet: ['input-tablet-symbolic'],
    phone: ['phone-symbolic'],
    headset: ['audio-headset-symbolic', 'audio-headphones-symbolic'],
    headphones: ['audio-headphones-symbolic'],
    speakers: ['audio-speakers-symbolic'],
    'media-player': ['multimedia-player-symbolic'],
};

/** Icon names for a kind of device, best first. */
export function batteryIcon(kind: string): string[] {
    return ICONS[kind] ?? ['battery-symbolic'];
}
