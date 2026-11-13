import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { dialogClass } from './scheme.js';

function emptyTrash(): void {
    try {
        Gio.Subprocess.new(['gio', 'trash', '--empty'], Gio.SubprocessFlags.NONE);
    } catch (error) {
        logError(error as object, 'Macr: could not empty the Trash');
    }
}

/** macOS asks before it erases the Trash for good. */
const EmptyTrashDialog = GObject.registerClass(
    class EmptyTrashDialog extends ModalDialog.ModalDialog {
        constructor() {
            super({ styleClass: dialogClass('macr-dialog') });
            this.contentLayout.add_child(
                new St.Label({ text: _('Are you sure you want to permanently erase the items in the Trash?'), style_class: 'macr-dialog-title' }),
            );
            const hint = new St.Label({ text: _('You can’t undo this action.'), style_class: 'macr-dialog-text' });
            hint.clutter_text.line_wrap = true;
            this.contentLayout.add_child(hint);
            this.addButton({ label: _('Cancel'), action: () => this.close(), key: Clutter.KEY_Escape });
            this.addButton({
                label: _('Empty Trash'),
                action: () => {
                    emptyTrash();
                    this.close();
                },
                default: true,
            });
        }
    },
);

/** Empties the Trash after macOS's "Are you sure" (the dock's Trash menu, Spotlight). */
export function askToEmptyTrash(): void {
    new EmptyTrashDialog().open();
}
