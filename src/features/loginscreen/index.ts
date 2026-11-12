import { LoginDialog } from 'resource:///org/gnome/shell/gdm/loginDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Module } from '../../shared/module.js';
import { MacLogin } from './mac-login.js';

type Proto = { _init(this: LoginDialog, ...args: unknown[]): void };

/**
 * The macOS login screen. It only runs in GDM's own shell ("gdm" session
 * mode), where Macr is installed for the gdm user by scripts/login-screen.sh.
 * GDM builds its login dialog at startup, possibly before the extension is
 * on, so the module both hooks the class and takes over a dialog already
 * shown. The bar's date goes, as the big time replaces it.
 */
export class LoginScreenModule implements Module {
    private readonly logins = new Map<LoginDialog, MacLogin>();
    private originalInit: Proto['_init'] | null = null;
    private dateShown = false;

    enable(): void {
        const proto = LoginDialog.prototype as unknown as Proto;
        const original = proto._init;
        this.originalInit = original;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const module = this;
        proto._init = function (...args) {
            original.apply(this, args);
            module.take(this);
        };

        const showing = (Main as unknown as { screenShield?: { _dialog?: unknown } }).screenShield?._dialog;
        if (showing instanceof LoginDialog) this.take(showing);

        const date = Main.panel.statusArea.dateMenu?.container;
        this.dateShown = Boolean(date?.visible);
        date?.hide();
    }

    disable(): void {
        if (this.originalInit) (LoginDialog.prototype as unknown as Proto)._init = this.originalInit;
        this.originalInit = null;
        for (const login of this.logins.values()) login.undo();
        this.logins.clear();
        if (this.dateShown) Main.panel.statusArea.dateMenu?.container.show();
    }

    private take(dialog: LoginDialog): void {
        if (this.logins.has(dialog)) return;
        this.logins.set(dialog, new MacLogin(dialog));
        dialog.connect('destroy', () => this.logins.delete(dialog));
    }
}
