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

### Then we checked whether the improvement was real

The station carries **three independent thermometers**. They disagree with each other by
**0.435 °C** on average — against a corrected model error of 0.565 °C. The correction has reached
the noise floor of the instrument it is corrected against, and there is little room left below it.

That is the sort of thing a dashboard has no reason to look for. It is on `/validation`, next to
the figure it limits, because a station that scores a model should be willing to be scored itself.

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
npm test        # 147 tests across ingest, indices, decisions, calibration, climate,
                # the HTTP layer, the live station adapter and shadow geometry
npm run test:web   # component tests (vitest + jsdom)
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


**Water owed.** The Season page now carries a seven-day crop water balance:
reference evapotranspiration out, forecast rain in, and the running difference.
Pure FAO-56 arithmetic over a standardised quantity — there is no model here to
be wrong about, which is the only reason a number this consequential can be
offered at all.

It is deliberately **not** a soil moisture reading. The station has no probe,
and the code carries a standing rule that no soil field may exist without a
sensor behind it. Open-Meteo does publish a modelled soil-moisture field for
this point and it is not shown: a land-surface model on a ~11 km grid with an
assumed soil column, rendered as m³/m³ beside a provenance tag, would look
exactly like an instrument reading.

The interesting part is what the balance *cannot* say. The accrued deficit is
soil-independent, so it leads. Converting it into a date is not: readily
available water runs from **16 mm on sand to 50 mm on clay** at this rooting
depth, a 3.1× spread wider than a whole week's deficit here. So every texture's
crossing day is shown at once, and choosing a soil highlights one row without
hiding the others. A single default date would have put the largest uncertainty
in the calculation behind its most confident-looking sentence.

**Sun exposure.** The station's UV channel reads 0 on every row of the sample —
a dead sensor, and the reason no UV was reported before. The hazard is not
dead: at 1527 m almost on the equator the modelled index peaks near 9, "very
high" on the WHO scale, essentially year-round. That figure now appears on the
Working day page beside the projected WBGT, tagged `raw forecast` and never
mixed with anything measured. It is the heat-adjacent risk that actually fires
here, which is what keeps the honest "no work/rest restriction" from reading as
an empty feature.


**How wrong is the model.** The Conduit's stated purpose is that its
measurements *"contribute to the calibration and validation of satellite
observations and digital models"*. `/api/validation` is that sentence made
executable: the station's own hourly means scoring the gridded reanalysis
every forecast on this site is built from.

It is the only screen where a `measured` tag is the reference rather than the
caveat — the station is the yardstick and the model is the thing being marked.

The finding is worth more than the summary statistic. A flat "MAE 1.12 °C"
hides the shape; the diurnal curve shows the model is nearly exact at midday
(0.55 °C) and **2.62 °C low at 08:00**, the morning warming transition a ~9 km
grid cell cannot resolve. That is the hour spraying decisions get made. Wind is
worse: the model overestimates by 4.85 m/s at its worst hour at this sheltered
site, and wind gates every spray window.

These numbers reproduce `data/coefficients.json` exactly — the Python fit runs
offline, this runs live, and a test asserts they agree. Two independent paths
to the same answer is evidence; one path is an assertion.

One station, one day, 24 paired hours. That is a demonstration of method, not a
climatology, and the page says so.

**And then the station is scored against itself.** The same page carries the
three-thermometer comparison: 0.435 °C of disagreement between instruments
against 0.565 °C of corrected model error, and the honest consequence that the
correction has run out of room. The robustness figures are given as a pair —
94 of 95 spray verdicts survive the disagreement, but only 84 of 95 survive it
on the temperature gate alone — because the first number alone would flatter
the result. The whole section is built by `server/validation/agreement.ts`,
which calls the real `assessSpray` rather than a copy of its thresholds, so the
figure measures the decision the app actually makes.


**Ask KIVULI.** A question box on the landing page — and deliberately not a
language model. Every answer is a figure one of the pages already computes,
quoted with the endpoint it came from, so any reply can be traced to a number
that carries its own provenance tag. An unrecognised question returns the list
of what can be answered rather than a plausible guess: *"I don't know, here is
what I do know"* is the only honest failure mode for a project that spends the
rest of its surface distinguishing evidence from inference.

