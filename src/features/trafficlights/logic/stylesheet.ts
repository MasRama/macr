/** The stylesheet Macr writes next to the user's gtk.css. */
export const STYLESHEET = 'macr-traffic-lights.css';

/** The line Macr puts at the top of gtk.css; the marker finds it again. */
export const IMPORT = `@import url("${STYLESHEET}"); /* macr */`;

const LINK_MARK = '/* macr-link ';

/**
 * What a gtk.css is: missing, a file, or a symbolic link (themes such as
 * MacTahoe link it to their own stylesheet). Writing through a link would
 * change the theme's file, so a link is replaced by a file that imports its
 * target, and put back afterwards.
 */
export type UserCss =
    | { kind: 'missing' }
    | { kind: 'file'; text: string }
    /** uri: the target as a file URI, needed only to import it. */
    | { kind: 'link'; target: string; uri?: string };

/** The gtk.css text with Macr's stylesheet imported first. */
export function withImport(css: UserCss): string {
    switch (css.kind) {
        case 'missing':
            return `${IMPORT}\n`;
        case 'file':
            return css.text.split('\n').includes(IMPORT) ? css.text : `${IMPORT}\n${css.text}`;
        case 'link':
            return `${IMPORT}\n@import url("${css.uri ?? css.target}"); ${LINK_MARK}${css.target} */\n`;
    }
}

/**
 * gtk.css as it was before withImport: Macr's line taken out, a link put
 * back when nothing else was added since, and no file when nothing is left.
 */
export function withoutImport(text: string): UserCss {
    const lines = text.split('\n').filter((line) => line !== IMPORT);
    const link = lines.find((line) => line.includes(LINK_MARK));
    const others = lines.filter((line) => line !== link && line.trim() !== '');
    if (link && others.length === 0) {
        const target = link.slice(link.indexOf(LINK_MARK) + LINK_MARK.length, link.lastIndexOf(' */'));
        return { kind: 'link', target };
    }
    if (!link && others.length === 0) return { kind: 'missing' };
    return { kind: 'file', text: lines.join('\n') };
}

type Light = 'close' | 'minimize' | 'maximize';

// The macOS colours: face, rim, pressed face, symbol.
const COLOURS: Record<Light, [string, string, string, string]> = {
    close: ['#ff5f57', '#e0443e', '#bf4942', '#4d0000'],
    minimize: ['#febc2e', '#dea123', '#bf8e22', '#995700'],
    maximize: ['#28c840', '#1aab29', '#1d9731', '#006500'],
};

const SYMBOLS: Record<Light, (colour: string) => string> = {
    close: (c) => `<path d="M3.9 3.9l4.2 4.2M8.1 3.9l-4.2 4.2" stroke="${c}" stroke-width="1.1" stroke-linecap="round"/>`,
    minimize: (c) => `<path d="M3.2 6h5.6" stroke="${c}" stroke-width="1.1" stroke-linecap="round"/>`,
    // Full screen: two corners pointing out.
    maximize: (c) => `<path d="M3.4 3.4h4.1L3.4 7.5zM8.6 8.6H4.5l4.1-4.1z" fill="${c}"/>`,
};

type State = 'rest' | 'hover' | 'pressed' | 'backdrop';

/**
 * One light as an SVG of the given size in pixels. Chrome stretches a
 * background image bigger than its title bar button to fill the button, so
 * the light is drawn at 12px, and at 24px for screens scaled up.
 */
export function lightSvg(light: Light, state: State, size = 12): string {
    const [face, rim, pressed, symbol] = COLOURS[light];
    const circle = state === 'backdrop'
        ? '<circle cx="6" cy="6" r="5.75" fill="#808080" fill-opacity=".38" stroke="#000" stroke-opacity=".08" stroke-width=".5"/>'
        : `<circle cx="6" cy="6" r="5.75" fill="${state === 'pressed' ? pressed : face}" stroke="${rim}" stroke-width=".5"/>`;
    const mark = state === 'hover' || state === 'pressed' ? SYMBOLS[light](symbol) : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12">${circle}${mark}</svg>`;
}

