export interface Box {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/** Preferred [width, height] of each part, in real pixels. */
export interface LockSizes {
    clock: [number, number];
    notifications: [number, number];
    prompt: [number, number];
    buttons: [number, number] | null;
}

export interface LockBoxes {
    clock: Box;
    notifications: Box;
    prompt: Box;
    buttons: Box | null;
}

function centred(width: number, y: number, [w, h]: [number, number]): Box {
    const x1 = Math.floor((width - w) / 2);
    return { x1, y1: y, x2: x1 + w, y2: y + h };
}

/**
 * The macOS lock screen on one monitor of width x height: the date and big
 * time near the top, notifications under them, and the user (avatar, name,
 * then the password field) low in the middle. The prompt keeps its top edge
 * where it is as the password field fades in, so the avatar does not move.
 * Login options stay at the bottom right, as in GNOME.
 */
export function lockLayout(width: number, height: number, sizes: LockSizes, scale: number): LockBoxes {
    const gap = 24 * scale;
    const clock = centred(width, Math.round(height * 0.07), sizes.clock);

    const margin = Math.round(height * 0.04);
    const promptTop = Math.max(clock.y2 + gap, Math.min(Math.round(height * 0.7), height - margin - sizes.prompt[1]));
    const prompt = centred(width, promptTop, sizes.prompt);

    const room = Math.max(0, promptTop - gap - (clock.y2 + gap));
    const notifications = centred(width, clock.y2 + gap, [sizes.notifications[0], Math.min(sizes.notifications[1], room)]);

    const buttons = sizes.buttons && {
        x1: width - sizes.buttons[0],
        y1: height - sizes.buttons[1],
        x2: width,
        y2: height,
    };
    return { clock, notifications, prompt, buttons };
}
