import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { type Box, dailyForecast, dayRange, type ForecastItem, hourlyForecast, rangeBar, type WidgetId, type WidgetSize } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** GWeather's TemperatureUnit.DEFAULT: the unit of the user's locale. */
const DEFAULT_UNIT = 1;
/** The large widget's days, and its range bars' track width (logical px). */
const DAYS = 5;
const TRACK_WIDTH = 96;
/** GNOME's weather client asks again at most this often (seconds). */
const REFRESH_SECONDS = 30 * 60;

/** The parts of GWeather.Info the widget reads (GWeather has no typings here). */
interface WeatherInfo {
    is_valid(): boolean;
    network_error(): boolean;
    is_daytime(): boolean;
    get_value_temp(unit: number): [boolean, number];
    get_value_update(): [boolean, number];
    get_symbolic_icon_name(): string;
    get_sky(): string;
    get_conditions(): string;
    get_location_name(): string;
    get_forecast_list(): WeatherInfo[];
}

/** GNOME Shell's WeatherClient (misc/weather.js), the one the Notification Center uses. */
interface WeatherClient {
    readonly available: boolean;
    readonly loading: boolean;
    readonly hasLocation: boolean;
    readonly info: WeatherInfo;
    update(): void;
    activateApp(): void;
    connect(signal: 'changed', callback: () => void): number;
    disconnect(id: number): void;
}

/**
 * The shell's own weather client, from the date menu's weather section.
 * Shared rather than made anew: a WeatherClient never lets go of its signals.
 */
function shellWeather(): WeatherClient | null {
    const dateMenu = Main.panel.statusArea.dateMenu as unknown as { _weatherItem?: { _weatherClient?: WeatherClient } } | undefined;
    return dateMenu?._weatherItem?._weatherClient ?? null;
}

/**
 * The macOS weather widget: the place, the temperature now, the sky and
 * today's high and low; medium adds the next hours, large the next days.
 */
export class WeatherWidget extends DesktopWidget {
    private readonly client: WeatherClient | null;
    private readonly clientId: number;
    private readonly place: St.Label;
    private readonly temperature: St.Label;
    private readonly icon: St.Icon;
    private readonly sky: St.Label;
    private readonly range: St.Label;
    private readonly hours: St.BoxLayout | null = null;
    private readonly days: St.BoxLayout | null = null;
    private timerId = 0;
    private readonly clockSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

