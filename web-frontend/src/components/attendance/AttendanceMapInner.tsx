"use client";

// Interactive Leaflet map for the attendance dashboard. Client-only (Leaflet
// needs `window`), so this is always loaded via next/dynamic with ssr:false
// from AttendanceMap.tsx — never import it directly in a server component.
//
// Two modes:
//   • team   — plots employee pins (field-work live + working last-known)
//   • route  — draws a field-work route polyline + start/end + dwell markers
//
// Uses OpenStreetMap tiles (same as the rest of the product) and Leaflet
// divIcons so we don't depend on marker image assets that break under bundlers.

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };
export type TeamPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  live: boolean; // field work = live; working = last known
};
export type RoutePoint = { lat: number; lng: number };
export type DwellMarker = { lat: number; lng: number; label: string };

const BLUE = "#3566F6"; // working / route
const PURPLE = "#8B5CF6"; // field work (live)
const GREEN = "#16A77A"; // start
const RED = "#D64545"; // end
const AMBER = "#B77900"; // dwell

function pinIcon(color: string, glyph: string, live: boolean) {
  const pulse = live
    ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:.25;animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite"></span>`
    : "";
  return L.divIcon({
    className: "ellipse-pin",
    html: `<div style="position:relative;display:grid;place-items:center">
      ${pulse}
      <span style="position:relative;width:22px;height:22px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font:600 10px/1 system-ui">${glyph}</span>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function labelPin(name: string, color: string) {
  return L.divIcon({
    className: "ellipse-label",
    html: `<div style="transform:translate(-50%,-140%);white-space:nowrap;background:#fff;color:#1D2825;font:600 11px/1 system-ui;padding:4px 8px;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,.18);border-left:3px solid ${color}">${name}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function dwellIcon(label: string) {
  return L.divIcon({
    className: "ellipse-dwell",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-50%)">
      <span style="width:18px;height:18px;border-radius:9999px;background:${AMBER};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span>
      <span style="margin-top:2px;background:${AMBER};color:#fff;font:600 9px/1 system-ui;padding:2px 5px;border-radius:6px;white-space:nowrap">${label}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [9, 9],
  });
}

/** Fits the map to the given bounds whenever they change. */
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}

/** Imperatively pans/zooms to a point (used by team search "locate"). */
function FlyTo({ target }: { target: (LatLng & { z?: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.z ?? 16, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export type AttendanceMapInnerProps = {
  mode: "team" | "route";
  pins?: TeamPin[];
  route?: RoutePoint[];
  dwell?: DwellMarker[];
  flyTo?: (LatLng & { z?: number }) | null;
  className?: string;
};

export default function AttendanceMapInner({
  mode,
  pins = [],
  route = [],
  dwell = [],
  flyTo = null,
  className,
}: AttendanceMapInnerProps) {
  const points = useMemo<[number, number][]>(() => {
    if (mode === "route") return route.map((p) => [p.lat, p.lng]);
    return pins.map((p) => [p.lat, p.lng]);
  }, [mode, route, pins]);

  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!points.length) return null;
    if (points.length === 1) {
      const [lat, lng] = points[0];
      return [
        [lat - 0.008, lng - 0.012],
        [lat + 0.008, lng + 0.012],
      ];
    }
    return points as L.LatLngBoundsExpression;
  }, [points]);

  const center: [number, number] = points[0] ?? [0.3429, 32.5907]; // Kampala default

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className={className}
      style={{ height: "100%", width: "100%", background: "#e9ece8" }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <FitBounds bounds={bounds} />
      <FlyTo target={flyTo} />

      {mode === "route" && route.length >= 2 && (
        <>
          {/* White casing under a bold blue core = navigation route look. */}
          <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#fff", weight: 9 }} />
          <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: BLUE, weight: 5 }} />
          <Marker position={[route[0].lat, route[0].lng]} icon={pinIcon(GREEN, "A", false)} />
          <Marker position={[route[route.length - 1].lat, route[route.length - 1].lng]} icon={pinIcon(RED, "B", false)} />
          {dwell.map((d, i) => (
            <Marker key={i} position={[d.lat, d.lng]} icon={dwellIcon(d.label)} />
          ))}
        </>
      )}

      {mode === "team" &&
        pins.map((p) => (
          <div key={p.id}>
            <Marker
              position={[p.lat, p.lng]}
              icon={pinIcon(p.live ? PURPLE : BLUE, "", p.live)}
            />
            <Marker
              position={[p.lat, p.lng]}
              icon={labelPin(p.name.split(" ")[0], p.live ? PURPLE : BLUE)}
              interactive={false}
            />
          </div>
        ))}
    </MapContainer>
  );
}