/** The folder next to the stylesheet holding the lights' SVGs. */
export const ASSETS = 'macr-traffic-lights';

const STATES: State[] = ['rest', 'hover', 'pressed', 'backdrop'];

/**
 * Every light in every state at both sizes, as files for the ASSETS folder.
 * GTK 3 cannot draw an SVG from a data: URL, so the lights are files for
 * both versions.
 */
export function lightFiles(): { name: string; svg: string }[] {
    return (['close', 'minimize', 'maximize'] as Light[]).flatMap((light) => STATES.flatMap((state) => [
        { name: `${light}-${state}.svg`, svg: lightSvg(light, state) },
        { name: `${light}-${state}@2.svg`, svg: lightSvg(light, state, 24) },
    ]));
}

function image(light: Light, state: State): string {
    const file = `${ASSETS}/${light}-${state}`;
    return `-gtk-scaled(url("${file}.svg"), url("${file}@2.svg"))`;
}

const LIGHTS: Light[] = ['close', 'minimize', 'maximize'];

// The id in :not() lifts Macr's rules over any theme's, however specific.
const LIFT = ':not(#macr)';

/**
 * The traffic lights for one GTK version. GTK 4 (and libadwaita, and the
 * frames Mutter draws around X11 windows) puts window buttons in a
 * windowcontrols node, so the whole group shows its symbols on hover, as on
 * macOS; GTK 3 has loose titlebuttons, each showing its own. Both space the
 * lights 20px apart, centre to centre, as macOS does.
 */
export function trafficLightsCss(gtk: 3 | 4): string {
    const button = (light: Light) => gtk === 4 ? `windowcontrols > button.${light}${LIFT}` : `button.titlebutton.${light}${LIFT}`;
    // Chrome draws GTK 4 buttons alone, hovering the button but not its group.
    const hovered = (light: Light, state = '') => (gtk === 4 ? [`windowcontrols:hover > button.${light}${LIFT}`] : [])
        .concat(`${button(light)}:hover`).map((selector) => selector + state).join(', ');
    const all = (make: (light: Light) => string) => LIGHTS.map(make).join(',\n');
    const rules = [
        `/* Written by Macr; it is removed when Macr's traffic lights are turned off. */`,
        `${all(button)} {
  min-width: ${gtk === 4 ? 12 : 16}px;
  min-height: ${gtk === 4 ? 12 : 16}px;
  padding: ${gtk === 4 ? '4px' : '0'};
  margin: ${gtk === 4 ? '0' : '0 -1px'};
  border: none;
  border-radius: 0;
  outline: none;
  box-shadow: none;
  text-shadow: none;
  background-color: transparent;
  background-size: 12px 12px;
  background-position: center;
  background-repeat: no-repeat;
}`,
        `${all((light) => `${button(light)} > *`)} {
  color: transparent;
  opacity: 0;
  -gtk-icon-transform: scale(0);${gtk === 4 ? '\n  -gtk-icon-size: 12px;' : ''}
  background: none;
  box-shadow: none;
  border: none;
  padding: 0;
  margin: 0;
  min-width: 0;
  min-height: 0;
}`,
    ];
    if (gtk === 4) rules.push(`windowcontrols${LIFT} { border-spacing: 0; }`);
    for (const light of LIGHTS) {
        rules.push(
            `${button(light)} { background-image: ${image(light, 'rest')}; }`,
            `${hovered(light)} { background-image: ${image(light, 'hover')}; }`,
            `${button(light)}:active { background-image: ${image(light, 'pressed')}; }`,
            `${button(light)}:backdrop { background-image: ${image(light, 'backdrop')}; }`,
            `${hovered(light, ':backdrop')} { background-image: ${image(light, 'hover')}; }`,
        );
    }
    return `${rules.join('\n\n')}\n`;
}
