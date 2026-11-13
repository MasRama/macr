import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { pageHeader, pages, type PageContext, type PageInfo } from './prefs/pages.js';
import { addStyles, tile } from './prefs/style.js';

/**
 * The settings window, laid out like macOS System Settings: a sidebar of
 * coloured tiles on the left, the chosen page on the right. GNOME runs it in
 * its own process, never inside the shell.
 */
export default class MacrPreferences extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        const cleanups: (() => void)[] = [addStyles()];
        const toasts = new Adw.ToastOverlay();
        const context: PageContext = {
            settings: this.getSettings(),
            version: String(this.metadata['version-name'] ?? this.metadata.version ?? ''),
            url: String(this.metadata.url ?? 'https://github.com/MasRama/macr'),
            window,
            toast: (title) => toasts.add_toast(new Adw.Toast({ title })),
            onClose: (cleanup) => cleanups.push(cleanup),
        };

        const all = pages();
        const built = new Map<string, Gtk.Widget>();
        const content = new Adw.NavigationPage({ title: all[0].title, tag: 'content' });
        const show = (page: PageInfo) => {
            let view = built.get(page.id);
            if (!view) {
                view = pageView(page, context);
                built.set(page.id, view);
            }
            content.title = page.title;
            content.child = view;
        };

        const list = new Gtk.ListBox({ css_classes: ['navigation-sidebar', 'macr-sidebar'] });
        for (const page of all) list.append(sidebarRow(page));
        list.set_header_func((row, before) => {
            const section = all[row.get_index()]?.section;
            const previous = before ? all[before.get_index()]?.section : section;
            row.set_header(section !== previous ? new Gtk.Separator({ margin_top: 6, margin_bottom: 6, margin_start: 8, margin_end: 8 }) : null);
        });

        const split = new Adw.NavigationSplitView({
            min_sidebar_width: 220,
            max_sidebar_width: 260,
            sidebar: new Adw.NavigationPage({ title: _('Macr'), child: toolbar(new Gtk.ScrolledWindow({ child: list, hscrollbar_policy: Gtk.PolicyType.NEVER, vexpand: true })) }),
            content,
        });
        list.connect('row-activated', (_list, row) => {
            const page = all[row.get_index()];
            if (!page) return;
            show(page);
            split.show_content = true;
        });
        list.select_row(list.get_row_at_index(0));
        show(all[0]);

        const breakpoint = new Adw.Breakpoint({ condition: Adw.BreakpointCondition.parse('max-width: 640sp') });
        const collapsed = new GObject.Value();
        collapsed.init(GObject.TYPE_BOOLEAN);
        collapsed.set_boolean(true);
        breakpoint.add_setter(split, 'collapsed', collapsed);
        window.add_breakpoint(breakpoint);

        toasts.child = split;
        // GNOME's prefs dialog fails unless a page was added the usual way;
        // that page is never shown, since the content is replaced below.
        window.add(new Adw.PreferencesPage());
        window.set_content(toasts);
        window.set_default_size(920, 680);
        window.set_size_request(360, 360);
        window.connect('close-request', () => {
            for (const cleanup of cleanups.splice(0).reverse()) cleanup();
            return false;
        });
    }
}

/** A page's content: header bar, then its title block and groups in a scrolling page. */
function pageView(page: PageInfo, context: PageContext): Gtk.Widget {
    const prefs = new Adw.PreferencesPage();
    prefs.add(pageHeader(page) as Adw.PreferencesGroup);
    for (const group of page.build(context)) prefs.add(group as Adw.PreferencesGroup);
    return toolbar(prefs);
}

function toolbar(child: Gtk.Widget): Gtk.Widget {
    const view = new Adw.ToolbarView({ content: child });
    view.add_top_bar(new Adw.HeaderBar());
    return view;
}

function sidebarRow(page: PageInfo): Gtk.Widget {
    const box = new Gtk.Box({ spacing: 10, halign: Gtk.Align.FILL });
    box.append(tile(page.icon, page.color));
    box.append(new Gtk.Label({ label: page.title, xalign: 0, hexpand: true, ellipsize: 3 }));
    return new Gtk.ListBoxRow({ child: box });
}
