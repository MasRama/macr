const LIGHTS = ['close', 'minimize', 'maximize'];

/**
 * A window button layout ("appmenu:minimize,maximize,close") with the macOS
 * traffic lights in front on the left: close, minimize, maximize. Any other
 * buttons (the app menu, the icon) stay on their side, after the lights.
 */
export function macLayout(layout: string): string {
    const [left = '', right = ''] = layout.split(':');
    const rest = (side: string) => side.split(',').map((name) => name.trim()).filter((name) => name && !LIGHTS.includes(name));
    return `${[...LIGHTS, ...rest(left)].join(',')}:${rest(right).join(',')}`;
}
