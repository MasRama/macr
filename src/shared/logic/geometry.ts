export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type Placement = 'left' | 'right' | 'fill' | 'center';

/** Where a window goes inside its monitor's work area. */
export function placeWindow(placement: Placement, area: Rect, current: Rect): Rect {
    const half = Math.floor(area.width / 2);
    switch (placement) {
        case 'left':
            return { x: area.x, y: area.y, width: half, height: area.height };
        case 'right':
            return { x: area.x + half, y: area.y, width: area.width - half, height: area.height };
        case 'fill':
            return { ...area };
        case 'center': {
            const width = Math.min(current.width, area.width);
            const height = Math.min(current.height, area.height);
            return {
                x: area.x + Math.floor((area.width - width) / 2),
                y: area.y + Math.floor((area.height - height) / 2),
                width,
                height,
            };
        }
    }
}
