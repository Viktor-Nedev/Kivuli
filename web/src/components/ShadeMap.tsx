import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SITE } from '../lib/site';
import { shadowsAt, sunPositionAt, isPointShaded, type Building, type ShadowFeature } from '../map/shadows';
import buildingsGeoJson from '../map/jkuat_buildings.geojson?url';
import type { TimelinePoint } from '../lib/types';

const SHADOW_SOURCE = 'kivuli-shadows';
const SHADOW_LAYER = 'kivuli-shadows-fill';
const ROUTE_SOURCE = 'kivuli-route';
const ROUTE_LAYER = 'kivuli-route-line';

/** Two points a short walk apart on campus, used to demonstrate a shaded route. */
const ROUTE_ENDPOINTS: [[number, number], [number, number]] = [
  [37.0132, -1.0962],
  [37.0158, -1.0946],
];

/** Minutes since local midnight, on the 24h scale the slider uses. */
function minutesToDate(baseDate: string, minutes: number): Date {
  const base = new Date(`${baseDate}T00:00:00+03:00`);
  return new Date(base.getTime() + minutes * 60_000);
}

function localHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Builds a short walking path between the two route endpoints, sampled every
 * ~15m, so shade coverage can be evaluated along its length rather than only
 * at the two ends.
 */
function sampleRoute(from: [number, number], to: [number, number], steps = 20): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
  }
  return pts;
}

/**
 * Campus shade map.
 *
 * Shadows come from building geometry projected along the sun's real
 * position for the selected time, not from interpolating the station's
 * single-point reading across the map. WBGT colouring at the bottom uses the
 * day's already-computed timeline, so exposed ground is graded by conditions
 * that were actually measured, just recombined with where the sun is.
 */
