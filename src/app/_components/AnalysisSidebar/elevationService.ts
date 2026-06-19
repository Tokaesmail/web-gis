
export async function getElevation(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
    );

    const data = await res.json();
    return data?.results?.[0]?.elevation ?? null;
  } catch (err) {
    return null;
  }
}