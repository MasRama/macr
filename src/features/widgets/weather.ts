import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { dayRange, type WidgetId } from './logic/widgets.js';
import { DesktopWidget, type WidgetHost } from './widget.js';

/** GWeather's TemperatureUnit.DEFAULT: the unit of the user's locale. */
const DEFAULT_UNIT = 1;
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

/** The macOS weather widget: the place, the temperature now, the sky and today's high and low. */
export class WeatherWidget extends DesktopWidget {
    private readonly client: WeatherClient | null;
    private readonly clientId: number;
    private readonly place: St.Label;
    private readonly temperature: St.Label;
    private readonly icon: St.Icon;
    private readonly sky: St.Label;
    private readonly range: St.Label;
    private timerId = 0;

    constructor(id: WidgetId, size: number, host: WidgetHost) {
        super(id, size, host);
        const box = new St.BoxLayout({ style_class: 'macr-widget-weather-box', vertical: true, x_expand: true, y_expand: true });
        this.place = new St.Label({ style_class: 'macr-widget-weather-place' });
        this.temperature = new St.Label({ style_class: 'macr-widget-weather-temp' });
        this.icon = new St.Icon({ style_class: 'macr-widget-weather-icon', x_align: Clutter.ActorAlign.START });
        this.sky = new St.Label({ style_class: 'macr-widget-weather-sky' });
        this.range = new St.Label({ style_class: 'macr-widget-weather-range' });
        for (const label of [this.place, this.sky]) label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(this.place);
        box.add_child(this.temperature);
        box.add_child(new St.Widget({ y_expand: true }));
        box.add_child(this.icon);
        box.add_child(this.sky);
        box.add_child(this.range);
        this.actor.add_child(box);

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
