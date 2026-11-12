import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import type Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { dialogClass } from '../../../shared/scheme.js';

/** About <App>: its icon, name and description. */
export const AboutAppDialog = GObject.registerClass(
    class AboutAppDialog extends ModalDialog.ModalDialog {
        constructor(app: Shell.App) {
            super({ styleClass: dialogClass('macr-dialog macr-about') });
            const box = new St.BoxLayout({ vertical: true, style_class: 'macr-about-box', x_expand: true });
            this.contentLayout.add_child(box);
            const icon = app.create_icon_texture(96);
            icon.x_align = Clutter.ActorAlign.CENTER;
            box.add_child(icon);
            box.add_child(new St.Label({ text: app.get_name(), style_class: 'macr-about-title', x_align: Clutter.ActorAlign.CENTER }));
            const description = app.get_description();
            if (description) {
                const label = new St.Label({ text: description, style_class: 'macr-about-subtitle', x_align: Clutter.ActorAlign.CENTER });
                label.clutter_text.line_wrap = true;
                box.add_child(label);
            }
            this.addButton({ label: _('Close'), action: () => this.close(), default: true, key: Clutter.KEY_Escape });
        }
    },
);
