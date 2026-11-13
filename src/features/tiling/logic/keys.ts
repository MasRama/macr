/** Modifier names GTK accepts, under one spelling each. */
const MODIFIERS: Record<string, string> = {
    primary: 'control',
    control: 'control',
    ctrl: 'control',
    ctl: 'control',
    shift: 'shift',
    shft: 'shift',
    alt: 'alt',
    mod1: 'alt',
    super: 'super',
    meta: 'meta',
    hyper: 'hyper',
};

/** One spelling for an accelerator: sorted modifiers and the key in lower case. */
export function normalizeAccelerator(accelerator: string): string {
    const modifiers: string[] = [];
    const key = accelerator.replace(/<([^>]+)>/g, (_match, name: string) => {
        const lower = name.toLowerCase();
        modifiers.push(MODIFIERS[lower] ?? lower);
        return '';
    });
    return [...new Set(modifiers)].sort().map((m) => `<${m}>`).join('') + key.trim().toLowerCase();
}

/** A GNOME keybinding's list without the accelerators Macr's own shortcuts use. */
export function withoutClashes(bindings: readonly string[], ours: readonly string[]): string[] {
    const taken = new Set(ours.map(normalizeAccelerator));
    return bindings.filter((binding) => !taken.has(normalizeAccelerator(binding)));
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((value, i) => value === b[i]);
}