export function ShadeMap({
  token,
  dayDate,
  timeline,
}: {
  token: string | null;
  dayDate: string;
  timeline: TimelinePoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [minutes, setMinutes] = useState(13 * 60);
  const [buildings, setBuildings] = useState<Building[] | null>(null);

  const selectedDate = useMemo(() => minutesToDate(dayDate, minutes), [dayDate, minutes]);
  const sun = useMemo(() => sunPositionAt(selectedDate), [selectedDate]);

  const wbgtNow = useMemo(() => {
    if (!timeline.length) return null;
    // Nearest timeline sample to the slider's minute-of-day.
    const target = minutesToDate(dayDate, minutes).getTime();
    let best = timeline[0];
    let bestDiff = Infinity;
    for (const p of timeline) {
      const diff = Math.abs(new Date(p.ts).getTime() - target);
      if (diff < bestDiff) {
        best = p;
        bestDiff = diff;
      }
    }
    return best.wbgtC;
  }, [timeline, dayDate, minutes]);

  // Load building footprints once.
  useEffect(() => {
    let cancelled = false;
    fetch(buildingsGeoJson)
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const parsed: Building[] = fc.features.map((f, i) => ({
          id: String(f.properties?.id ?? i),
          footprint: (f.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][],
          heightM: Number(f.properties?.heightM ?? 6.2),
        }));
        setBuildings(parsed);
      })
      .catch(() => setBuildings([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialise the map once a token is available.
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [SITE.longitude, SITE.latitude],
      zoom: 16.2,
      // A steeper pitch (tried 55°) buried ground-level shadows behind the
      // buildings' own extruded side walls from this camera angle — visually
      // indistinguishable even though the shadow geometry was correct. A
      // shallower pitch keeps the 3D building read while leaving shadows
      // visible on the ground plane next to them.
      pitch: 35,
      bearing: -17,
      antialias: true,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as any).__kivuliDebugMap = map;

    map.on('load', () => {
      map.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#273553',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 6.2],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      });

      // A warm ground wash under everything: exposed ground reads in the
      // product's sun palette rather than as flat basemap grey, so shade
      // shows up as a visible absence of that warmth rather than needing a
      // dark-on-dark overlay to register against the dark basemap.
      map.addLayer(
        {
          id: 'ground-exposure',
          type: 'background',
          paint: { 'background-color': '#e8a33d', 'background-opacity': 0.16 },
        },
        '3d-buildings',
      );

      map.addSource(SHADOW_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Shadow polygons cut back through the warm wash with the map's own
      // shade-blue, so a shaded street reads as a cool patch against the
      // warm ground rather than a dark shape that has to compete with an
      // already-dark basemap.
      //
      // Rendered as a near-flat fill-extrusion, not a plain 2D fill: Mapbox
      // GL always composites fill-extrusion layers in front of 2D fill
      // layers regardless of style order, so at this map's oblique pitch a
      // flat fill shadow silently disappears behind the extruded buildings
      // even though it is listed above them. A 0.2m extrusion keeps the
      // shadow in the same 3D pass as the buildings it needs to sit beside.
      map.addLayer({
        id: SHADOW_LAYER,
        type: 'fill-extrusion',
        source: SHADOW_SOURCE,
        paint: {
          'fill-extrusion-color': '#0b1220',
          // Tall enough to catch the renderer's own directional lighting on
          // its vertical faces (a pure 0.05-0.2m sliver reads as flat and
          // blends into the ground plane at this pitch); still far too short
          // to be mistaken for a real structure next to 3-18m buildings.
          'fill-extrusion-height': 1.2,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.95,
        },
      });

      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f2b955', 'line-width': 4 },
      });

      new mapboxgl.Marker({ color: '#d2603a' })
        .setLngLat([SITE.longitude, SITE.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Conduit station'))
        .addTo(map);

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Recompute and redraw shadows whenever the time or building set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !buildings) return;

    const shadows: ShadowFeature[] = shadowsAt(buildings, selectedDate);
    const source = map.getSource(SHADOW_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: shadows });

    // Colour the route by how much of it sits in shade at this time, so the
    // line itself communicates the "cool route" rather than a separate label.
    const routePts = sampleRoute(...ROUTE_ENDPOINTS);
    const shadedCount = routePts.filter((p) => isPointShaded(p, shadows)).length;
    const shadedFraction = shadedCount / routePts.length;

    const routeSource = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { shadedFraction },
          geometry: { type: 'LineString', coordinates: routePts },
        },
      ],
    });
  }, [buildings, selectedDate, ready]);

  const routeShadeNote = useMemo(() => {
    if (!buildings || !ready) return null;
    const shadows = shadowsAt(buildings, selectedDate);
    const pts = sampleRoute(...ROUTE_ENDPOINTS);
    const shaded = pts.filter((p) => isPointShaded(p, shadows)).length;
    return Math.round((shaded / pts.length) * 100);
  }, [buildings, selectedDate, ready]);

  if (!token) {
    return (
      <section className="border-t border-shade-700 py-8">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Campus shade map
        </h2>
        <p className="mt-3 text-sm text-shade-200">
          Set <code className="rounded bg-shade-800 px-1.5 py-0.5 text-sun-300">MAPBOX_TOKEN</code>{' '}
          in <code className="rounded bg-shade-800 px-1.5 py-0.5 text-sun-300">.env</code> to enable
          the shade map.
        </p>
      </section>
    );
  }

  return (
    <section className="border-t border-shade-700 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Campus shade map
        </h2>
        <p className="text-xs text-shade-400">
          {sun.altitude > 0 ? `Sun ${(sun.altitude * (180 / Math.PI)).toFixed(0)}° above horizon` : 'Sun below horizon'}
        </p>
      </div>

      <div
        ref={containerRef}
        className="mt-4 h-[420px] w-full overflow-hidden rounded ring-1 ring-shade-700"
      />

      <div className="mt-4 flex items-center gap-4">
        <span className="w-14 shrink-0 font-display text-lg tabular-nums text-bleach">
          {localHHMM(minutes)}
        </span>
        <input
          type="range"
          min={360}
          max={1080}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="w-full accent-sun-400"
          aria-label="Time of day"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-shade-400">Ground WBGT at this time</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-bleach">
            {wbgtNow != null ? `${wbgtNow.toFixed(1)} °C` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-shade-400">Sample walking route, in shade</p>
          <p className="mt-1 font-display text-2xl tabular-nums text-bleach">
            {routeShadeNote != null ? `${routeShadeNote}%` : '—'}
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-shade-400">
        Shadows are projected from building footprints and the sun's real position at the selected
        time — geometry, not an interpolation of the station reading across the campus. Most
        buildings use a synthetic height where OpenStreetMap has no height tag; only 18 of 133
        buildings in this footprint carry a surveyed height.
      </p>
    </section>
  );
}