It matches Swahili too. Swahili agglutinates, so "mwagilia" (irrigate) appears
as "nikamwagilia" or "tumwagilie" — those stems match inside a longer word
while English keywords match whole words only, because "sunflower" is not a
question about the sun.

**The river.** Open-Meteo's flood model covers Kenya, and Nyando near Kisumu
returns a real 39 m³/s peak. It returns **0.00 m³/s at JKUAT**, because the
campus is not on a modelled river reach — that zero is an absence of data, not
a reading of a very low river. So the panel says "not on a modelled river" and
draws no chart at all, rather than showing a gauge pinned at nothing. Where a
reach does exist it charts the week and says whether the river is rising.

Nothing here is a flood forecast for a particular field: discharge is a
catchment-scale quantity on a coarse grid, with no local terrain, drainage or
defence data behind it, and the panel says so.

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

## Works without a network, and says so

The server has cached its upstreams since the third phase. The client had no
equivalent: close the browser without a connection and there was nothing to
open. For an app whose audience is on intermittent rural signal, that was the
wrong half to have solved.

KIVULI is now installable, and opens offline showing the last station reading
it received.

**Exactly one API response is stored — `/api/today`, the station's own
measurements.** An old measurement is still a measurement: it can be shown with
its age attached and remain honest. Everything else is refused on purpose. The
Season, model-check and water endpoints are model output over long windows, and
a stale forecast presented without a way to see how stale is the confident
wrong answer this project exists to avoid. Offline those fetches fail and each
page says so in words. The 8.7 MB hero video is excluded by name — caching it
would consume the budget the one stored reading depends on.

When the reading comes from storage, a banner sits above every page:

> **Offline** — showing the last reading KIVULI received. Measured at 13:55 on
> 1 September, about 6 hours ago. The spray and drying verdicts below were
> computed from that reading and have not been rechecked since. Conditions
> change within the hour — treat these as a record of what was true, not as
> advice for now.

Staleness is deliberately **not** a fifth provenance kind. A cached reading is
still `measured` — the instrument did not become a model while the phone was
out of signal. Only its currency changed, and the two claims are shown
separately.

The caching rules live in `web/src/lib/cachePolicy.ts` as a pure, tested
function rather than inside the worker, because the rules deciding whether a
farmer is shown an old number deserve to be verified rather than trusted.

If a bad build is ever cached: open with `?nosw`, or run `kivuliReset()` in the
console.

## Take the data with you

Three datasets download as CSV or JSON — the working day (station readings with
the gates run on each), the model check (paired station-against-model hours),
and the instrument agreement (all three thermometers).

**Provenance travels with the file.** A CSV reading `tempC,26.4` with no
indication of whether an instrument or a ~9 km model produced it has stripped
off every guarantee this interface makes, at exactly the moment the number
stops being watched. So every column header carries its tag, every file opens
with a comment block naming the source and the legend, and the JSON keeps the
rows byte-identical to the API with provenance in an envelope beside them.

Exports carry one tag the API does not: `derived`. Delta-T, THI and the
pass/fail gates are arithmetic on measured inputs — no instrument reads a
Delta-T and no model produced one — so calling them `measured` or
`raw_forecast` would both be false.

Exporting works offline too: everything is already in memory.

## The model we did not train

This hackathon came with credits to train a custom frontier model. They went unused, and the
reasoning is worth more to a reader than the model would have been.

**The data does not support it.** The station sample is 95 readings from a single day, which align
to **24 hours** against the reanalysis — that is the entire empirical base, and it is what
`data/coefficients.json` was fitted on. `analysis/calibrate.py` already refuses a ridge regression
on four features at that size, because it would fit the noise; the default is a constant offset,
escalating to an hour-of-day offset only where each hour has enough support. A trained model on
those same 24 pairs is the idea this project already rejected, several orders of magnitude larger.
Doing it anyway would contradict a decision documented in our own source.

