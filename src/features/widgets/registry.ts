import { BatteriesWidget } from './batteries.js';
import { CalendarWidget } from './calendar.js';
import { ClockWidget } from './clock.js';
import type { Box, WidgetId, WidgetSize } from './logic/widgets.js';
import { PhotosWidget } from './photos.js';
import { WeatherWidget } from './weather.js';
import type { DesktopWidget, WidgetHost } from './widget.js';

/** Each widget's class, by its id. */
export type WidgetClass = new (id: WidgetId, size: WidgetSize, box: Box, host: WidgetHost) => DesktopWidget;

export const WIDGETS: Record<WidgetId, WidgetClass> = {
    clock: ClockWidget,
    calendar: CalendarWidget,
    weather: WeatherWidget,
    batteries: BatteriesWidget,
    photos: PhotosWidget,
};
