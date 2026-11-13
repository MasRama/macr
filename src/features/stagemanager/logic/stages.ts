/**
 * Stage Manager's decisions, free of the shell. Each monitor has its own
 * stages: the world is one monitor's eligible windows (active workspace) in
 * most-recently-used order and the focused one; the controller turns the plan into minimize, unminimize
 * and activate calls, in that order: unminimize, focus, then minimize, so the
 * window Mutter would focus next is always one Stage Manager wants shown.
 */

export interface StageWindow {
    id: number;
    /** The app it belongs to (its stage). */
    app: string;
    minimized: boolean;
}

export interface World {
    /** Eligible windows, most recently used first. */
    windows: StageWindow[];
    /** The focused window (a dialog's root window), or null. */
    focus: number | null;
}

export interface StageState {
    /** The app in the middle of the screen. */
    centre: string | null;
    /** Apps, most recently in the centre first. */
    mru: string[];
    /** Windows Stage Manager minimized, oldest first: the stages' windows. */
    ours: number[];
    paused: boolean;
    /** The windows that showed when it paused. */
    pausedShowing: number[];
}

export type StageEvent =
    /** Turned on: the focused app stays, the others become stages. */
    | { type: 'enable' }
    /** The focused window changed. */
    | { type: 'focus' }
    /** A stage in the strip was clicked. */
    | { type: 'select'; app: string }
    /** Someone other than Stage Manager minimized a window. */
    | { type: 'minimized'; window: number }
    /** Someone other than Stage Manager brought a window back. */
    | { type: 'unminimized'; window: number }
    | { type: 'closed'; window: number }
    /** A new window showed for the first time. */
    | { type: 'created'; window: number }
    /** Another workspace became active, or windows moved between monitors. */
    | { type: 'workspace' }
    /** Show Desktop or the lock screen: ignore everything until resume. */
    | { type: 'pause' }
    | { type: 'resume' }
    /** Turned off: every window it minimized comes back. */
    | { type: 'disable' };

export interface Plan {
    state: StageState;
    unminimize: number[];
    /** The window to activate after unminimizing, before minimizing. */
    focus: number | null;
    minimize: number[];
}

export interface Stage {
    app: string;
    /** Up to three of its windows, most recent first. */
    windows: number[];
}

/** Windows shown per stage thumbnail. */
const WINDOWS_PER_STAGE = 3;

/** Apps whose windows are dialogs for other apps (file choosers and the like). */
const PORTALS = ['xdg-desktop-portal-gnome', 'xdg-desktop-portal-gtk', 'org.freedesktop.impl.portal.desktop.gnome', 'org.freedesktop.impl.portal.desktop.gtk'];

export interface WindowFacts {
    /** Meta.WindowType.NORMAL. */
    normal: boolean;
    skipTaskbar: boolean;
    onActiveWorkspace: boolean;
    /** Put on all workspaces by the user (not just for being on another monitor). */
    sticky: boolean;
    /** Always on top (picture in picture and the like). */
    above: boolean;
    /** Has a parent window; Mutter minimizes and shows it with its parent. */
    transient: boolean;
    app: string | null;
    wmClass?: string | null;
}

/** Whether Stage Manager handles a window at all. */
export function eligible(facts: WindowFacts): boolean {
    if (!facts.normal || facts.skipTaskbar || !facts.onActiveWorkspace) return false;
    if (facts.sticky || facts.above || facts.transient || !facts.app) return false;
    const names = [facts.app.replace(/\.desktop$/, ''), facts.wmClass ?? ''];
    return !names.some((name) => PORTALS.includes(name));
}

export function initialState(): StageState {
    return { centre: null, mru: [], ours: [], paused: false, pausedShowing: [] };
}

/** The stages for the strip, most recent first, at most `max`. */
export function stages(state: StageState, world: World, max: number): Stage[] {
    const ours = new Set(state.ours);
    const byApp = new Map<string, number[]>();
    for (const window of world.windows) {
        if (!window.minimized || !ours.has(window.id) || window.app === state.centre) continue;
        byApp.set(window.app, [...(byApp.get(window.app) ?? []), window.id]);
    }
    const order = [...state.mru.filter((app) => byApp.has(app)), ...[...byApp.keys()].filter((app) => !state.mru.includes(app))];
    return order.slice(0, Math.max(0, max)).map((app) => ({ app, windows: byApp.get(app)!.slice(0, WINDOWS_PER_STAGE) }));
}

