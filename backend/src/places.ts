import { HttpsError } from "firebase-functions/v2/https";

const PLACES_BASE = "https://places.googleapis.com/v1";

type PlacePrediction = {
  place?: string;
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

async function googleRequest(
  url: string,
  apiKey: string,
  init: RequestInit,
  fieldMask: string,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    console.error("Google Places request failed", response.status, body);
    throw new HttpsError(
      "unavailable",
      "Location search is temporarily unavailable. Please try again.",
    );
  }
  return body;
}

export async function autocompletePlaces(
  apiKey: string,
  args: Record<string, unknown>,
) {
  const input = String(args.input ?? "").trim().slice(0, 160);
  if (input.length < 2) return { suggestions: [] };
  const sessionToken = String(args.sessionToken ?? "").trim().slice(0, 128);
  if (!sessionToken) {
    throw new HttpsError("invalid-argument", "A Places session token is required.");
  }

  const payload: Record<string, unknown> = {
    input,
    sessionToken,
    languageCode: "en",
    regionCode: "UG",
    includedRegionCodes: ["ug"],
    includeQueryPredictions: false,
  };
  const latitude = Number(args.latitude);
  const longitude = Number(args.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180) {
    payload.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius: 50000,
      },
    };
  } else {
    payload.locationBias = {
      circle: {
        center: { latitude: 1.3733, longitude: 32.2903 },
        radius: 350000,
      },
    };
  }

  const data = await googleRequest(
    `${PLACES_BASE}/places:autocomplete`,
    apiKey,
    { method: "POST", body: JSON.stringify(payload) },
    "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
  );
  const raw = Array.isArray(data.suggestions) ? data.suggestions : [];
  const suggestions = raw.flatMap((item) => {
    const prediction = (item as { placePrediction?: PlacePrediction }).placePrediction;
    const placeId = String(prediction?.placeId ?? prediction?.place?.split("/").pop() ?? "");
    if (!prediction || !placeId) return [];
    const mainText = String(
      prediction.structuredFormat?.mainText?.text
      ?? prediction.text?.text
      ?? "Location",
    );
    const secondaryText = String(
      prediction.structuredFormat?.secondaryText?.text ?? "",
    );
    return [{ placeId, mainText, secondaryText, description: prediction.text?.text ?? mainText }];
  }).slice(0, 8);
  return { suggestions };
}

export async function getPlaceDetails(
  apiKey: string,
  args: Record<string, unknown>,
) {
  const placeId = String(args.placeId ?? "").trim();
  if (!/^[A-Za-z0-9_\-]+$/.test(placeId) || placeId.length > 256) {
    throw new HttpsError("invalid-argument", "A valid place is required.");
  }
  const sessionToken = String(args.sessionToken ?? "").trim().slice(0, 128);
  const query = sessionToken
    ? `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`
    : "?languageCode=en";
  const data = await googleRequest(
    `${PLACES_BASE}/places/${encodeURIComponent(placeId)}${query}`,
    apiKey,
    { method: "GET" },
    "id,displayName,formattedAddress,location,types",
  );
  const location = (data.location ?? {}) as Record<string, unknown>;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new HttpsError("not-found", "That place does not have a mappable location.");
  }
  return {
    place: {
      placeId: String(data.id ?? placeId),
      label: String((data.displayName as Record<string, unknown> | undefined)?.text ?? "Location"),
      address: String(data.formattedAddress ?? ""),
      latitude,
      longitude,
      types: Array.isArray(data.types) ? data.types : [],
    },
  };
}
