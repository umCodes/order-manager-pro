/** The phone's position, once (high accuracy, up to 15 s). */
export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This phone or browser can't share its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
  });
}

/** A readable reason the position couldn't be read. */
export function positionError(error: unknown) {
  if (typeof GeolocationPositionError !== "undefined" && error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "Location access was not allowed";
    if (error.code === error.TIMEOUT) return "The phone took too long to find its location";
    return "The phone couldn't find its location";
  }
  return error instanceof Error ? error.message : "The phone couldn't find its location";
}

/** A Google Maps link that opens exactly this point. */
export function googleMapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