/** What to do about `event`. */
export function step(state: StageState, world: World, event: StageEvent): Plan {
    if (event.type === 'disable') {
        return { state: { ...initialState() }, unminimize: [...state.ours], focus: world.focus, minimize: [] };
    }
    if (state.paused) {
        if (event.type !== 'resume') return idle(state);
        return resume(state, world);
    }
    if (event.type === 'resume') return idle(state);

    const s: StageState = { ...state, mru: withWorldApps(state.mru, world), ours: [...state.ours] };
    switch (event.type) {
    case 'pause':
        return idle({ ...s, paused: true, pausedShowing: showing(world).map((w) => w.id) });
    case 'enable':
        return settle({ ...s, centre: null, ours: [] }, world);
    case 'focus':
    case 'created':
    case 'workspace':
        return settle(s, world);
    case 'select':
        return bringIn(s, world, event.app, true);
    case 'minimized': {
        s.ours = s.ours.filter((id) => id !== event.window);
        const window = find(world, event.window);
        if (window && window.app === s.centre && !hasShowing(world, s.centre)) return promote(s, world);
        return idle(s);
    }
    case 'unminimized': {
        const window = find(world, event.window);
        if (!s.ours.includes(event.window)) return idle(s);
        s.ours = s.ours.filter((id) => id !== event.window);
        if (!window || window.app === s.centre) return idle(s);
        // Alt+Tab, the dock or Mission Control: the focus follows, so do not move it.
        return bringIn(s, world, window.app, false);
    }
    case 'closed':
        s.ours = s.ours.filter((id) => id !== event.window);
        if (s.centre === null || hasShowing(world, s.centre)) return idle(s);
        if (focused(world)) return settle(s, world);
        return promote(s, world);
    }
}

function idle(state: StageState): Plan {
    return { state, unminimize: [], focus: null, minimize: [] };
}

function find(world: World, id: number): StageWindow | undefined {
    return world.windows.find((w) => w.id === id);
}

function showing(world: World): StageWindow[] {
    return world.windows.filter((w) => !w.minimized);
}

function hasShowing(world: World, app: string): boolean {
    return world.windows.some((w) => w.app === app && !w.minimized);
}

/** The focused window, when it is eligible and showing. */
function focused(world: World): StageWindow | null {
    const window = world.focus === null ? undefined : find(world, world.focus);
    return window && !window.minimized ? window : null;
}

/** Apps Stage Manager has not seen yet go last, in the world's order. */
function withWorldApps(mru: string[], world: World): string[] {
    const apps = [...mru];
    for (const window of world.windows) if (!apps.includes(window.app)) apps.push(window.app);
    return apps;
}

function toFront(mru: string[], app: string): string[] {
    return [app, ...mru.filter((a) => a !== app)];
}

/**
 * The centre follows the focus (else stays, else the most recent showing
 * app); every other showing window goes to the strip, and the centre's
 * stage windows come back. A centre left with nothing showing stays, so the
 * close or minimize that emptied it can still promote a stage.
 */
function settle(state: StageState, world: World): Plan {
    const focus = focused(world);
    let centre = state.centre;
    if (focus) centre = focus.app;
    else if (centre === null || !hasShowing(world, centre)) centre = showing(world)[0]?.app ?? centre;
    if (centre === null) return idle({ ...state, centre: null });
    return bringIn(state, world, centre, false);
}

/** Makes `app` the centre: its stage windows come back, the other showing windows go. */
function bringIn(state: StageState, world: World, app: string, focus: boolean): Plan {
    const ours = new Set(state.ours);
    const unminimize = world.windows.filter((w) => w.app === app && w.minimized && ours.has(w.id)).map((w) => w.id);
    const minimize = showing(world).filter((w) => w.app !== app).map((w) => w.id);
    const kept = state.ours.filter((id) => !unminimize.includes(id));
    const target = focus ? (unminimize[0] ?? showing(world).find((w) => w.app === app)?.id ?? null) : null;
    return {
        state: { ...state, centre: app, mru: toFront(state.mru, app), ours: [...kept, ...minimize] },
        unminimize,
        focus: target,
        minimize,
    };
}

/** The centre emptied: the most recent stage comes in, or the centre stays empty. */
function promote(state: StageState, world: World): Plan {
    const next = stages({ ...state, centre: null }, world, 1)[0];
    if (!next) return idle({ ...state, centre: null });
    return bringIn(state, world, next.app, true);
}

/**
 * Windows hidden while paused (Show Desktop) become stages; stage windows
 * brought back meanwhile are not stages any more. Nothing moves otherwise.
 */
function resume(state: StageState, world: World): Plan {
    const ours = state.ours.filter((id) => {
        const window = find(world, id);
        return !window || window.minimized;
    });
    for (const id of state.pausedShowing) {
        if (find(world, id)?.minimized && !ours.includes(id)) ours.push(id);
    }
    const s: StageState = { ...state, paused: false, pausedShowing: [], ours, mru: withWorldApps(state.mru, world) };
    if (s.centre !== null && !hasShowing(world, s.centre)) s.centre = null;
    return settle(s, world);
}
