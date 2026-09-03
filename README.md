# KIVULI

Field decisions from the JKUAT Conduit climate station, Juja, Kenya.

*Kivuli* is Swahili for shade.

Weather dashboards show numbers. KIVULI issues instructions: **"Spray now until 10:38"**,
**"Spread grain now — cover by 17:47"**, **"Do not spray now — wind 0.6 m/s, inversion risk"**.

---

## The idea

A global weather model is systematically wrong at any single point. At this station it
underpredicts temperature by **1.12 °C**. One calibrated ground station fixes that bias, and a
corrected forecast only becomes useful once it turns into a spray window, a drying window, or a
work/rest cycle.

Correcting against the Conduit station cuts temperature error nearly in half:

| Variable | Bias | MAE before | MAE after | RMSE before | RMSE after |
|---|---|---|---|---|---|
| Temperature (°C) | −1.12 | 1.12 | **0.56** | 1.31 | 0.70 |
| Relative humidity (%) | +3.55 | 5.69 | **5.14** | 6.62 | 5.83 |
| Wind speed (m/s) | +1.73 | 1.73 | **0.92** | 2.06 | 1.18 |
| Pressure (hPa) | +2.67 | 2.67 | **1.24** | 3.01 | 1.43 |

Every figure is **leave-one-out validated**: each point is corrected by a model fitted on all the
*other* points, so nothing scores itself. Regenerate with `python analysis/calibrate.py`.

---

## Run it

Needs Node 22+ and Python 3 (Python only to refit the calibration).

```bash
npm install
npm run dev
```

Open <http://localhost:5180>. No API key required — the app ships with a Conduit CSV export and
runs on it by default.

To use the live station feed, copy `.env.example` to `.env` and fill in both fields:

```
CONDUIT_API_KEY=your-key
CONDUIT_EMAIL=your-registered-email
```

Restart. The adapter switches to the live API with no code change; the console line at startup
says which source is active.

To enable the campus shade map, add a Mapbox public token (starts `pk.`) to `.env`:

```
MAPBOX_TOKEN=pk.your-token
```

The server reads it from the same `.env` and hands it to the client over `/api/config` — Mapbox
public tokens are meant to be exposed in frontend code, so this avoids a second env mechanism just
for Vite's `VITE_` prefix convention. Without a token, the shade map section shows a short note
instead of failing.

```bash
npm test        # 35 tests across ingest, indices, decisions, calibration, shadow geometry
npm run typecheck
npm run build
```

---

## What it decides

**Spray window** — Delta-T is dry-bulb minus wet-bulb temperature. The station *measures* wet
bulb, so this is exact rather than estimated from humidity. A window opens when Delta-T is
2–8 °C, wind is 0.8–4.2 m/s, and no rain is forecast within 6 hours.

Wind below 0.8 m/s is a **failure**, not ideal conditions: still air signals a temperature
inversion that lets fine droplets hang and drift off-target. Operators routinely misread calm
weather as perfect for spraying, so the app always says *why* a window is closed. On the sample
day only 18 of 95 readings pass both gates, and 74 fail on inversion risk alone.

**Grain drying** — a window needs air under 60% humidity *and* real sunlight. Both matter: on the
sample day humidity stays low until 18:36, but the light sensor bottoms out at 15:02, so grain
left out past mid-afternoon would re-wet rather than dry. The app reports the shorter, correct
window.

**Heat exposure** — WBGT is measured directly and mapped to ISO 7243 work/rest bands. This site
sits at 1527 m and peaks at 21.5 °C WBGT, below the 28 °C first action threshold, so the honest
answer is "no heat restriction" rather than a manufactured alert. Reported plainly for that reason.

**Campus shade map** — projects building shadows across JKUAT for a chosen time of day, from real
footprint geometry and the sun's actual position (SunCalc), not from interpolating the station's
single reading across the campus. A time slider scrubs the day; a sample walking route is scored
by how much of it sits in shade at that moment. Mapbox's own vector tiles already carry a height
for every building in this area (confirmed via its tilequery API), so the 3D buildings need no
manual data — but shadow *casting* needs real coordinates that vector tiles don't expose to
JavaScript, so `analysis/build_campus_geojson.py` bakes 133 real OSM footprints, with height from
the OSM tag where present and a synthetic default otherwise, into a static file the client reads
directly. Only 18 of those 133 carry a surveyed height; the rest use the same default Mapbox
itself applies.

---

## Data and its limits

**Station (Conduit, JKUAT)** — temperature, humidity, wet bulb, WBGT, pressure, wind, rainfall,
and SI1145 light counts. Timestamps are UTC; the interface renders East Africa Time (UTC+3). Peak
irradiance in the sample lands at 09:40 UTC against a computed solar noon of 09:32 UTC for this
longitude, which confirms the timestamps are genuinely UTC.

**Forecast and reanalysis (Open-Meteo)** — supplies the rain lookahead and the ERA5 series the
calibration is fitted against. No API key needed. Responses are cached to `data/cache/`, and a
stale cache is served if the network drops, so a demo survives a bad connection.

Known limits, stated rather than hidden:

- The station **does not** measure soil moisture, vegetation indices, water level or water
  quality. Nothing in this app is derived from them.
- `si1145_uv` reads 0 for every row in the sample, so no UV feature is offered.
- No rain fell during the sample day, so the rain gate is exercised from forecast data only.
- The bundled sample is ~24 usable hours. The calibration is a validated constant offset, not a
  regression — a longer record via the live API would support a richer model, and the code
  escalates automatically when enough aligned points exist.
- The drying light threshold (300 SI1145 visible counts) is a sensor-specific daylight cutoff
  calibrated against this sample, not a physical irradiance value.

Every number in the interface carries a provenance tag — `measured`, `bias-corrected`, or
`raw forecast` — so it is always clear what came from the station and what came from a model.

---

## Layout

```
server/
  ingest/       Conduit adapters (CSV + live API) and shared parsing
  forecast/     Open-Meteo client with disk cache
  calibration/  applies coefficients fitted offline
  indices/      spray (Delta-T), drying, WBGT, THI
  decisions/    thresholds turned into instructions, English + Swahili
  api/          Express routes (+ /api/config for the Mapbox token)
analysis/       calibrate.py (bias model) and build_campus_geojson.py (building footprints)
web/            React + Vite + Tailwind + Mapbox GL
data/           station CSV, coefficients, forecast cache
```

The model is fitted offline in Python and exported as JSON; the server applies it with plain
arithmetic. One runtime in production, with the notebook-style script kept as evidence of method.

### Demo note

`?at=HH:MM` pins the evaluation moment (East Africa Time). The bundled sample is a fixed
historical day whose last row falls at 02:55 local, so the interface defaults to `?at=13:00` to
open on a working-hours decision instead of a dead night-time reading. A live feed needs no pin.

### Shade map rendering note

Mapbox GL always composites `fill-extrusion` layers in front of plain 2D `fill` layers,
regardless of style order. A flat fill shadow layer disappears behind the extruded buildings at
this map's pitch even when it is listed above them in the style. Shadows are drawn as a very
short (1.2 m) `fill-extrusion` instead, which keeps them in the same 3D pass as the buildings they
sit beside.
