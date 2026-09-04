import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SITE } from '../lib/site';
import {
  shadowsAt,
  sunPositionAt,
  isPointShaded,
  lightPresetFor,
  type Building,
  type LightPreset,
  type ShadowFeature,
} from '../map/shadows';
import buildingsGeoJson from '../map/jkuat_buildings.geojson?url';
import type { TimelinePoint } from '../lib/types';
import { Gauge } from './Gauge';
import { LegendRow, MapPanel } from './MapPanels';
import { groundExposurePaint, routeColorFor, shadowPaint } from '../map/sunTint';

const SHADOW_SOURCE = 'kivuli-shadows';
const SHADOW_LAYER = 'kivuli-shadows-fill';
const ROUTE_SOURCE = 'kivuli-route';
const ROUTE_LAYER = 'kivuli-route-line';

type BuildingsState =
  | { phase: 'loading' }
  | { phase: 'ready'; buildings: Building[]; surveyed: number }
  | { phase: 'error' };

/**
 * Two points across campus. This is a straight transect, not a mapped
 * footpath — it cuts through buildings. The shade measured along it is real
 * (real footprints, real sun geometry), so it answers "how much shade would a
 * walk across this area find right now"; it does not claim to be a route
 * anyone actually walks, and the label says so.
 */
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
  // A bare `Building[] | null` could not tell "still loading" apart from
  // "loaded, but the fetch failed and we substituted an empty array" — and
  // the latter renders a perfectly plausible map with zero shadows and 0%
  // shade, presenting a failure as fact. On a project that tags every other
  // number with its provenance, that was the worst available failure mode.
  const [buildingsState, setBuildingsState] = useState<BuildingsState>({ phase: 'loading' });
  const [mapError, setMapError] = useState<string | null>(null);
  const buildings = buildingsState.phase === 'ready' ? buildingsState.buildings : null;

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
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((fc: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const parsed: Building[] = fc.features.map((f, i) => ({
          id: String(f.properties?.id ?? i),
          footprint: (f.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][],
          heightM: Number(f.properties?.heightM ?? 6.2),
        }));
        // Counted from the data rather than written into the caption, so the
        // provenance note cannot go stale when the geojson is regenerated.
        const surveyed = fc.features.filter(
          (f) => f.properties?.heightSource && f.properties.heightSource !== 'default',
        ).length;
        setBuildingsState({ phase: 'ready', buildings: parsed, surveyed });
      })
      .catch(() => {
        if (!cancelled) setBuildingsState({ phase: 'error' });
      });
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
      // Standard style (not a fixed dark-v11) so the map's own lighting can
      // shift across the day via setConfigProperty('basemap', 'lightPreset', ...)
      // below, without ever calling setStyle() again — setStyle() removes every
      // custom source/layer added after load, which would undo the shadow and
      // building layers added here.
      style: 'mapbox://styles/mapbox/standard',
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
      // A viewport-height map otherwise captures every wheel event as zoom,
      // trapping the page scroll. Cooperative gestures require ctrl/cmd (or
      // two fingers) to zoom, and pass a plain scroll through to the page.
      cooperativeGestures: true,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as any).__kivuliDebugMap = map;

    // The no-token branch below covers a *missing* token; this covers one
    // that is present but rejected, which otherwise renders a black
    // rectangle and console noise with no signal in the UI.
    map.on('error', (e) => {
      const message = e?.error?.message ?? 'The map failed to load.';
      setMapError(message);
    });

    // 'style.load' rather than 'load': the Standard style declares its
    // sources (e.g. "composite") via a style import that is not always fully
    // attached by the time the generic 'load' event fires, which surfaced as
    // `source "composite" not found` when adding the 3d-buildings layer.
    // 'style.load' fires once for the initial style too, not only after a
    // later setStyle() call, so this is a safe drop-in for the one-time
    // setup this map does.
    map.on('style.load', () => {
      // Standard's own building layer would otherwise render alongside this
      // project's #273553 extrusion — confirmed via the style's own config
      // schema that show3dBuildings is the property scoped to just buildings
      // (not show3dObjects, which would also hide trees/landmarks).
      map.setConfigProperty('basemap', 'show3dBuildings', false);

      // The Standard style's own buildings live inside its imported "basemap"
      // fragment, which is opaque to the top-level style API: addLayer
      // referencing source: 'composite' throws `source "composite" not
      // found`, confirmed live (getStyle() reports zero Mapbox-provided
      // sources/layers on a Standard-style map — only ones added here).
      // Extrude the project's own building footprints instead, the same
      // GeoJSON already used for shadow casting, as an ordinary GeoJSON
      // source loaded directly from its URL.
      map.addSource('kivuli-buildings', {
        type: 'geojson',
        data: buildingsGeoJson,
      });
      map.addLayer({
        id: '3d-buildings',
        source: 'kivuli-buildings',
        type: 'fill-extrusion',
        // Places this layer among the Standard style's own layers (roads,
        // labels) rather than on top of everything, so streets and place
        // labels still render over the extrusions as expected.
        slot: 'middle',
        paint: {
          'fill-extrusion-color': '#273553',
          'fill-extrusion-height': ['coalesce', ['get', 'heightM'], 6.2],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.85,
        },
      });

      // A warm cast over the whole scene, tying the basemap to the product's
      // sun palette so shade reads as an absence of warmth.
      //
      // Kept deliberately faint. A `background` layer covers the entire
      // viewport — roads, water and parks included, not just open ground —
      // so at the 0.16 opacity this started with, the basemap flattened into
      // a single sheet of peach and the shadow polygons had nothing to
      // contrast against. The wash is a tint, not a fill; the shadows are
      // what the eye should be reading.
      //
      // `slot: 'bottom'` puts it beneath the basemap's labels and roads
      // rather than over them, so place names stay crisp.
      map.addLayer({
        id: 'ground-exposure',
        type: 'background',
        slot: 'bottom',
        paint: { 'background-color': '#e8a33d', 'background-opacity': 0.05 },
      });

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
          'fill-extrusion-color': '#1e3a6b',
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
        paint: {
          // Per-segment, not one flat colour: the gauge already reports the
          // aggregate percentage, so a single-colour line would just repeat
          // it. Colouring each sampled span shows *where* the shade falls,
          // which nothing else on screen conveys.
          'line-color': ['case', ['get', 'shaded'], routeColorFor(1), routeColorFor(0)],
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      // Our layers ease between values instead of snapping. Mapbox's own
      // `basemap.lightPreset` still steps through its four buckets — this
      // build exposes no `lightPresetTransition`, and `setLights` is
      // runtime-only with no typings — but since the ground wash and the
      // shadows carry most of this map's visual weight, easing them across
      // the moment the basemap flips is enough that the change reads as
      // continuous.
      map.setPaintProperty('ground-exposure', 'background-color-transition', {
        duration: 600,
        delay: 0,
      });
      map.setPaintProperty('ground-exposure', 'background-opacity-transition', {
        duration: 600,
        delay: 0,
      });
      map.setPaintProperty(SHADOW_LAYER, 'fill-extrusion-color-transition', {
        duration: 400,
        delay: 0,
      });
      map.setPaintProperty(SHADOW_LAYER, 'fill-extrusion-opacity-transition', {
        duration: 400,
        delay: 0,
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

      new mapboxgl.Marker({ color: '#b8433a' })
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

  // Switch the basemap's own lighting to match the selected time of day.
  // Guarded on the bucket actually changing, not run on every slider tick:
  // the bucket only flips 3-4 times across the full 06:00-18:00 range, so a
  // time-based debounce would be solving a problem that mostly doesn't occur,
  // and setConfigProperty is cheap enough that skipping unchanged calls is
  // enough on its own.
  const lastPresetRef = useRef<LightPreset | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const preset = lightPresetFor(sun);
    if (lastPresetRef.current === preset) return;
    lastPresetRef.current = preset;
    map.setConfigProperty('basemap', 'lightPreset', preset);
  }, [sun, ready]);

  // One computation per tick, shared by the redraw and the readouts.
  // These previously ran shadowsAt(133 buildings, each a convex hull) twice
  // for the same instant — once here and once in the percentage memo.
  //
  // `useDeferredValue` lets React drop intermediate frames while the slider
  // is being dragged; the clock label above still reads from the undeferred
  // `minutes`, so the time stays responsive while the geometry catches up.
  const deferredDate = useDeferredValue(selectedDate);
  const frame = useMemo(() => {
    if (!buildings) return null;
    const shadows: ShadowFeature[] = shadowsAt(buildings, deferredDate);
    const routePts = sampleRoute(...ROUTE_ENDPOINTS);
    const shadedFlags = routePts.map((p) => isPointShaded(p, shadows));
    const shadedCount = shadedFlags.filter(Boolean).length;
    return {
      shadows,
      routePts,
      shadedFlags,
      shadedFraction: routePts.length ? shadedCount / routePts.length : 0,
    };
  }, [buildings, deferredDate]);

  const deferredSun = useMemo(() => sunPositionAt(deferredDate), [deferredDate]);

  // Push geometry and the continuously-interpolated paint in one pass.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !frame) return;

    const shadowSource = map.getSource(SHADOW_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    shadowSource?.setData({ type: 'FeatureCollection', features: frame.shadows });

    // One feature per sampled span, each carrying whether that span is
    // shaded, so the line shows *where* the shade is rather than repeating
    // the aggregate percentage the gauge already gives.
    const segments: GeoJSON.Feature[] = [];
    for (let i = 0; i < frame.routePts.length - 1; i++) {
      segments.push({
        type: 'Feature',
        properties: { shaded: frame.shadedFlags[i] && frame.shadedFlags[i + 1] },
        geometry: {
          type: 'LineString',
          coordinates: [frame.routePts[i], frame.routePts[i + 1]],
        },
      });
    }
    const routeSource = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({ type: 'FeatureCollection', features: segments });

    // The continuous half of the time-of-day blend: these are our own layers,
    // so unlike Mapbox's four-step lightPreset they can track sun altitude
    // exactly. Paired with the `-transition` durations set at layer-add time,
    // they ease rather than snap.
    const ground = groundExposurePaint(deferredSun);
    map.setPaintProperty('ground-exposure', 'background-color', ground.color);
    map.setPaintProperty('ground-exposure', 'background-opacity', ground.opacity);

    const shade = shadowPaint(deferredSun);
    map.setPaintProperty(SHADOW_LAYER, 'fill-extrusion-color', shade.color);
    map.setPaintProperty(SHADOW_LAYER, 'fill-extrusion-opacity', shade.opacity);
  }, [frame, deferredSun, ready]);

  const routeShadeNote = frame ? Math.round(frame.shadedFraction * 100) : null;

  if (!token) {
    return (
      <section className="border-t border-shade-700 py-10 sm:py-12">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Campus shade map
        </h2>
        <p className="mt-3 text-sm text-shade-200">
          Set <code className="rounded bg-shade-800 px-1.5 py-0.5 text-amber-300">MAPBOX_TOKEN</code>{' '}
          in <code className="rounded bg-shade-800 px-1.5 py-0.5 text-amber-300">.env</code> to enable
          the shade map.
        </p>
      </section>
    );
  }

  const ground = groundExposurePaint(deferredSun);
  const shade = shadowPaint(deferredSun);
  const surveyed = buildingsState.phase === 'ready' ? buildingsState.surveyed : null;
  const total = buildingsState.phase === 'ready' ? buildingsState.buildings.length : null;

  return (
    // Viewport-height, full-width. `relative` rather than `position: fixed`:
    // this only needs to be viewport-sized in normal flow, and a fixed child
    // would depend on App's PageTransition having already cleared its inline
    // transform — which it has not when this mounts, so the map would land
    // offset on every navigation here.
    //
    // No `w-screen`/`-translate-x-1/2` full-bleed trick: on this route App
    // drops the `max-w-5xl` column, so plain `w-full` already spans the
    // viewport — and unlike `100vw` it excludes the scrollbar gutter.
    //
    // Height is the viewport minus the compact header, via a CSS variable the
    // header itself sets — hardcoding a pixel figure here would silently
    // desync the moment the header's padding or type size changes, leaving
    // either a scrollbar or a dead strip under the map.
    //
    // `svh` rather than `vh` so iOS Safari's collapsing URL bar can't push
    // the bottom panel out of reach.
    <section className="relative w-full overflow-hidden [height:calc(100svh-var(--site-header-h,0px))]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Each panel is positioned individually. A single `inset-0` wrapper
          would be tidier but would sit over the whole canvas and swallow
          every drag and zoom. */}
      <MapPanel className="absolute left-4 top-4 max-w-xs">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Campus shade map
        </h2>
        <p className="mt-1 text-xs text-shade-200">
          {sun.altitude > 0
            ? `Sun ${(sun.altitude * (180 / Math.PI)).toFixed(0)}° above horizon`
            : 'Sun below horizon'}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-shade-200">
          Shadows are projected from building footprints and the sun's real position — geometry,
          not an interpolation of the station reading across campus.
          {surveyed !== null && total !== null && (
            <> Only {surveyed} of {total} buildings carry a surveyed height; the rest use a default.</>
          )}
        </p>
      </MapPanel>

      {buildingsState.phase === 'loading' && (
        <MapPanel className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <p className="text-sm text-shade-200">Loading campus geometry…</p>
        </MapPanel>
      )}

      {buildingsState.phase === 'error' && (
        <MapPanel className="absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-300">
            Building footprints could not be loaded, so no shadows are shown. The basemap and sun
            position are still accurate.
          </p>
        </MapPanel>
      )}

      {mapError && (
        <MapPanel className="absolute left-1/2 top-20 max-w-sm -translate-x-1/2 border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-300">{mapError}</p>
        </MapPanel>
      )}

      {/* Desktop readouts sit bottom-right so they clear the NavigationControl
          at top-right. On phones the two 92px dials would leave almost no map,
          so they collapse into plain numbers in the slider panel instead. */}
      <MapPanel className="absolute bottom-6 right-4 hidden sm:block">
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <Gauge value={wbgtNow ?? 0} min={0} max={35} unit="°C" color="#b8433a" size={84} />
            <p className="mt-2 text-[11px] text-shade-200">Ground WBGT</p>
          </div>
          <div className="flex flex-col items-center">
            <Gauge value={routeShadeNote ?? 0} min={0} max={100} unit="%" color="#8697b8" size={84} />
            <p className="mt-2 max-w-[7rem] text-center text-[11px] text-shade-200">
              Shade along a 300 m transect
            </p>
          </div>
        </div>

        {/* Swatches read from the same functions that paint the layers, so
            the legend cannot describe a colour the map is not using. The
            ground swatch shows that ramp's colour at full strength rather
            than the layer's own opacity — the wash is deliberately a ~0.05
            tint over the whole basemap, and a 5%-opaque chip is just an
            empty square. Hue is the identifying part; the map shows the
            strength. */}
        <ul className="mt-4 space-y-1.5 border-t border-shade-700/60 pt-3">
          <LegendRow color={ground.color}>Sunlit ground</LegendRow>
          <LegendRow color={shade.color}>Building shadow</LegendRow>
          <LegendRow color={routeColorFor(1)}>Transect in shade</LegendRow>
          <LegendRow color={routeColorFor(0)}>Transect exposed</LegendRow>
          <LegendRow color="#b8433a">Conduit station</LegendRow>
        </ul>
        <p className="mt-3 max-w-[13rem] text-[10px] leading-relaxed text-shade-200">
          The transect is a straight line across campus, not a mapped footpath.
        </p>
      </MapPanel>

      {/* stopPropagation so a drag that starts on the slider and overshoots
          onto the canvas doesn't hand off to Mapbox's pan handler mid-gesture. */}
      <MapPanel
        className="absolute inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2"
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
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
            className="w-full accent-kenya-green-400"
            aria-label="Time of day"
          />
        </div>
        <div className="mt-2 flex gap-4 text-[11px] tabular-nums text-shade-200 sm:hidden">
          <span>
            WBGT <span className="text-bleach">{(wbgtNow ?? 0).toFixed(1)}°C</span>
          </span>
          <span>
            Transect shade <span className="text-bleach">{routeShadeNote ?? 0}%</span>
          </span>
        </div>
      </MapPanel>
    </section>
  );
}
