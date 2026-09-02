"""
Fits the Open-Meteo -> Conduit bias correction and writes data/coefficients.json.

Method
------
Open-Meteo/ERA5 is a global model. At a single point it carries a systematic
local bias: at the JKUAT station it underpredicts temperature by about 1.1 C.
One calibrated ground station can remove that bias, which is the core claim
of this project.

The station sample is small (about 24 aligned hours). A ridge regression on
[forecast, lead_time, hour_sin, hour_cos] would fit the noise, so the default
model is a constant offset, escalating to an hour-of-day offset only when
each hour has enough support. Both are validated leave-one-out, never
in-sample, so the reported improvement is honest.

Run:  python analysis/calibrate.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "weatherdata_september.csv"
OUT_PATH = ROOT / "data" / "coefficients.json"

LAT, LON = -1.0954, 37.0144
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

# Station column -> ERA5 variable. Only variables both sources measure.
VARIABLES = {
    "tempC": ("temp_bmx", "temperature_2m"),
    "humidityPct": ("humidity_sht", "relative_humidity_2m"),
    "windSpeedMs": ("wind_spd", "wind_speed_10m"),
    "pressureHpa": ("press_bmx", "surface_pressure"),
}

# Below this many samples in an hour bucket, an hour-of-day model is noise.
MIN_PER_HOUR = 3


def load_station() -> list:
    with CSV_PATH.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def hourly_station_means(rows: list) -> dict:
    """Collapse 15-minute observations to hourly means, keyed YYYY-MM-DDTHH."""
    buckets = defaultdict(lambda: defaultdict(list))
    for row in rows:
        hour = row["ts"][:13]
        for name, (col, _) in VARIABLES.items():
            try:
                buckets[hour][name].append(float(row[col]))
            except (TypeError, ValueError):
                pass
    return {
        hour: {n: statistics.mean(v) for n, v in vals.items() if v}
        for hour, vals in buckets.items()
    }


def fetch_archive(start: str, end: str) -> dict:
    params = (
        "?latitude=%s&longitude=%s&start_date=%s&end_date=%s"
        "&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure"
        "&wind_speed_unit=ms&timezone=UTC" % (LAT, LON, start, end)
    )
    with urllib.request.urlopen(ARCHIVE + params, timeout=60) as resp:
        return json.load(resp)["hourly"]


def align(station: dict, archive: dict) -> dict:
    """Pair (hour, forecast, observed) per variable."""
    times = [t[:13] for t in archive["time"]]
    pairs = {}

    for name, (_, era_var) in VARIABLES.items():
        series = archive.get(era_var) or []
        by_hour = {t: v for t, v in zip(times, series) if v is not None}
        got = []
        for hour, obs in sorted(station.items()):
            if hour in by_hour and name in obs:
                got.append((hour, float(by_hour[hour]), float(obs[name])))
        pairs[name] = got
    return pairs


def mae(errs: list) -> float:
    return statistics.mean(abs(e) for e in errs)


def rmse(errs: list) -> float:
    return math.sqrt(statistics.mean(e * e for e in errs))


def fit_constant(sample: list) -> float:
    """Mean signed error (forecast - observed)."""
    return statistics.mean(f - o for _, f, o in sample)


def fit_hourly(sample: list):
    """Per-hour-of-day offsets, or None if any hour lacks support."""
    buckets = defaultdict(list)
    for hour, f, o in sample:
        buckets[int(hour[11:13])].append(f - o)
    if not buckets or min(len(v) for v in buckets.values()) < MIN_PER_HOUR:
        return None
    return {h: statistics.mean(v) for h, v in buckets.items()}


def evaluate(pairs: list, model: str) -> dict:
    """
    Leave-one-out evaluation.

    Each point is corrected by a model fitted on every OTHER point, so the
    reported improvement cannot come from the point predicting itself.
    """
    raw_errs, corr_errs = [], []

    for i, (hour, f, o) in enumerate(pairs):
        rest = pairs[:i] + pairs[i + 1:]
        if not rest:
            continue

        if model == "hour_of_day":
            offsets = fit_hourly(rest)
            # An unseen hour falls back to the global offset.
            bias = (offsets or {}).get(int(hour[11:13]), fit_constant(rest))
        else:
            bias = fit_constant(rest)

        raw_errs.append(f - o)
        corr_errs.append((f - bias) - o)

    return {
        "n": len(raw_errs),
        "mae_before": round(mae(raw_errs), 3),
        "mae_after": round(mae(corr_errs), 3),
        "rmse_before": round(rmse(raw_errs), 3),
        "rmse_after": round(rmse(corr_errs), 3),
    }


def main() -> None:
    rows = load_station()
    station = hourly_station_means(rows)
    if not station:
        raise SystemExit("No station rows parsed; check data/weatherdata_september.csv")

    days = sorted({h[:10] for h in station})
    print("Station hours: %d across %s..%s" % (len(station), days[0], days[-1]))

    # ERA5 lags real time; ask only for days that are likely settled.
    end = min(days[-1], (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d"))
    archive = fetch_archive(days[0], max(days[0], end))
    pairs = align(station, archive)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Open-Meteo ERA5 archive vs JKUAT Conduit station",
        "site": {"latitude": LAT, "longitude": LON, "elevation_m": 1527},
        "validation": "leave-one-out",
        "variables": {},
    }

    for name, sample in pairs.items():
        if len(sample) < 4:
            print("  %s: only %d aligned points - skipped" % (name, len(sample)))
            continue

        # Prefer the richer model only if it genuinely validates better.
        const_metrics = evaluate(sample, "constant")
        model = "constant"
        metrics = const_metrics

        if fit_hourly(sample) is not None:
            hourly_metrics = evaluate(sample, "hour_of_day")
            if hourly_metrics["mae_after"] < const_metrics["mae_after"]:
                model, metrics = "hour_of_day", hourly_metrics

        offsets = fit_hourly(sample) if model == "hour_of_day" else None
        entry = {
            "model": model,
            "bias": round(fit_constant(sample), 4),
            "metrics": metrics,
            "n_train": len(sample),
        }
        if offsets:
            entry["hourly_bias"] = {str(h): round(v, 4) for h, v in sorted(offsets.items())}
        out["variables"][name] = entry

        improve = metrics["mae_before"] - metrics["mae_after"]
        print(
            "  %s: model=%s bias=%+.2f MAE %.2f -> %.2f (%+.2f) n=%d"
            % (
                name,
                model,
                entry["bias"],
                metrics["mae_before"],
                metrics["mae_after"],
                improve,
                metrics["n"],
            )
        )

    # Honest description of the training set, rendered in the UI.
    out["training_window"] = {
        "from": days[0],
        "to": days[-1],
        "station_hours": len(station),
        "note": (
            "Fitted on a small sample. Offsets are validated leave-one-out, but a "
            "longer record via the live Conduit API would make them more reliable."
        ),
    }

    OUT_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print("Wrote %s" % OUT_PATH.relative_to(ROOT))


if __name__ == "__main__":
    main()
