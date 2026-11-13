// @girs has no libsoup 3 typings here. These cover the parts Spotlight's
// online answers use.
declare module 'gi://Soup?version=3.0' {
    import type Gio from 'gi://Gio';
    import type GLib from 'gi://GLib';

    namespace Soup {
        class Session {
            constructor(params?: { user_agent?: string; timeout?: number; idle_timeout?: number });
            send_and_read_async(
                message: Message,
                priority: number,
                cancellable: Gio.Cancellable | null,
                callback: (session: Session, result: Gio.AsyncResult) => void,
            ): void;
            send_and_read_finish(result: Gio.AsyncResult): GLib.Bytes;
            abort(): void;
        }

        class Message {
            static ['new'](method: string, uri: string): Message | null;
            get_status(): number;
        }
    }

    export default Soup;
}
