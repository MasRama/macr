/** GNOME's clock settings (org.gnome.desktop.interface) that shape the label. */
export interface ClockSettings {
    use24h: boolean;
    showWeekday: boolean;
    showDate: boolean;
    showSeconds: boolean;
}

/**
 * GLib.DateTime format for the menu bar clock, macOS style: "Thu 12 Nov  10:30".
 * Names follow the locale (LC_TIME), so Indonesian reads "Kam 12 Nov".
 */
export function clockFormat(settings: ClockSettings): string {
    const seconds = settings.showSeconds ? ':%S' : '';
    const time = settings.use24h ? `%H:%M${seconds}` : `%-l:%M${seconds} %p`;
    const day = [settings.showWeekday ? '%a' : '', settings.showDate ? '%-d %b' : ''].filter(Boolean).join(' ');
    return day ? `${day}  ${time}` : time;
}
