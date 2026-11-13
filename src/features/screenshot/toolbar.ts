import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Tooltip, type ScreenshotUI } from 'resource:///org/gnome/shell/ui/screenshot.js';

import { styleMenu, syncMenuScheme } from '../../shared/menu-style.js';
import { isLight } from '../../shared/scheme.js';
import { CHOICES, choiceOf, isAvailable, isRecording, togglesFor, type CaptureType, type Choice } from './logic/toolbar.js';

const ROOT = 'macr-screenshot';
const BLUR = 'macr-screenshot-blur';

/** A GNOME actor the toolbar hides, with whether it showed before. */
type Hidden = { actor: Clutter.Actor; visible: boolean };
/** Something the toolbar connected to on one of GNOME's objects. */
type Connection = { object: Clutter.Actor; id: number };
/** GNOME's `Layout.MonitorConstraint`, which keeps the toolbar on one monitor. */
type MonitorPin = Clutter.Constraint & { primary: boolean; index: number };

/**
 * GNOME's screenshot UI (Print and Super+Shift+5) with the macOS toolbar:
 * one frosted row [×] | Entire Screen, Window, Selection | Record Screen,
 * Record Selection | Options, Capture. Its buttons set GNOME's own toggles
 * and follow them, so GNOME still does every capture and recording. GNOME's
 * two rows and close button are hidden while it runs and shown again after.
 */
export class Toolbar {
    private readonly bar: St.BoxLayout;
    private readonly choices = new Map<Choice, St.Button>();
    private readonly recordSeparator: St.Widget;
    private readonly captureButton: St.Button;
    private readonly optionsButton: St.Button;
    private readonly menu: PopupMenu.PopupMenu;
    private readonly menuManager: PopupMenu.PopupMenuManager;
    private readonly pointerItem: PopupMenu.PopupMenuItem;
    private readonly tooltips: Tooltip[] = [];
    private readonly hidden: Hidden[] = [];
    private readonly connections: Connection[] = [];

