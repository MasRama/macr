import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convertCurrency, convertUnit, formatAmount, parseConversion, parseRates } from '../../src/features/spotlight/logic/convert.js';

function unit(text: string): string {
    const query = parseConversion(text);
    assert.ok(query && query.kind === 'unit', `${text} is a unit conversion`);
    return `${formatAmount(convertUnit(query.amount, query.from, query.to))} ${query.to.symbol}`;
}

test('converts lengths, masses and volumes', () => {
    assert.equal(unit('10 km to mi'), '6.21371 mi');
    assert.equal(unit('5kg in lb'), '11.0231 lb');
    assert.equal(unit('2 cups to ml'), '473.176 ml');
    assert.equal(unit('6 feet in cm'), '182.88 cm');
    assert.equal(unit('1 mile = m'), '1,609.34 m');
});

test('converts temperatures, which have an offset', () => {
    assert.equal(unit('100 f to c'), '37.7778 °C');
    assert.equal(unit('-40 °C in °F'), '-40 °F');
    assert.equal(unit('0 celsius to kelvin'), '273.15 K');
});

test('converts speed, data, time and area', () => {
    assert.equal(unit('100 km/h to mph'), '62.1371 mph');
    assert.equal(unit('1 GiB to MB'), '1,073.74 MB');
    assert.equal(unit('90 min to h'), '1.5 h');
    assert.equal(unit('1 acre to m2'), '4,046.86 m²');
});

test('"in" can be a unit and the word between the units', () => {
    assert.equal(unit('10 in in cm'), '25.4 cm');
    assert.equal(unit('2 ft to in'), '24 in');
});

test('reads thousands separators and decimals', () => {
    assert.equal(unit('1,500.5 m to km'), '1.5005 km');
    assert.equal(unit('.5 l to ml'), '500 ml');
});

test('units of different kinds do not convert', () => {
    assert.equal(parseConversion('10 km to kg'), null);
    assert.equal(parseConversion('10 km to'), null);
    assert.equal(parseConversion('km to mi'), null);
    assert.equal(parseConversion('open firefox'), null);
    assert.equal(parseConversion('10 apples to pears'), null);
});

test('reads currencies by code, symbol and name', () => {
    assert.deepEqual(parseConversion('50 eur to idr'), { kind: 'currency', amount: 50, from: 'EUR', to: 'IDR' });
    assert.deepEqual(parseConversion('$20 in rupiah'), { kind: 'currency', amount: 20, from: 'USD', to: 'IDR' });
    assert.deepEqual(parseConversion('1.000 JPY to usd'), { kind: 'currency', amount: 1, from: 'JPY', to: 'USD' });
    assert.deepEqual(parseConversion('€ 5 to £'), { kind: 'currency', amount: 5, from: 'EUR', to: 'GBP' });
    assert.equal(parseConversion('5 eur to km'), null);
});

test('reads exchange rates and converts with them', () => {
    const rates = parseRates('{"amount":1.0,"base":"USD","date":"2026-11-12","rates":{"EUR":0.90245,"IDR":18253}}');
    assert.deepEqual(rates, { base: 'USD', date: '2026-11-12', rates: { EUR: 0.90245, IDR: 18253 } });
    assert.equal(convertCurrency(20, 'IDR', rates!), 365060);
    assert.equal(convertCurrency(20, 'USD', rates!), 20);
    assert.equal(convertCurrency(20, 'CHF', rates!), null);
    assert.equal(parseRates('not json'), null);
    assert.equal(parseRates('{"message":"not found"}'), null);
});

test('formats amounts for reading', () => {
    assert.equal(formatAmount(365060, 2), '365,060.00');
    assert.equal(formatAmount(0.000123456789), '0.000123457');
    assert.equal(formatAmount(1234567.891), '1,234,570');
});
