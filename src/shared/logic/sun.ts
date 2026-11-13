/** Sunrise and sunset in hours; without a location (gsd says -1) the day runs 6:00 to 18:00. */
export function sunTimes(sunrise: number, sunset: number): { sunrise: number; sunset: number } {
    const known = sunrise >= 0 && sunset >= 0 && sunrise < 24 && sunset <= 24 && sunrise < sunset;
    return known ? { sunrise, sunset } : { sunrise: 6, sunset: 18 };
}
