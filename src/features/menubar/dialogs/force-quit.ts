import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { dialogClass } from '../../../shared/scheme.js';

/** Force Quit Applications: pick a running app and kill its windows. */
export const ForceQuitDialog = GObject.registerClass(
    class ForceQuitDialog extends ModalDialog.ModalDialog {
        private selected: Shell.App | null = null;
        private readonly rows = new Map<Shell.App, St.Button>();

        constructor() {
            super({ styleClass: dialogClass('macr-dialog macr-force-quit') });
            this.contentLayout.add_child(new St.Label({ text: _('Force Quit Applications'), style_class: 'macr-dialog-title' }));
            const hint = new St.Label({
                text: _('If an app doesn’t respond for a while, select its name and click Force Quit.'),
                style_class: 'macr-dialog-text',
            });
            hint.clutter_text.line_wrap = true;
            this.contentLayout.add_child(hint);
            const list = new St.BoxLayout({ vertical: true, style_class: 'macr-force-quit-list' });
            const scroll = new St.ScrollView({ style_class: 'macr-force-quit-scroll', hscrollbar_policy: St.PolicyType.NEVER });
            scroll.set_child(list);
            this.contentLayout.add_child(scroll);

            const focused = Shell.WindowTracker.get_default().focus_app;
            const apps = Shell.AppSystem.get_default().get_running();
            for (const app of apps) {
                const row = new St.Button({ style_class: 'macr-force-quit-row', x_expand: true, x_align: Clutter.ActorAlign.FILL, can_focus: true });
                const content = new St.BoxLayout({ style_class: 'macr-force-quit-row-box', x_expand: true, x_align: Clutter.ActorAlign.START });
                content.add_child(app.create_icon_texture(24));
                content.add_child(new St.Label({ text: app.get_name(), y_align: Clutter.ActorAlign.CENTER }));
                row.set_child(content);
                row.connect('clicked', () => this.select(app));
                list.add_child(row);
                this.rows.set(app, row);
            }
            const quit = this.addButton({ label: _('Force Quit'), action: () => this.forceQuit(), default: true });
            this.addButton({ label: _('Cancel'), action: () => this.close(), key: Clutter.KEY_Escape });
            this.select(apps.includes(focused) ? focused : apps[0] ?? null);
            quit.reactive = apps.length > 0;
        }

        private select(app: Shell.App | null): void {
            this.selected = app;
            for (const [other, row] of this.rows) {
                if (other === app) row.add_style_pseudo_class('checked');
                else row.remove_style_pseudo_class('checked');
            }
        }

        private forceQuit(): void {
            for (const window of this.selected?.get_windows() ?? []) window.kill();
            this.close();
        }
    },
);
