import type Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { convertCurrency, convertUnit, formatAmount, parseConversion, type Quantity } from './logic/convert.js';
import { definitionUrl, isWord, parseDefinition, parseSuggestions, searchUrl, suggestUrl, wiktionaryUrl } from './logic/web.js';
import type { Online } from './online.js';

/** What GNOME's search providers (the overview's own list) offer. */
export interface Provider {
    id: string;
    /** Macr's own providers name their section; GNOME's take their app's name. */
    title?: string;
    appInfo?: Gio.AppInfo | null;
    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;
    filterResults(results: string[], max: number): string[];
    getResultMetas(ids: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]>;
    activateResult(id: string, terms: string[]): void;
}

export interface ResultMeta {
    id: string;
    name: string;
    description?: string;
    createIcon?(size: number): Clutter.Actor | null;
}

/** How many suggestions the web section lists under its search. */
const SUGGESTIONS = 3;

function icon(name: string): (size: number) => Clutter.Actor {
    return (size) => new St.Icon({ icon_name: name, icon_size: size });
}

function quantityName(quantity: Quantity): string {
    switch (quantity) {
        case 'length':
            return _('Length');
        case 'mass':
            return _('Weight');
        case 'temperature':
            return _('Temperature');
        case 'volume':
            return _('Volume');
        case 'speed':
            return _('Speed');
        case 'data':
            return _('Data');
        case 'time':
            return _('Time');
        case 'area':
            return _('Area');
    }
}

function openUri(uri: string): void {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    } catch (error) {
        console.warn(`Macr: could not open ${uri}: ${error}`);
    }
}

/**
 * A provider whose answers are worked out in getInitialResultSet: their
 * metas wait in a map until Spotlight asks for them.
 */
abstract class Answers implements Provider {
    protected readonly metas = new Map<string, ResultMeta>();

    constructor(
        readonly id: string,
        readonly title: string,
    ) {}

    async getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]> {
        this.metas.clear();
        const metas = await this.answer(terms, cancellable);
        for (const meta of metas) this.metas.set(meta.id, meta);
        return metas.map((meta) => meta.id);
    }

    filterResults(results: string[], max: number): string[] {
        return results.slice(0, max);
    }

    getResultMetas(ids: string[]): Promise<ResultMeta[]> {
        return Promise.resolve(ids.flatMap((id) => this.metas.get(id) ?? []));
    }

    protected abstract answer(terms: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]>;
    abstract activateResult(id: string, terms: string[]): void;
}

/** "10 km to mi", "100 f in c", "$20 in rupiah": Enter copies the result. */
class Conversions extends Answers {
    constructor(
        private readonly settings: Gio.Settings,
        private readonly online: Online,
    ) {
        super('macr-convert', _('Conversion'));
    }

    protected async answer(terms: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]> {
        const query = parseConversion(terms.join(' '));
        if (!query) return [];
        if (query.kind === 'unit') {
            const result = `${formatAmount(convertUnit(query.amount, query.from, query.to))} ${query.to.symbol}`;
            return [{ id: result, name: result, description: `${formatAmount(query.amount)} ${query.from.symbol} · ${quantityName(query.from.quantity)}`, createIcon: icon('accessories-calculator-symbolic') }];
        }
        if (!this.settings.get_boolean('spotlight-online')) return [];
        const rates = await this.online.ratesFrom(query.from, cancellable);
        const value = rates ? convertCurrency(query.amount, query.to, rates) : null;
        if (!rates || value === null) return [];
        const result = `${formatAmount(value, 2)} ${query.to}`;
        // TRANSLATORS: %s is the day the exchange rates are from (YYYY-MM-DD).
        const description = `${formatAmount(query.amount, 2)} ${query.from} · ${_('Exchange rate of %s').format(rates.date)}`;
        return [{ id: result, name: result, description, createIcon: icon('accessories-calculator-symbolic') }];
    }

    activateResult(id: string): void {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, id);
        Main.osdWindowManager.show(-1, new Gio.ThemedIcon({ name: 'edit-copy-symbolic' }), _('Copied'), null, null);
    }
}

/** A single English word's meaning, from Wiktionary through the Free Dictionary API. */
class Definitions extends Answers {
    constructor(
        private readonly settings: Gio.Settings,
        private readonly online: Online,
    ) {
        super('macr-define', _('Definition'));
    }

    protected async answer(terms: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]> {
        if (!this.settings.get_boolean('spotlight-online') || !isWord(terms)) return [];
        const text = await this.online.get(definitionUrl(terms[0]), cancellable);
        const found = text ? parseDefinition(text) : null;
        if (!found) return [];
        const name = found.phonetic ? `${found.word}  ${found.phonetic}` : found.word;
        const description = found.partOfSpeech ? `${found.partOfSpeech} · ${found.definition}` : found.definition;
        return [{ id: found.word, name, description, createIcon: icon('accessories-dictionary-symbolic') }];
    }

    activateResult(id: string): void {
        openUri(wiktionaryUrl(id));
    }
}

/** "Search the web for …", then what the search engine suggests for it. */
class WebSearch extends Answers {
    constructor(
        private readonly settings: Gio.Settings,
        private readonly online: Online,
    ) {
        super('macr-web', _('Search the Web'));
    }

    protected async answer(terms: string[], cancellable: Gio.Cancellable): Promise<ResultMeta[]> {
        const query = terms.join(' ');
        const search: ResultMeta = { id: query, name: _('Search the web for “%s”').format(query), createIcon: icon('web-browser-symbolic') };
        if (!this.settings.get_boolean('spotlight-online')) return [search];
        const text = await this.online.get(suggestUrl(query), cancellable);
        const suggestions = text ? parseSuggestions(text, query, SUGGESTIONS) : [];
        return [search, ...suggestions.map((suggestion) => ({ id: suggestion, name: suggestion, createIcon: icon('system-search-symbolic') }))];
    }

    activateResult(id: string): void {
        openUri(searchUrl(id));
    }
}

/** Macr's answers around GNOME's providers: conversions first, the web last. */
export function answerProviders(settings: Gio.Settings, online: Online): { first: Provider[]; last: Provider[] } {
    return {
        first: [new Conversions(settings, online)],
        last: [new Definitions(settings, online), new WebSearch(settings, online)],
    };
}