**And the ceiling is not a modelling ceiling.** The Conduit mast carries three thermometers that
disagree with each other by 0.435 °C, against a corrected model error of 0.565 °C. The correction
has already arrived at the noise floor of the instrument it is corrected against. No model, at any
size or compute budget, can resolve a forecast finer than the reference can certify. What would
improve these numbers is more instrument-days, not more parameters.

**The obvious place for a language model is Ask KIVULI, and that is exactly where it must not
go.** The Ask box maps a question to a figure this app already computed and already tagged with
its provenance, and names the endpoint that answered. An unmatched question returns the list of
what it can answer rather than a guess. A generated answer would paraphrase figures it cannot
verify, which is the one thing this project is built never to do — so the router stays a router.

**One place a language model would genuinely help, deferred rather than refused.** The advisories
are bilingual: 44 Kiswahili strings, written by hand and human-checked, because those are the
sentences that get forwarded. Translation is a language task and not a numeric claim, so it does
not conflict with anything above — but shipping machine-translated field advice without a
Kiswahili speaker to review it would. That reviewer does not exist on this team yet. When one
does, this is the first thing to revisit.

None of this is a criticism of the tool. It is a statement about the size of our evidence. Give
this project a year of station data and a Kiswahili reviewer, and both answers change.

## The API

Four read-only JSON endpoints. No key, no auth, no rate limit — this is a hackathon prototype, and
anything public would need all three before it saw real traffic.

| Endpoint | Returns |
|---|---|
| `GET /api/today?at=HH:MM` | Latest reading, the day's decisions, the full timeline, calibration coefficients. `at` pins the evaluation moment in East Africa Time. |
| `GET /api/climate?lat=&lon=&place=` | Eleven years of rainfall standing, season onset, water balance and the bilingual advisory. Defaults to the station; any in-Kenya coordinate is accepted. |
| `GET /api/outlook?lat=&lon=` | The next three days as decisions: daylight-gated spray and drying windows, projected heat, and forecast rainfall ranked against this site's own record. |
| `GET /api/water?lat=&lon=&crop=` | Seven-day crop water balance (FAO-56) with the crossing day for every soil texture, plus peak UV. |
| `GET /api/validation` | The station scoring the model: hourly station means against ERA5 for the same hours, per variable, with the diurnal error shape. Also carries `agreement` — the station scored against *itself*, across its three thermometers. Takes no lat/lon — there is one station. |
| `GET /api/ask?q=` | Routes a question to a figure the app already computes, naming the endpoint that answered. Unmatched questions return the capability list, never a guess. |
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
- **The water balance is not a soil moisture measurement.** It accounts for water *arriving*
  (rain) and *leaving* (crop evapotranspiration) and reports the running difference. It never
  claims to know how much water is in the ground. Open-Meteo's modelled soil-moisture field for
  this point is deliberately unused, because showing a gridded model output beside a provenance
  tag would make a guess look like a probe reading.
- **The irrigation timing is a range, not a date, and the range is wide.** Readily available water
  spans 16 mm (sand) to 50 mm (clay) at a 0.6 m rooting depth — a 3.1× spread. The deficit itself
  is soil-independent and is what the page leads with; every soil's crossing day is shown rather
  than one default being chosen for the reader.
- **The crop coefficient is a single mid-stage figure.** It ignores the split between soil
  evaporation and transpiration, and any stress feedback. Soil capacities are FAO-56 table values
  for a texture class, not measurements of anyone's field.
- **The far end of a seven-day forecast is soft.** The first two days carry most of the confidence.
- **`surface_pressure` is fetched and deliberately unused.** It could in principle sharpen the
  forward wet-bulb approximation, but Stull is an empirical sea-level fit with no principled
  pressure term — bolting a correction onto a regression would produce a number we could not
  defend.
- `si1145_uv` reads 0 for every row in the sample, so **no UV is reported from the station**. The
  UV figures on the Working day page come from the forecast and are tagged `raw forecast`. The
  sensor is dead; the hazard is not, and reporting a modelled 9 is more useful than reporting a
  broken 0. The two are never mixed.
