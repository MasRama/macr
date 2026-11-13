// Shake the pointer to find it, as on macOS: a quick back-and-forth wiggle.

/** Only this recent movement counts. */
const WINDOW_MS = 700;
/** Logical px a stroke travels before turning back counts. */
const MIN_STROKE = 60;
/** Turns within the window that make a shake: five strokes, left and right. */
const TURNS = 4;

interface Sample {
    t: number;
    x: number;
    y: number;
}

/** How many times `values` turn back after a stroke of at least MIN_STROKE. */
export function turns(values: readonly number[]): number {
    if (values.length < 2) return 0;
    let count = 0;
    let start = values[0];
    let extreme = values[0];
    let direction = 0;
    for (const value of values.slice(1)) {
        if (direction === 0) {
            if (Math.abs(value - start) >= MIN_STROKE) {
                direction = Math.sign(value - start);
                extreme = value;
            } else if (Math.abs(value - start) > Math.abs(extreme - start)) {
                extreme = value;
            }
            continue;
        }
        if ((value - extreme) * direction > 0) {
            extreme = value;
        } else if (Math.abs(extreme - value) >= MIN_STROKE) {
            count++;
            start = extreme;
            extreme = value;
            direction = -direction;
        }
    }
    return count;
}

/** Feeds on pointer motion and tells when it was shaken, sideways or up and down. */
export class ShakeDetector {
    private samples: Sample[] = [];

    /** Adds the pointer at `x`, `y` at `t` ms; true while the last moments were a shake. */
    push(t: number, x: number, y: number): boolean {
        this.samples.push({ t, x, y });
        this.samples = this.samples.filter((sample) => t - sample.t <= WINDOW_MS);
        return turns(this.samples.map((s) => s.x)) >= TURNS || turns(this.samples.map((s) => s.y)) >= TURNS;
    }

    reset(): void {
        this.samples = [];
    }
}
