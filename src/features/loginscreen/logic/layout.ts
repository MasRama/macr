import { lockLayout, type Box } from '../../lockscreen/logic/layout.js';

/** Preferred [width, height] of each part, in real pixels. */
export interface LoginSizes {
    clock: [number, number];
    /** GNOME's user list with its "Not listed?" button. */
    users: [number, number];
    /** GNOME's auth prompt: avatar, name and password field. */
    prompt: [number, number];
}

export interface LoginBoxes {
    clock: Box;
    users: Box;
    prompt: Box;
}

/**
 * The macOS login screen, laid out like the lock screen: the date and big
 * time near the top, and the users low in the middle. Picking a user swaps
 * the list for the prompt, so both start at the same height and the avatar
 * stays where it was.
 */
export function loginLayout(width: number, height: number, sizes: LoginSizes, scale: number): LoginBoxes {
    const tallest: [number, number] = [sizes.prompt[0], Math.max(sizes.prompt[1], sizes.users[1])];
    const lock = lockLayout(width, height, { clock: sizes.clock, notifications: [0, 0], prompt: tallest, buttons: null }, scale);
    const top = lock.prompt.y1;
    const centred = ([w, h]: [number, number]): Box => {
        const x1 = Math.floor((width - w) / 2);
        return { x1, y1: top, x2: x1 + w, y2: top + h };
    };
    return { clock: lock.clock, users: centred(sizes.users), prompt: centred(sizes.prompt) };
}