    constructor(id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) {
        super(id, size, box, host);
        this.place = new St.Label({ style_class: 'macr-widget-weather-place' });
        this.temperature = new St.Label({ style_class: 'macr-widget-weather-temp' });
        this.icon = new St.Icon({ style_class: 'macr-widget-weather-icon', x_align: size === 'medium' ? Clutter.ActorAlign.END : Clutter.ActorAlign.START });
        this.sky = new St.Label({ style_class: 'macr-widget-weather-sky' });
        this.range = new St.Label({ style_class: 'macr-widget-weather-range' });
        for (const label of [this.place, this.sky]) label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const content = new St.BoxLayout({ style_class: 'macr-widget-weather-box', vertical: true, x_expand: true, y_expand: true });
        if (size !== 'small') {
            // The place and temperature on the left, the sky on the right, the next hours under them.
            const top = new St.BoxLayout({ x_expand: true });
            const left = new St.BoxLayout({ vertical: true, x_expand: true });
            left.add_child(this.place);
            left.add_child(this.temperature);
            const right = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END });
            for (const label of [this.sky, this.range]) label.x_align = Clutter.ActorAlign.END;
            right.add_child(this.icon);
            right.add_child(this.sky);
            right.add_child(this.range);
            top.add_child(left);
            top.add_child(right);
            content.add_child(top);
            if (size === 'medium') content.add_child(new St.Widget({ y_expand: true }));
            this.hours = new St.BoxLayout({ style_class: 'macr-widget-weather-hours', x_expand: true });
            content.add_child(this.hours);
            if (size === 'large') {
                this.days = new St.BoxLayout({ style_class: 'macr-widget-weather-days', vertical: true, x_expand: true, y_expand: true });
                content.add_child(this.days);
            }
        } else {
            content.add_child(this.place);
            content.add_child(this.temperature);
            content.add_child(new St.Widget({ y_expand: true }));
            content.add_child(this.icon);
            content.add_child(this.sky);
            content.add_child(this.range);
        }
        this.actor.add_child(content);

        this.client = shellWeather();
        this.clientId = this.client?.connect('changed', () => this.sync()) ?? 0;
        this.client?.update();
        this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, REFRESH_SECONDS, () => {
            this.client?.update();
            return GLib.SOURCE_CONTINUE;
        });
        this.sync();
    }

    override destroy(): void {
        if (this.timerId) GLib.source_remove(this.timerId);
        this.timerId = 0;
        if (this.client && this.clientId) this.client.disconnect(this.clientId);
        super.destroy();
    }

    protected activate(): void {
        if (this.client?.available) this.client.activateApp();
        else this.openApp('org.gnome.Weather.desktop');
    }

    private sync(): void {
        const client = this.client;
        const info = client?.info;
        const ready = Boolean(client?.available && client.hasLocation && !client.loading && info?.is_valid());
        this.temperature.visible = ready;
        this.icon.visible = ready;
        this.range.visible = ready;
        for (const box of [this.hours, this.days]) {
            if (!box) continue;
            box.visible = ready;
            box.destroy_all_children();
        }
        if (!client || !info || !ready) {
            this.actor.remove_style_class_name('night');
            this.place.text = _('Weather');
            if (!client?.available) this.sky.text = _('Install Weather to see the forecast');
            else if (!client.hasLocation) this.sky.text = _('Choose a place in Weather');
            else if (client.loading) this.sky.text = _('Loading…');
            else if (info?.network_error()) this.sky.text = _('Go online for weather information');
            else this.sky.text = _('Weather information is unavailable');
            this.sky.clutter_text.line_wrap = true;
            return;
        }
        this.sky.clutter_text.line_wrap = false;
        if (info.is_daytime()) this.actor.remove_style_class_name('night');
        else this.actor.add_style_class_name('night');
        this.place.text = info.get_location_name();
        const [, now] = info.get_value_temp(DEFAULT_UNIT);
        this.temperature.text = `${Math.round(now)}°`;
        this.icon.icon_name = info.get_symbolic_icon_name();
        const conditions = info.get_conditions();
        this.sky.text = conditions && conditions !== '-' ? conditions : info.get_sky();
        const range = dayRange([now, ...this.todaysForecast(info)]);
        this.range.text = range ? _('H:%s° L:%s°').format(String(range.high), String(range.low)) : '';
        if (this.hours) this.buildHours(info);
        if (this.days) this.buildDays(info, now);
    }

    /** Every forecast with a time and a temperature. */
    private forecastItems(info: WeatherInfo): ForecastItem[] {
        const items: ForecastItem[] = [];
        for (const forecast of info.get_forecast_list()) {
            const [valid, time] = forecast.get_value_update();
            const [ok, temperature] = forecast.get_value_temp(DEFAULT_UNIT);
            if (valid && ok) items.push({ time, temperature, icon: forecast.get_symbolic_icon_name() });
        }
        return items;
    }

    /** Large: today and the next days, each with its sky, low, range bar and high. */
    private buildDays(info: WeatherInfo, now: number): void {
        const box = this.days;
        if (!box) return;
        const seconds = Math.floor(Date.now() / 1000);
        const days = dailyForecast([{ time: seconds, temperature: now, icon: info.get_symbolic_icon_name() }, ...this.forecastItems(info)], seconds, DAYS);
        if (days.length === 0) return;
        const min = Math.min(...days.map((day) => day.low));
        const max = Math.max(...days.map((day) => day.high));
        const scale = this.host.scale;
        const track = Math.round(TRACK_WIDTH * scale);
        const thickness = Math.round(4 * scale);
        days.forEach((day, index) => {
            const row = new St.BoxLayout({ style_class: 'macr-widget-weather-day', x_expand: true });
            const name = index === 0 ? _('Today') : (GLib.DateTime.new_from_unix_local(Math.floor(day.day / 1000)).format('%a') ?? '');
            row.add_child(new St.Label({ text: name, style_class: 'macr-widget-weather-day-name', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
            row.add_child(new St.Icon({ icon_name: day.icon, style_class: 'macr-widget-weather-day-icon', y_align: Clutter.ActorAlign.CENTER }));
            row.add_child(new St.Label({ text: `${day.low}°`, style_class: 'macr-widget-weather-day-low', y_align: Clutter.ActorAlign.CENTER }));
            const rail = new St.Widget({ style_class: 'macr-widget-weather-track', width: track, height: thickness, y_align: Clutter.ActorAlign.CENTER });
            const bar = rangeBar(day.low, day.high, min, max, track, thickness);
            rail.add_child(new St.Widget({ style_class: 'macr-widget-weather-bar', x: bar.x, width: bar.width, height: thickness }));
            row.add_child(rail);
            row.add_child(new St.Label({ text: `${day.high}°`, style_class: 'macr-widget-weather-day-high', y_align: Clutter.ActorAlign.CENTER }));
            box.add_child(row);
        });
    }

    /** Medium: the next six hours, each with its time, sky and temperature. */
    private buildHours(info: WeatherInfo): void {
        const hours = this.hours;
        if (!hours) return;
        const items = this.forecastItems(info);
        const twelve = this.clockSettings.get_string('clock-format') === '12h';
        for (const item of hourlyForecast(items, Math.floor(Date.now() / 1000), 6)) {
            const column = new St.BoxLayout({ style_class: 'macr-widget-weather-hour', vertical: true, x_expand: true });
            const time = GLib.DateTime.new_from_unix_local(item.time).format(twelve ? '%l %p' : '%H') ?? '';
            column.add_child(new St.Label({ text: time.trim(), style_class: 'macr-widget-weather-hour-time', x_align: Clutter.ActorAlign.CENTER }));
            column.add_child(new St.Icon({ icon_name: item.icon, style_class: 'macr-widget-weather-hour-icon', x_align: Clutter.ActorAlign.CENTER }));
            column.add_child(new St.Label({ text: `${Math.round(item.temperature)}°`, style_class: 'macr-widget-weather-hour-temp', x_align: Clutter.ActorAlign.CENTER }));
            hours.add_child(column);
        }
    }

    /** The forecast temperatures for the rest of today. */
    private todaysForecast(info: WeatherInfo): number[] {
        const today = GLib.DateTime.new_now_local().format('%F');
        const temperatures: number[] = [];
        for (const forecast of info.get_forecast_list()) {
            const [valid, time] = forecast.get_value_update();
            if (!valid || GLib.DateTime.new_from_unix_local(time).format('%F') !== today) continue;
            const [ok, value] = forecast.get_value_temp(DEFAULT_UNIT);
            if (ok) temperatures.push(value);
        }
        return temperatures;
    }
}
