import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { parseRates, type Rates } from './logic/convert.js';

/** Seconds a request may take before Spotlight gives up on it. */
const TIMEOUT_SECONDS = 3;
/** Exchange rates are published once a working day; keep them half a day. */
const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Spotlight's HTTP: one Soup session, plain GETs that give the body as text
 * (null on any failure), and exchange rates kept in memory. It sends no
 * cookies and nothing that identifies the user.
 */
export class Online {
    private readonly session = new Soup.Session({ user_agent: 'Macr', timeout: TIMEOUT_SECONDS, idle_timeout: 30 });
    private readonly rates = new Map<string, { at: number; rates: Rates }>();

    get(url: string, cancellable: Gio.Cancellable): Promise<string | null> {
        const message = Soup.Message.new('GET', url);
        if (!message) return Promise.resolve(null);
        return new Promise((resolve) => {
            this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const data = bytes.get_data();
                    resolve(message.get_status() === 200 && data ? new TextDecoder().decode(data) : null);
                } catch (error) {
                    if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))) {
                        console.debug(`Macr: ${url} failed: ${error}`);
                    }
                    resolve(null);
                }
            });
        });
    }

    /** Today's rates from `base` (an ISO 4217 code), from the European Central Bank via Frankfurter. */
    async ratesFrom(base: string, cancellable: Gio.Cancellable): Promise<Rates | null> {
        const known = this.rates.get(base);
        if (known && Date.now() - known.at < RATES_MAX_AGE_MS) return known.rates;
        const text = await this.get(`https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(base)}`, cancellable);
        const rates = text ? parseRates(text) : null;
        if (rates) this.rates.set(base, { at: Date.now(), rates });
        return rates;
    }

    destroy(): void {
        this.session.abort();
        this.rates.clear();
    }
}
