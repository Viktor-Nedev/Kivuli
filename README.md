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
npm test        # 104 tests across ingest, indices, decisions, calibration, climate,
                # the HTTP layer, the live station adapter and shadow geometry
npm run typecheck
npm run build
```

### Run it as one process

`npm run dev` runs two processes behind Vite's proxy, which is convenient locally and useless
anywhere else. For a real deployment the server also serves the built client, so the whole app is
one process on one port:

```bash
npm run build
npm start          # http://localhost:8787 — API and UI together
```

Or in a container:

```bash
docker build -t kivuli .
docker run -p 8787:8787 -e MAPBOX_TOKEN=pk.your-token kivuli
```

The image is single-stage on purpose. A multi-stage build has to carry `data/` — the bundled
station CSV *and* the committed rainfall snapshots — into the runtime layer by hand, and getting
that wrong produces a container that boots cleanly and then fails on first request. `tsx` is a
runtime dependency rather than a dev one for the same reason: `npm ci --omit=dev` would otherwise
drop the thing that runs the server.

With no `CONDUIT_API_KEY`/`CONDUIT_EMAIL` set, a deployment runs the bundled sample and says so at
startup. Adding the credentials switches it to the live station with no code change and no rebuild.

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


**How this season compares.** The station's record is one day long, so the Season page reads
eleven years of ERA5 daily rainfall for this exact point instead. Three windows are ranked against
*the same calendar window* in every previous year, which is what stops the ordinary dry season
reading as a drought: right now the 90-day total sits in the 9th percentile while the 180-day
total sits at the 55th. The recent months genuinely are dry, but the long rains arrived normally —
a single-window drought indicator would announce an emergency that its own longer window
disproves, so the page states that conclusion in words rather than leaving it to be inferred.

The same history gives two more things a household can act on: when the rains have historically
started (an 84-day spread for the long rains, shown per year, and explicitly not a forecast), and
what a roof could collect. Only three months of the year — April, May and November — gain more
water than evaporation takes away at this site, so rain here is less scarce than badly timed, and
storage is the lever. A 60 m² roof yields about 42,000 litres in a typical year. The summary is
also offered as copyable English and Kiswahili text, since most people this matters to will
receive it forwarded rather than by opening a dashboard.

---




**The next three days.** The same gates, run forward over a bias-corrected
forecast. Two things make this honest rather than decorative.

The first is a daylight gate. Over a live 72-hour window here, 29 hours pass
the spray Delta-T and wind bands — and only 9 of them are in daylight. Night
air is cool and humid, so it sails through limits written for working hours;
without the gate the app recommends spraying at 02:00. Excluded hours are drawn
and counted rather than hidden, because "9 usable hours" and "29 hours" are
very different claims about opportunity.

The second is that **forward rainfall is measured against this site's own
record, and reported as frequency rather than rarity.** An early draft was
going to call a 30 mm forecast day "a 1-in-11-year day"; the committed record
shows 30 mm arriving about 2.6 times a year, and a true 1-in-11-year day here
is nearer 85 mm. The error came from reading a percentile of *rain days* as a
percentile of *all days*. So the panel says "this site records 20 mm about
every 2 months and 40 mm about every 10 months" and never names a rarity — a
test greps the generated text for `1-in-N-year` and fails if it appears.

That panel is deliberately a standing statement rather than an alert that only
appears when triggered. At this site the honest answer is usually "nothing is
coming", and a warning nobody ever sees fire is indistinguishable from a broken
one. The null state is the designed state: a real number, the thresholds, and
how often they are genuinely crossed. The same markup turns amber and red on
real data, with no separate path to rot.

Forward heat is reported the same way: peak projected WBGT against the 28 °C
ISO 7243 first-action threshold, stating plainly that no restriction applies
rather than building an alert path that cannot fire at this altitude.

## Weight

The app argues for an audience on rural bandwidth, so it should not arrive as a 12 MB dashboard.
Two changes, both measured:

| | Before | After |
|---|---|---|
| Entry JS | 2,197 KB | **343 KB** |
| Hero video on first paint | 9.1 MB (`preload="auto"`) | **0** (`preload="none"`) |

`mapbox-gl` was statically imported, so every visitor downloaded the whole map library to read the
Overview page; it is now a lazy route chunk that loads only when the shade map is opened. The hero
clip loads when the section approaches the viewport rather than on arrival — someone who never
scrolls past the fold pays nothing for it, and the 136 KB poster carries the frame until then.

## The API

Four read-only JSON endpoints. No key, no auth, no rate limit — this is a hackathon prototype, and
anything public would need all three before it saw real traffic.

| Endpoint | Returns |
|---|---|
| `GET /api/today?at=HH:MM` | Latest reading, the day's decisions, the full timeline, calibration coefficients. `at` pins the evaluation moment in East Africa Time. |
| `GET /api/climate?lat=&lon=&place=` | Eleven years of rainfall standing, season onset, water balance and the bilingual advisory. Defaults to the station; any in-Kenya coordinate is accepted. |
| `GET /api/outlook?lat=&lon=` | The next three days as decisions: daylight-gated spray and drying windows, projected heat, and forecast rainfall ranked against this site's own record. |
| `GET /api/forecast` | Two days of hourly forecast, bias-corrected, with a provenance tag on every value. |
| `GET /api/health` | Liveness plus the name of the active station source. |

```bash
curl "localhost:8787/api/climate?lat=-0.4536&lon=39.6461&place=Garissa" | jq '.windows'
```

`/api/forecast` is the one endpoint the app's own UI does not call — the Working day page covers
the same ground from measured readings, which are better. It is documented rather than deleted
because it is the only surface that exposes the bias-corrected forecast with per-value provenance,
which is the thing most worth integrating against.

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

On the **Season** page, which reads eleven years of ERA5 rainfall rather than the station:

- **Eleven years is not a climate normal.** The WMO standard is thirty. With n=11 the extreme
  percentiles are coarse, and the smallest event this record can honestly name is roughly a
  one-in-eleven year. The sample size is printed on every card rather than left implicit.
- **ERA5 is a reanalysis, not a rain gauge.** It is a model reconstruction on a ~9 km grid, so it
  will not capture a convective storm that hit one field and missed the next. The station's own
  tipping bucket is the only *measured* rainfall here, and it covers one day.
- **This is monitoring, not forecasting.** Every figure describes rain that has already fallen.
  Nothing on the page predicts the season ahead.
- **Season onset is a historical distribution, not this year's prediction.** The long rains have
  started anywhere across an 84-day spread in the record. That spread is the point, and it is
  shown per year: a farmer planting on the median date would be wrong in most individual years.
- **Harvest yield assumes a 0.8 runoff coefficient** — the usual figure for corrugated iron, an
  engineering convention rather than something measured here. It is an upper bound on what a roof
  *catches*, and ignores first-flush diversion, gutter losses and overflow once a tank is full.
- **No machine learning, deliberately.** With one day of station data and a stationary rainfall
  series, a learned model would add confidence without adding information. Empirical percentiles
  over eleven real years are the correct estimator, and saying so is more honest than a model that
  cannot beat climatology.
- **The Season page travels; the station pages do not.** Rainfall history is reanalysis, which
  exists for anywhere in Kenya, so that page takes a location. Spray, drying and heat come from one
  physical sensor at JKUAT and the bias calibration was fitted against it, so they stay put. The
  page says which of the two you are looking at rather than letting the distinction blur.
- **Committed rainfall snapshots are frozen at build time.** Five locations ship cached so the demo
  survives a dead venue network. Until a deployment can refetch, it reports history through the
  date it was built — which is printed on the page rather than implied to be today.
- **Coordinates outside Kenya are refused, not answered.** ERA5 is global and would happily return
  a climatology for anywhere, but the seasons, the onset rule and the Swahili advisory are specific
  to East Africa. Answering would mean dressing a meaningless number in the same provenance tag as
  a meaningful one.
- **The forward Delta-T is approximated, today's is measured.** The station
  measures wet bulb directly; a forecast has none, so the outlook derives it
  with the Stull (2011) formula. That is accurate to roughly ±0.3 °C but is
  fitted at sea-level pressure, and this site sits at 1527 m. The two numbers
  look identical on screen and are not, so the forward one is tagged
  `bias-corrected` or `raw forecast` and never `measured`.
- **The forward drying gate is a different instrument from today's.** The
  station path uses 300 SI1145 visible counts, a sensor-specific cutoff; the
  forward path uses 200 W/m², a physical irradiance the forecast supplies. They
  answer the same question and are not interchangeable.
- **Bias correction is clamped at physical limits.** The fitted wind offset is
  +1.73 m/s and this site forecasts sub-1 m/s mornings, so the raw arithmetic
  produced negative wind speeds. Corrected values are floored at zero, and
  humidity is bounded to 0–100%.
- **No flood risk, deliberately.** The brief asks for it, and it is the one
  thing here that would have to be invented: there is no terrain model, no
  drainage network, no soil moisture and no river gauge. Inferring flood risk
  from 9 km reanalysis precipitation alone would be guessing with a
  serious-sounding label.
- **UI Swahili is deliberately not attempted.** The field-facing advisory is bilingual and
  human-checked, which is the part that gets forwarded. Machine-translating two hundred interface
  strings and presenting them as field-ready would contradict everything above.

Every number in the interface carries a provenance tag — `measured`, `bias-corrected`,
`raw forecast`, or `reanalysis` — so it is always clear what came from the station and what came
from a model. `reanalysis` is styled distinctly from `measured` precisely because ERA5 is neither
this station's instrument nor a forecast of the future.

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
