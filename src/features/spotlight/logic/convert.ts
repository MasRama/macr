// Spotlight's conversions: "10 km to mi", "100 f in c", "$20 in rupiah".

export type Quantity = 'length' | 'mass' | 'temperature' | 'volume' | 'speed' | 'data' | 'time' | 'area';

export interface Unit {
    quantity: Quantity;
    /** How it is written in a result. */
    symbol: string;
    /** Its size in the quantity's base unit (metres, grams, litres...). */
    factor: number;
    /** Added after scaling: only temperatures have one (base: kelvin). */
    offset?: number;
}

export type Conversion = { kind: 'unit'; amount: number; from: Unit; to: Unit } | { kind: 'currency'; amount: number; from: string; to: string };

export interface Rates {
    base: string;
    /** The day the rates are from, as YYYY-MM-DD. */
    date: string;
    rates: Record<string, number>;
}

/** [quantity, symbol, factor, names it is typed as, offset?] */
const UNITS: [Quantity, string, number, string[], number?][] = [
    ['length', 'mm', 0.001, ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres']],
    ['length', 'cm', 0.01, ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres']],
    ['length', 'm', 1, ['m', 'meter', 'meters', 'metre', 'metres']],
    ['length', 'km', 1000, ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres']],
    ['length', 'in', 0.0254, ['in', 'inch', 'inches', '"']],
    ['length', 'ft', 0.3048, ['ft', 'foot', 'feet', "'"]],
    ['length', 'yd', 0.9144, ['yd', 'yard', 'yards']],
    ['length', 'mi', 1609.344, ['mi', 'mile', 'miles']],
    ['length', 'nmi', 1852, ['nmi', 'nautical mile', 'nautical miles']],
    ['mass', 'mg', 0.001, ['mg', 'milligram', 'milligrams']],
    ['mass', 'g', 1, ['g', 'gram', 'grams', 'gramme', 'grammes']],
    ['mass', 'kg', 1000, ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms']],
    ['mass', 't', 1e6, ['t', 'tonne', 'tonnes', 'ton', 'tons']],
    ['mass', 'oz', 28.349523125, ['oz', 'ounce', 'ounces']],
    ['mass', 'lb', 453.59237, ['lb', 'lbs', 'pound', 'pounds']],
    ['mass', 'st', 6350.29318, ['st', 'stone', 'stones']],
    ['temperature', '°C', 1, ['c', '°c', 'celsius', 'centigrade'], 273.15],
    ['temperature', '°F', 5 / 9, ['f', '°f', 'fahrenheit'], 273.15 - (32 * 5) / 9],
    ['temperature', 'K', 1, ['k', 'kelvin', 'kelvins'], 0],
    ['volume', 'ml', 0.001, ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres']],
    ['volume', 'cl', 0.01, ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres']],
    ['volume', 'dl', 0.1, ['dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres']],
    ['volume', 'l', 1, ['l', 'liter', 'liters', 'litre', 'litres']],
    ['volume', 'm³', 1000, ['m3', 'm³', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres']],
    ['volume', 'tsp', 0.00492892159375, ['tsp', 'teaspoon', 'teaspoons']],
    ['volume', 'tbsp', 0.01478676478125, ['tbsp', 'tablespoon', 'tablespoons']],
    ['volume', 'fl oz', 0.0295735295625, ['fl oz', 'floz', 'fluid ounce', 'fluid ounces']],
    ['volume', 'cups', 0.2365882365, ['cup', 'cups']],
    ['volume', 'pt', 0.473176473, ['pt', 'pint', 'pints']],
    ['volume', 'qt', 0.946352946, ['qt', 'quart', 'quarts']],
    ['volume', 'gal', 3.785411784, ['gal', 'gallon', 'gallons']],
    ['speed', 'm/s', 1, ['m/s', 'mps', 'meters per second', 'metres per second']],
    ['speed', 'km/h', 1 / 3.6, ['km/h', 'kmh', 'kph', 'kmph', 'kilometers per hour', 'kilometres per hour']],
    ['speed', 'mph', 0.44704, ['mph', 'mi/h', 'miles per hour']],
    ['speed', 'kn', 1852 / 3600, ['kn', 'kt', 'knot', 'knots']],
    ['speed', 'ft/s', 0.3048, ['ft/s', 'fps', 'feet per second']],
    ['data', 'bits', 0.125, ['bit', 'bits']],
    ['data', 'B', 1, ['b', 'byte', 'bytes']],
    ['data', 'KB', 1e3, ['kb', 'kilobyte', 'kilobytes']],
    ['data', 'MB', 1e6, ['mb', 'megabyte', 'megabytes']],
    ['data', 'GB', 1e9, ['gb', 'gigabyte', 'gigabytes']],
    ['data', 'TB', 1e12, ['tb', 'terabyte', 'terabytes']],
    ['data', 'KiB', 1024, ['kib', 'kibibyte', 'kibibytes']],
    ['data', 'MiB', 1024 ** 2, ['mib', 'mebibyte', 'mebibytes']],
    ['data', 'GiB', 1024 ** 3, ['gib', 'gibibyte', 'gibibytes']],
    ['data', 'TiB', 1024 ** 4, ['tib', 'tebibyte', 'tebibytes']],
    ['time', 'ms', 0.001, ['ms', 'millisecond', 'milliseconds']],
    ['time', 's', 1, ['s', 'sec', 'secs', 'second', 'seconds']],
    ['time', 'min', 60, ['min', 'mins', 'minute', 'minutes']],
    ['time', 'h', 3600, ['h', 'hr', 'hrs', 'hour', 'hours']],
    ['time', 'days', 86400, ['d', 'day', 'days']],
    ['time', 'weeks', 604800, ['wk', 'wks', 'week', 'weeks']],
    ['time', 'years', 31557600, ['yr', 'yrs', 'year', 'years']],
    ['area', 'cm²', 1e-4, ['cm2', 'cm²', 'square centimeter', 'square centimeters', 'square centimetre', 'square centimetres']],
    ['area', 'm²', 1, ['m2', 'm²', 'sqm', 'square meter', 'square meters', 'square metre', 'square metres']],
    ['area', 'km²', 1e6, ['km2', 'km²', 'square kilometer', 'square kilometers', 'square kilometre', 'square kilometres']],
    ['area', 'ha', 1e4, ['ha', 'hectare', 'hectares']],
    ['area', 'ft²', 0.09290304, ['ft2', 'ft²', 'sqft', 'sq ft', 'square foot', 'square feet']],
    ['area', 'acres', 4046.8564224, ['ac', 'acre', 'acres']],
    ['area', 'mi²', 2589988.110336, ['mi2', 'mi²', 'square mile', 'square miles']],
];

const UNIT_NAMES = new Map<string, Unit>();
for (const [quantity, symbol, factor, names, offset] of UNITS) {
    for (const name of names) UNIT_NAMES.set(name, offset === undefined ? { quantity, symbol, factor } : { quantity, symbol, factor, offset });
}

/** The currencies the European Central Bank publishes rates for. */
const CURRENCIES = new Set(
    'AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR'.split(' '),
);
const CURRENCY_NAMES = new Map<string, string>([
    ['$', 'USD'],
    ['us$', 'USD'],
    ['dollar', 'USD'],
    ['dollars', 'USD'],
    ['€', 'EUR'],
    ['euro', 'EUR'],
    ['euros', 'EUR'],
    ['£', 'GBP'],
    ['¥', 'JPY'],
    ['yen', 'JPY'],
    ['rp', 'IDR'],
    ['rupiah', 'IDR'],
    ['₹', 'INR'],
    ['rupee', 'INR'],
    ['rupees', 'INR'],
    ['yuan', 'CNY'],
    ['₩', 'KRW'],
    ['won', 'KRW'],
    ['baht', 'THB'],
    ['ringgit', 'MYR'],
]);

/** Words between the two units: "10 km to mi", "in", "into", "=", "->". */
const CONNECTORS = new Set(['to', 'in', 'into', 'as', '=', '->', '→']);

function currency(text: string): string | null {
    const upper = text.toUpperCase();
    return CURRENCIES.has(upper) ? upper : (CURRENCY_NAMES.get(text) ?? null);
}

/**
 * What `text` asks to convert, or null when it is not a conversion. The
 * amount comes first (a currency sign may lead it); commas group thousands
 * and a dot marks decimals.
 */
export function parseConversion(text: string): Conversion | null {
    const match = /^\s*([^\d\s.,-]{1,3})?\s*(-?(?:\d[\d,]*(?:\.\d+)?|\.\d+))\s*(.+)$/u.exec(text.toLowerCase());
    if (!match) return null;
    const [, sign, number, rest] = match;
    const amount = Number(number.replace(/,/g, ''));
    if (!Number.isFinite(amount)) return null;
    const words = rest.trim().split(/\s+/);
    // Every connector word is a possible split: "10 in in cm".
    for (let at = 0; at < words.length; at++) {
        if (!CONNECTORS.has(words[at])) continue;
        const fromText = [sign, ...words.slice(0, at)].filter(Boolean).join(' ');
        const toText = words.slice(at + 1).join(' ');
        if (!fromText || !toText) continue;
        const fromCurrency = currency(fromText);
        const toCurrency = currency(toText);
        if (fromCurrency && toCurrency) return { kind: 'currency', amount, from: fromCurrency, to: toCurrency };
        if (sign) continue;
        const from = UNIT_NAMES.get(fromText);
        const to = UNIT_NAMES.get(toText);
        if (from && to && from.quantity === to.quantity) return { kind: 'unit', amount, from, to };
    }
    return null;
}

export function convertUnit(amount: number, from: Unit, to: Unit): number {
    const base = amount * from.factor + (from.offset ?? 0);
    return (base - (to.offset ?? 0)) / to.factor;
}

/** Exchange rates as the Frankfurter API gives them, or null. */
export function parseRates(json: string): Rates | null {
    try {
        const data = JSON.parse(json) as Partial<Rates>;
        if (typeof data.base !== 'string' || typeof data.date !== 'string' || typeof data.rates !== 'object' || !data.rates) return null;
        return { base: data.base, date: data.date, rates: data.rates };
    } catch {
        return null;
    }
}

/** `amount` of `rates.base` in `to`, or null when there is no rate for it. */
export function convertCurrency(amount: number, to: string, rates: Rates): number | null {
    if (to === rates.base) return amount;
    const rate = rates.rates[to];
    return typeof rate === 'number' ? amount * rate : null;
}

/**
 * `value` for reading: grouped thousands and six significant digits, or
 * exactly `fraction` decimals (money).
 */
export function formatAmount(value: number, fraction?: number): string {
    const options: Intl.NumberFormatOptions = fraction === undefined ? { maximumSignificantDigits: 6 } : { minimumFractionDigits: fraction, maximumFractionDigits: fraction };
    return new Intl.NumberFormat('en-US', options).format(value);
}
