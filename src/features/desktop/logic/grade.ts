/** How the wallpaper is drawn at a time of day: a multiplier, a warm (+) or cool (-) shift, a saturation multiplier. */
export interface Grade {
    brightness: number;
    warmth: number;
    saturation: number;
}

export const DAY: Grade = { brightness: 1, warmth: 0, saturation: 1 };
export const NIGHT: Grade = { brightness: 0.62, warmth: -0.1, saturation: 0.8 };
const DAWN: Grade = { brightness: 0.86, warmth: 0.12, saturation: 0.95 };
const GOLDEN: Grade = { brightness: 0.96, warmth: 0.16, saturation: 1.08 };
const DUSK: Grade = { brightness: 0.74, warmth: 0.02, saturation: 0.9 };

export { sunTimes } from '../../../shared/logic/sun.js';

/** The keyframes of a day, in hours: night, dawn at sunrise, day, golden hour, dusk, night. */
function keyframes(sunrise: number, sunset: number): [number, Grade][] {
    return [
        [sunrise - 1, NIGHT],
        [sunrise, DAWN],
        [sunrise + 1.5, DAY],
        [sunset - 1.5, DAY],
        [sunset - 0.5, GOLDEN],
        [sunset + 0.75, DUSK],
        [sunset + 1.75, NIGHT],
    ];
}

function mix(a: Grade, b: Grade, t: number): Grade {
    return {
        brightness: a.brightness + (b.brightness - a.brightness) * t,
        warmth: a.warmth + (b.warmth - a.warmth) * t,
        saturation: a.saturation + (b.saturation - a.saturation) * t,
    };
}

/** The grade at `hour` (0–24), between the keyframes around it; the night wraps past midnight. */
export function gradeAt(hour: number, sunrise: number, sunset: number): Grade {
    const frames = keyframes(sunrise, sunset);
    const first = frames[0][0];
    // Hours from the first keyframe, wrapped to one day.
    const at = (((hour - first) % 24) + 24) % 24;
    const points: [number, Grade][] = [...frames.map(([time, grade]): [number, Grade] => [time - first, grade]), [24, frames[0][1]]];
    for (let i = 0; i < points.length - 1; i++) {
        const [start, from] = points[i];
        const [end, to] = points[i + 1];
        if (at >= start && at <= end) {
            if (from === to) return { ...from };
            const t = end > start ? (at - start) / (end - start) : 0;
            // Eased, so a change slows into each keyframe.
            return mix(from, to, t * t * (3 - 2 * t));
        }
    }
    return { ...NIGHT };
}
