import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { stackViews, type StackView } from './logic/stacks.js';

type Disconnectable = { disconnect(id: number): void };
type Signals = Disconnectable & { connect(signal: string, callback: (...args: never[]) => void): number };
/** GNOME 46's notification in the list. */
type Notification = { source: object; urgency: number; datetime: GLib.DateTime | null };
type Message = St.Button & {
    notification: Notification | null;
    _header: St.BoxLayout & { closeButton: St.Button; expandButton: St.Button };
    close(): void;
};
type Section = St.BoxLayout & { _list: St.BoxLayout };
type DateMenu = { _messageList?: { _notificationSection?: Section } };

/** GNOME's critical urgency: those stay on top of the list. */
const CRITICAL = 3;
const CLICKS = new Set([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE, Clutter.EventType.TOUCH_BEGIN, Clutter.EventType.TOUCH_END]);
const RELEASES = new Set([Clutter.EventType.BUTTON_RELEASE, Clutter.EventType.TOUCH_END]);

/** What Macr added to one message. */
interface Touched {
    view: StackView;
    ids: [Disconnectable, number][];
    showLess: St.Button | null;
}

/**
 * The Notification Center's notifications stacked per app, as on macOS:
 * an app's notifications sit under its newest one, which shows the others
 * peeking out below. Clicking the stack opens it, Show Less closes it, and
 * its close button clears the whole stack. GNOME's list keeps its messages;
 * they are only moved, hidden and styled, and put back in GNOME's order on
 * destroy.
 */
export class NotificationStacks {
    private readonly section: Section | null;
    private readonly open = new Set<object>();
    private readonly touched = new Map<Message, Touched>();
    private readonly ids: [Signals, number][] = [];
    private syncId = 0;

    constructor(menu: Signals) {
        this.section = (Main.panel.statusArea.dateMenu as unknown as DateMenu)._messageList?._notificationSection ?? null;
        const list = this.section?._list;
        if (!list) return;
        this.listen(list as unknown as Signals, 'child-added', () => this.queueSync());
        this.listen(list as unknown as Signals, 'child-removed', () => this.queueSync());
        this.listen(menu, 'open-state-changed', (_menu: unknown, isOpen: boolean) => {
            // Stacks close again with the Notification Center, as on macOS.
            if (!isOpen) this.open.clear();
            this.sync();
        });
        this.sync();
    }

    destroy(): void {
        if (this.syncId) GLib.source_remove(this.syncId);
        this.syncId = 0;
        for (const [target, id] of this.ids) target.disconnect(id);
        this.ids.length = 0;
        for (const message of [...this.touched.keys()]) this.untouch(message);
        this.restoreOrder();
    }

    private listen(target: Signals, signal: string, callback: (...args: never[]) => void): void {
        this.ids.push([target, target.connect(signal, callback)]);
    }

    private queueSync(): void {
        if (this.syncId) return;
        this.syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.syncId = 0;
            this.sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** The list's messages in its order, each with its list item. */
    private messages(): [St.Widget, Message][] {
        const items = (this.section?._list.get_children() ?? []) as St.Bin[];
        return items.flatMap((item) => {
            const message = item.child as Message | null;
            return message?.notification ? [[item, message] as [St.Widget, Message]] : [];
        });
    }

    private sync(): void {
        const list = this.section?._list;
        if (!list) return;
        const messages = this.messages();
        const views = stackViews(
            messages.map(([, message]) => (message.notification as Notification).source),
            this.open,
        );
        const order = messages.map((entry, position) => ({ entry, view: views[position] })).sort((a, b) => a.view.index - b.view.index);
        order.forEach(({ entry: [item] }, index) => {
            if (list.get_child_at_index(index) !== item) list.set_child_at_index(item, index);
        });
        for (const { entry, view } of order) this.apply(entry[0], entry[1], view);
    }

    private apply(item: St.Widget, message: Message, view: StackView): void {
        const touched = this.touch(message);
        touched.view = view;
        item.visible = view.shown;
        const closedTop = view.stack === 'closed' && view.top;
        if (closedTop) {
            item.add_style_class_name('macr-nc-stack-item');
            message.add_style_class_name('macr-nc-stack');
        } else {
            item.remove_style_class_name('macr-nc-stack-item');
            message.remove_style_class_name('macr-nc-stack');
        }
        const openTop = view.stack === 'open' && view.top;
        if (openTop && !touched.showLess) {
            const button = new St.Button({ style_class: 'macr-nc-show-less', label: _('Show Less'), can_focus: true, y_align: Clutter.ActorAlign.CENTER });
            button.connect('clicked', () => {
                const source = message.notification?.source;
                if (source) this.open.delete(source);
                this.sync();
            });
            message._header.insert_child_below(button, message._header.expandButton);
            touched.showLess = button;
        } else if (!openTop && touched.showLess) {
            touched.showLess.destroy();
            touched.showLess = null;
        }
    }

    /** Macr's handlers on `message`, added once. */
    private touch(message: Message): Touched {
        const known = this.touched.get(message);
        if (known) return known;
        const touched: Touched = { view: { index: 0, shown: true, stack: 'none', top: true, count: 1 }, ids: [], showLess: null };
        const closedTop = () => touched.view.stack === 'closed' && touched.view.top;
        // A closed stack opens instead of opening the notification.
        touched.ids.push([
            message,
            message.connect('event', (_actor: Clutter.Actor, event: Clutter.Event) => {
                if (!closedTop() || !CLICKS.has(event.type())) return Clutter.EVENT_PROPAGATE;
                const source = message.notification?.source;
                if (RELEASES.has(event.type()) && source) {
                    this.open.add(source);
                    this.sync();
                }
                return Clutter.EVENT_STOP;
            }),
        ]);
        // Its close button clears the whole stack.
        const close = message._header.closeButton;
        touched.ids.push([
            close,
            close.connect('event', (_actor: Clutter.Actor, event: Clutter.Event) => {
                if (!closedTop() || !CLICKS.has(event.type())) return Clutter.EVENT_PROPAGATE;
                if (RELEASES.has(event.type())) this.clearStack(message.notification?.source);
                return Clutter.EVENT_STOP;
            }),
        ]);
        touched.ids.push([message, message.connect('destroy', () => this.touched.delete(message))]);
        this.touched.set(message, touched);
        return touched;
    }

    private clearStack(source: object | undefined): void {
        if (!source) return;
        for (const [, message] of this.messages()) {
            if (message.notification?.source === source) message.close();
        }
    }

    private untouch(message: Message): void {
        const touched = this.touched.get(message);
        if (!touched) return;
        for (const [target, id] of touched.ids) target.disconnect(id);
        touched.showLess?.destroy();
        message.remove_style_class_name('macr-nc-stack');
        const item = message.get_parent() as St.Widget | null;
        if (item) {
            item.visible = true;
            item.remove_style_class_name('macr-nc-stack-item');
        }
        this.touched.delete(message);
    }

    /** GNOME's own order: critical ones first, then newest first. */
    private restoreOrder(): void {
        const list = this.section?._list;
        if (!list) return;
        const time = (message: Message) => {
            const datetime = message.notification?.datetime;
            return datetime ? datetime.to_unix() * 1e6 + datetime.get_microsecond() : 0;
        };
        const critical = (message: Message) => (message.notification?.urgency === CRITICAL ? 1 : 0);
        this.messages()
            .sort(([, a], [, b]) => critical(b) - critical(a) || time(b) - time(a))
            .forEach(([item], index) => list.set_child_at_index(item, index));
    }
}