- **The correction is as good as the instrument allows.** The mast carries three independent
  dry-bulb thermometers — a BMX280, an MCP9808 and an SHT31 — and across the bundled day they
  disagree with each other by **0.435 °C on average**, 0.40 °C median, up to 1.60 °C at 15:29
  local. The calibration above reduces the model's temperature error to **0.565 °C**. Those two
  numbers are close enough that the correction has essentially reached the noise floor of the
  instrument it is corrected against; tuning it further would fit the station's own scatter rather
  than the model's bias. Three sensor packages agreeing to within half a degree is ordinary, not a
  fault — the point is that it was measured rather than assumed. A station cannot certify a model
  to a precision finer than it can certify itself. See `/validation`.
- **The app reads one of those three thermometers, and it is the coolest.** `tempC` comes from
  `temp_bmx`, which runs **0.237 °C below the median** of the three. So the headline "the model
  runs 1.12 °C cold" carries that choice inside it; against a median-of-three reference the bias
  would be about −1.36 °C. It was not switched mid-project: `analysis/calibrate.py` fitted the
  coefficients against this channel, and Delta-T pairs it against a separate wet-bulb instrument,
  so changing the reference would invalidate both without changing the numbers printed beside
  them. Publishing the offset is the honest option; quietly improving the headline is not.
- **The disagreement mostly does not reach the advice, and "mostly" is doing work.** The full
  spray verdict is unchanged on **94 of 95** readings whichever thermometer you believe. But on
  the Delta-T gate alone, **11 of 95 disagree** — the gap is the wind gate having already closed
  the question on those readings. A further 21 sit close enough to a threshold that the
  instruments' own spread could move them across it. Both figures are on the page, because quoting
  only the first would be the better-looking claim and the less true one.
- **Spread runs slightly wider in daylight (0.479 °C) than at night (0.398 °C), and the cause is
  not established.** The obvious explanation is solar heating of the sensor housings under poor
  ventilation. That hypothesis was tested against this sample and failed: in daylight, calm hours
  (under 1 m/s) show 0.469 °C and windier hours 0.450 °C — the wrong direction, and the gap is far
  below the scatter. The observation is reported; the mechanism is left open rather than given a
  story it has not earned.
- **Tooltips used to be unreachable on a phone.** Chart values and the explanation behind every
  provenance tag lived in the native `title` attribute, which needs a hover a touch device cannot
  produce. On the project's stated primary device that content did not exist at all. It now uses a
  CSS-only popover that opens on tap, hover and keyboard focus; the dense charts use a read-out
  line under the axis instead, which never covers the bars being compared. This was an
  accessibility defect, not a missing flourish, and it is recorded here as one.
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
- **River discharge is shown only where a river exists.** Open-Meteo's flood model returns
  0.00 m³/s at JKUAT because the campus is not on a modelled reach. Rendering a permanent zero
  would look like a reading; the page says there is no reach instead.
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
- **Offline, only the station reading is available — everything else fails.** The Season,
  model-check and water pages read live services and are not cached, so offline they show their
  degraded copy rather than old numbers. That is a provenance decision, not an oversight: a stale
  forecast shown without a way to see how stale it is would be exactly the confident wrong answer
  the rest of this file argues against, and building a staleness marker for six more endpoints was
  not a job for the week before a deadline. The cached reading is marked with its age on every
  page. See [Works without a network](#works-without-a-network-and-says-so).
- **A cached reading is old, not wrong.** The spray and drying verdicts beside it were computed
  when it arrived and are not recomputed offline. The banner says so; the numbers themselves carry
  the same `measured` tag they always did, because the instrument did not become a model while the
  phone was out of signal.
- **No model was trained, though the credits to train one were available.** 24 aligned
  station-hours cannot support it, and the instrument's own 0.435 °C disagreement already bounds
  what a better model could buy. See [The model we did not train](#the-model-we-did-not-train) for
  the full reasoning, including the one case that is deferred rather than refused.

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
