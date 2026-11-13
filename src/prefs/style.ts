import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';

import { ACCENTS, type Accent } from '../features/accent/logic/accent.js';

/** The colours of the sidebar tiles, as in macOS System Settings. */
export type TileColor = 'graphite' | 'gray' | 'red' | 'orange' | 'blue' | 'purple' | 'green';

const CSS = `
.macr-tile {
  border-radius: 7px;
  min-width: 26px;
  min-height: 26px;
  color: white;
  box-shadow: inset 0 0 0 1px alpha(black, 0.08), 0 1px 1px alpha(black, 0.12);
}
.macr-tile image { -gtk-icon-size: 16px; }
.macr-tile.large { border-radius: 15px; min-width: 64px; min-height: 64px; }
.macr-tile.large image { -gtk-icon-size: 38px; }
.macr-tile.graphite { background: linear-gradient(to bottom, #5b5b60, #2c2c2e); }
.macr-tile.gray { background: linear-gradient(to bottom, #a4a4aa, #7c7c82); }
.macr-tile.red { background: linear-gradient(to bottom, #ff6b62, #ff3b30); }
.macr-tile.orange { background: linear-gradient(to bottom, #ffb340, #ff9500); }
.macr-tile.blue { background: linear-gradient(to bottom, #4aa4ff, #0a7aff); }
.macr-tile.purple { background: linear-gradient(to bottom, #c58af0, #a24ee0); }
.macr-tile.green { background: linear-gradient(to bottom, #5ee07c, #2fbe55); }
.macr-sidebar row { padding: 5px 8px; border-radius: 8px; }
.macr-sidebar row label { font-weight: 500; }
.macr-page-header { margin: 6px 4px 6px 4px; }
.macr-page-header .title { font-size: 1.45em; font-weight: 700; }
.macr-swatches { margin: 6px 0; }
.macr-swatch {
  min-width: 20px;
  min-height: 20px;
  padding: 0;
  border-radius: 999px;
  background-image: none;
  box-shadow: inset 0 0 0 1px alpha(black, 0.15);
}
.macr-swatch:checked {
  box-shadow: inset 0 0 0 1px alpha(black, 0.15), 0 0 0 2px @window_bg_color, 0 0 0 4px alpha(@window_fg_color, 0.45);
}
.macr-swatch.wallpaper {
  background-image: conic-gradient(#ff453a, #ff9f0a, #ffd60a, #30d158, #0a84ff, #bf5af2, #ff375f, #ff453a);
}
${(Object.keys(ACCENTS) as Accent[]).map((name) => `.macr-swatch.${name} { background-color: ${ACCENTS[name].color}; }`).join('\n')}
`;

/** Adds Macr's settings styles to the display; returns a function that takes them off again. */
export function addStyles(): () => void {
    const display = Gdk.Display.get_default();
    if (!display) return () => {};
    const provider = new Gtk.CssProvider();
    provider.load_from_string(CSS);
    Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    return () => Gtk.StyleContext.remove_provider_for_display(display, provider);
}

/** A coloured squircle with a white symbolic icon. */
export function tile(icon: string, color: TileColor, large = false): Gtk.Widget {
    const box = new Gtk.Box({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, hexpand: false, vexpand: false, css_classes: ['macr-tile', color] });
    if (large) box.add_css_class('large');
    // The image must not expand: that would spread to the tile and stretch the row.
    box.append(new Gtk.Image({ icon_name: icon, hexpand: false, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER }));
    box.set_homogeneous(true);
    return box;
}
