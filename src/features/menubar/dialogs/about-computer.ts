import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { dialogClass } from '../menu-kit.js';
import { computerModel, graphicsNames, memoryLabel, osName, processorName } from '../logic/system-info.js';

/** About This Computer: the machine at a glance, like About This Mac. */
export const AboutComputerDialog = GObject.registerClass(
    class AboutComputerDialog extends ModalDialog.ModalDialog {
        constructor() {
            super({ styleClass: dialogClass('macr-dialog macr-about') });
            const box = new St.BoxLayout({ vertical: true, style_class: 'macr-about-box', x_expand: true });
            this.contentLayout.add_child(box);

            box.add_child(new St.Icon({ icon_name: logoIcon(), icon_size: 96, style_class: 'macr-about-icon', x_align: Clutter.ActorAlign.CENTER }));
            const model = computerModel({
                vendor: readText('/sys/class/dmi/id/sys_vendor'),
                name: readText('/sys/class/dmi/id/product_name'),
                version: readText('/sys/class/dmi/id/product_version'),
                family: readText('/sys/class/dmi/id/product_family'),
            });
            box.add_child(new St.Label({ text: model ?? GLib.get_host_name(), style_class: 'macr-about-title', x_align: Clutter.ActorAlign.CENTER }));
            const os = osName(readText('/etc/os-release')) ?? 'Linux';
            box.add_child(new St.Label({ text: os, style_class: 'macr-about-subtitle', x_align: Clutter.ActorAlign.CENTER }));

            const table = new St.BoxLayout({ vertical: true, style_class: 'macr-about-table' });
            box.add_child(table);
            const row = (key: string, value: string | null) => {
                if (!value) return null;
                const line = new St.BoxLayout({ style_class: 'macr-about-row' });
                line.add_child(new St.Label({ text: key, style_class: 'macr-about-key', x_align: Clutter.ActorAlign.END }));
                const label = new St.Label({ text: value, style_class: 'macr-about-value', x_expand: true });
                label.clutter_text.line_wrap = true;
                line.add_child(label);
                table.add_child(line);
                return label;
            };
            row(_('Processor'), processorName(readText('/proc/cpuinfo')));
            const graphics = row(_('Graphics'), '…');
            row(_('Memory'), memoryLabel(readText('/proc/meminfo')));
            row(_('Display'), displayLabel());
            row(_('Computer Name'), GLib.get_host_name());
            row(_('GNOME'), Config.PACKAGE_VERSION);
            if (graphics) fillGraphics(graphics, () => graphics.get_parent()?.destroy());

            this.addButton({ label: _('More Info…'), action: () => this.moreInfo() });
            this.addButton({ label: _('Close'), action: () => this.close(), default: true, key: Clutter.KEY_Escape });
        }

        private moreInfo(): void {
            this.close();
            try {
                Gio.Subprocess.new(['gnome-control-center', 'about'], Gio.SubprocessFlags.NONE);
            } catch (e) {
                console.error('Macr: could not open Settings', e);
            }
        }
    },
);

function readText(path: string): string {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes).trim() : '';
    } catch {
        return '';
    }
}

/** The distribution's logo icon (os-release LOGO), or a generic computer. */
function logoIcon(): string {
    const match = /^LOGO=(.*)$/m.exec(readText('/etc/os-release'));
    return match?.[1].replace(/^["']|["']$/g, '') || 'computer';
}

function displayLabel(): string | null {
    const monitor = Main.layoutManager.primaryMonitor;
    if (!monitor) return null;
    const scale = global.display.get_monitor_scale(monitor.index);
    const width = Math.round(monitor.width * scale);
    const height = Math.round(monitor.height * scale);
    const percent = Math.round(scale * 100);
    return percent === 100 ? `${width} × ${height}` : `${width} × ${height} (${percent}%)`;
}

/** lspci can take a moment, so the row fills in when it answers. */
function fillGraphics(label: St.Label, remove: () => void): void {
    try {
        const process = Gio.Subprocess.new(['lspci'], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        process.communicate_utf8_async(null, null, (_p, result) => {
            try {
                const [, stdout] = process.communicate_utf8_finish(result);
                const names = graphicsNames(stdout ?? '');
                if (names.length === 0) remove();
                else label.text = names.join('\n');
            } catch {
                remove();
            }
        });
    } catch {
        remove();
    }
}
