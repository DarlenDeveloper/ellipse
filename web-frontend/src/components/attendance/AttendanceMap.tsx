"use client";

// Client-only wrapper around the Leaflet map. Next.js server rendering can't
// touch Leaflet (it needs `window`), so we load the inner map with ssr:false.
import dynamic from "next/dynamic";
import type { AttendanceMapInnerProps } from "./AttendanceMapInner";

export type { TeamPin, RoutePoint, DwellMarker, LatLng, AttendanceMapInnerProps } from "./AttendanceMapInner";

const AttendanceMapInner = dynamic(() => import("./AttendanceMapInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-gray-50 text-sm text-gray-400">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
    </div>
  ),
});

export default function AttendanceMap(props: AttendanceMapInnerProps) {
  return <AttendanceMapInner {...props} />;
}