    constructor(private readonly ui: ScreenshotUI) {
        ui.add_style_class_name(ROOT);
        ui._panel.add_effect_with_name(BLUR, new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 40, brightness: 1 }));

        // Not expanding: the panel keeps its natural width, centred as GNOME has it.
        this.bar = new St.BoxLayout({ style_class: 'macr-screenshot-bar', x_align: Clutter.ActorAlign.CENTER, x_expand: false });
        const close = this.button('macr-screenshot-close', _('Close'), new St.Icon({ icon_name: 'window-close-symbolic' }));
        close.connect('clicked', () => ui.close());
        this.bar.add_child(close);

        this.bar.add_child(separator());
        this.recordSeparator = separator();
        for (const choice of CHOICES) {
            if (choice === 'record-screen') this.bar.add_child(this.recordSeparator);
            const button = this.button('macr-screenshot-choice', choiceLabel(choice), choiceIcon(choice));
            button.connect('clicked', () => this.choose(choice));
            this.choices.set(choice, button);
            this.bar.add_child(button);
        }
        this.bar.add_child(separator());

        const options = new St.BoxLayout({ style: 'spacing: 4px' });
        options.add_child(new St.Label({ text: _('Options'), y_align: Clutter.ActorAlign.CENTER }));
        options.add_child(new St.Icon({ icon_name: 'pan-down-symbolic', style_class: 'macr-screenshot-options-arrow' }));
        this.optionsButton = this.button('macr-screenshot-options', null, options);
        this.optionsButton.connect('clicked', () => this.toggleMenu());
        this.bar.add_child(this.optionsButton);

        this.captureButton = this.button('macr-screenshot-capture', null, new St.Label({ text: _('Capture') }));
        this.captureButton.connect('clicked', () => ui._onCaptureButtonClicked());
        this.bar.add_child(this.captureButton);

        // Options: above the bar, inside the UI so it shows over the frozen screen.
        this.menu = new PopupMenu.PopupMenu(this.optionsButton, 0.5, St.Side.BOTTOM);
        styleMenu(this.menu);
        ui.add_child(this.menu.actor);
        this.menu.actor.hide();
        this.menuManager = new PopupMenu.PopupMenuManager(this.optionsButton, { actionMode: Shell.ActionMode.POPUP });
        this.menuManager.addMenu(this.menu, -1);
        this.pointerItem = new PopupMenu.PopupMenuItem(_('Show Mouse Pointer'));
        this.pointerItem.connect('activate', () => {
            ui._showPointerButton.checked = !ui._showPointerButton.checked;
        });
        this.menu.addMenuItem(this.pointerItem);

        ui._panel.insert_child_at_index(this.bar, 0);
        for (const actor of [ui._typeButtonContainer, ui._bottomRowContainer, ui._closeButton]) {
            this.hidden.push({ actor, visible: actor.visible });
            actor.hide();
        }

        const sync = () => this.sync();
        for (const button of [ui._selectionButton, ui._screenButton, ui._windowButton, ui._castButton, ui._showPointerButton]) this.listen(button, 'notify::checked', sync);
        this.listen(ui._castButton, 'notify::visible', sync);
        this.listen(ui._castButton, 'notify::reactive', sync);
        // GNOME lists the windows to pick as it opens.
        this.listen(ui, 'notify::visible', sync);
        this.listen(ui, 'notify::visible', () => this.followPointer());
        this.syncScheme();
        this.sync();
    }

    destroy(): void {
        for (const { object, id } of this.connections) object.disconnect(id);
        this.connections.length = 0;
        for (const tooltip of this.tooltips) {
            tooltip.close();
            tooltip.destroy();
        }
        this.tooltips.length = 0;
        this.menuManager.removeMenu(this.menu);
        this.menu.destroy();
        this.bar.destroy();
        for (const { actor, visible } of this.hidden) actor.visible = visible;
        this.hidden.length = 0;
        const pin = this.monitorPin();
        if (pin) pin.primary = true;
        this.ui._panel.remove_effect_by_name(BLUR);
        this.ui.remove_style_class_name(ROOT);
        this.ui.remove_style_class_name('macr-light');
    }

    /** GNOME's pin of the toolbar (and its close button) to the primary monitor. */
    private monitorPin(): MonitorPin | null {
        const bin = (this.ui as unknown as { _primaryMonitorBin?: Clutter.Actor })._primaryMonitorBin;
        const pin = bin?.get_constraints().find((constraint) => constraint instanceof Layout.MonitorConstraint);
        return (pin as MonitorPin | undefined) ?? null;
    }

    /** GNOME keeps the toolbar on the primary monitor; it opens on the pointer's, the one in use. */
    private followPointer(): void {
        const pin = this.monitorPin();
        if (pin && this.ui.visible) pin.index = global.display.get_current_monitor();
    }

    /** Matches GNOME's light or dark style; call it as the UI opens. */
    syncScheme(): void {
        if (isLight()) this.ui.add_style_class_name('macr-light');
        else this.ui.remove_style_class_name('macr-light');
    }

    private button(styleClass: string, tooltip: string | null, child: Clutter.Actor): St.Button {
        const button = new St.Button({ style_class: styleClass, child, track_hover: true, can_focus: true });
        if (tooltip) {
            button.accessible_name = tooltip;
            const label = new Tooltip(button, { text: tooltip, style_class: 'screenshot-ui-tooltip', visible: false });
            this.ui.add_child(label);
            this.tooltips.push(label);
        }
        return button;
    }

    private listen(object: Clutter.Actor, signal: string, callback: () => void): void {
        this.connections.push({ object, id: object.connect(signal, callback) });
    }

    /** Sets GNOME's toggles: screenshot or screencast first, since screencast unpicks Window. */
    private choose(choice: Choice): void {
        const ui = this.ui;
        const { type, cast } = togglesFor(choice);
        ui._castButton.checked = cast;
        const buttons: Record<CaptureType, St.Button> = { screen: ui._screenButton, window: ui._windowButton, selection: ui._selectionButton };
        buttons[type].checked = true;
    }

    private sync(): void {
        const ui = this.ui;
        const type: CaptureType = ui._windowButton.checked ? 'window' : ui._screenButton.checked ? 'screen' : 'selection';
        const current = choiceOf({ type, cast: ui._castButton.checked });
        const abilities = {
            windows: Main.sessionMode.hasWindows && ui._windowSelectors.some((selector) => selector.windows().length > 0),
            recording: ui._castButton.visible && ui._castButton.reactive,
        };
        for (const [choice, button] of this.choices) {
            button.checked = choice === current;
            button.visible = !isRecording(choice) || abilities.recording;
            button.reactive = isAvailable(choice, abilities);
        }
        this.recordSeparator.visible = abilities.recording;
        const label = this.captureButton.child as St.Label;
        label.text = isRecording(current) ? _('Record') : _('Capture');
        this.pointerItem.setOrnament(ui._showPointerButton.checked ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    private toggleMenu(): void {
        if (this.menu.isOpen) {
            this.menu.close(true);
            return;
        }
        syncMenuScheme(this.menu);
        this.menu.open(true);
    }
}

function separator(): St.Widget {
    return new St.Widget({ style_class: 'macr-screenshot-separator', y_align: Clutter.ActorAlign.CENTER });
}

function choiceLabel(choice: Choice): string {
    const labels: Record<Choice, string> = {
        screen: _('Capture Entire Screen'),
        window: _('Capture Selected Window'),
        selection: _('Capture Selected Portion'),
        'record-screen': _('Record Entire Screen'),
        'record-selection': _('Record Selected Portion'),
    };
    return labels[choice];
}

/** GNOME's own capture icons; the record buttons add a dot, as on macOS. */
function choiceIcon(choice: Choice): Clutter.Actor {
    const names: Record<Choice, string> = {
        screen: 'screenshot-ui-display-symbolic',
        window: 'screenshot-ui-window-symbolic',
        selection: 'screenshot-ui-area-symbolic',
        'record-screen': 'screenshot-ui-display-symbolic',
        'record-selection': 'screenshot-ui-area-symbolic',
    };
    const icon = new St.Icon({ icon_name: names[choice], style_class: 'macr-screenshot-choice-icon' });
    if (!isRecording(choice)) return icon;
    // The dot expands to its corner; set on the box, expand stops there.
    const box = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: false, y_expand: false });
    box.add_child(icon);
    box.add_child(new St.Widget({ style_class: 'macr-screenshot-record-dot', x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END }));
    return box;
}
