/** An enabled extension that fights a Macr module that is on. */
export interface Clash {
    uuid: string;
    /** The extension's own name, not translated. */
    name: string;
    /** The Macr setting whose module it fights. */
    setting: string;
    /** Only part of it clashes (a feature the user can turn off in it). */
    partial: boolean;
}

interface Known {
    name: string;
    settings: readonly string[];
    partial?: boolean;
}

/**
 * Extensions known to draw over the same part of the shell as a Macr module.
 * Each lists the Macr settings it fights, most important first.
 */
const KNOWN: Record<string, Known> = {
    'dash-to-dock@micxgx.gmail.com': { name: 'Dash to Dock', settings: ['dock-enabled'] },
    'ubuntu-dock@ubuntu.com': { name: 'Ubuntu Dock', settings: ['dock-enabled'] },
    'dash-to-panel@jderose9.github.com': { name: 'Dash to Panel', settings: ['dock-enabled', 'menubar-enabled'] },
    'zorin-taskbar@zorinos.com': { name: 'Zorin Taskbar', settings: ['dock-enabled'] },
    'compiz-alike-magic-lamp-effect@hermes83.github.com': { name: 'Magic Lamp', settings: ['dock-genie'] },
    'zorin-magic-lamp-effect@zorinos.com': { name: 'Zorin Magic Lamp Effect', settings: ['dock-genie'] },
    'just-perfection-desktop@just-perfection': { name: 'Just Perfection', settings: ['menubar-enabled', 'dock-enabled'] },
    'blur-my-shell@aunetx': { name: 'Blur my Shell', settings: ['menubar-enabled'], partial: true },
    'rounded-window-corners@fxgn': { name: 'Rounded Window Corners', settings: ['window-corners-enabled'] },
    'rounded-window-corners@yilozt': { name: 'Rounded Window Corners', settings: ['window-corners-enabled'] },
    'tilingshell@ferrarodomenico.com': { name: 'Tiling Shell', settings: ['tiling-enabled'] },
    'zorin-tiling-shell@zorinos.com': { name: 'Zorin Tiling Shell', settings: ['tiling-enabled'] },
    'tiling-assistant@leleat-on-github': { name: 'Tiling Assistant', settings: ['tiling-enabled'] },
};

/**
 * The enabled extensions that clash with a Macr module that is on, in the
 * order they are enabled. `isOn` answers false for settings Macr does not
 * have (yet), so their clashes are left out.
 */
export function clashes(enabled: readonly string[], isOn: (setting: string) => boolean): Clash[] {
    const found: Clash[] = [];
    for (const uuid of new Set(enabled)) {
        const known = KNOWN[uuid];
        const setting = known?.settings.find(isOn);
        if (!known || !setting) continue;
        found.push({ uuid, name: known.name, setting, partial: known.partial ?? false });
    }
    return found;
}
