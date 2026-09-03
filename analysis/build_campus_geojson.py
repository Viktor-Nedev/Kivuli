"""
Builds web/src/map/jkuat_buildings.geojson from OSM building footprints.

Context
-------
Mapbox's own vector tiles (mapbox-streets-v8) carry a synthetic `height` for
every JKUAT building, which is enough to drive fill-extrusion styling. But
Mapbox GL does not expose that vector-tile geometry to JavaScript for custom
computation, and shadow casting needs actual footprint coordinates to project.
So this script pulls real footprints (and real height tags, where OSM has
them) from Overpass, once, and bakes them into a static file the client reads
directly.

Height source, in priority order:
  1. OSM `height` tag (metres) — exact when present.
  2. OSM `building:levels` * 3m per level — a standard planning estimate.
  3. A 6.2m one-storey default, matching the value Mapbox's own synthetic
     height assigns to unlabelled buildings in this area (confirmed via the
     tilequery API against the station coordinate).

Run:  python analysis/build_campus_geojson.py
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "web" / "src" / "map" / "jkuat_buildings.geojson"

# Campus core, not the full Overpass bbox: keeps the shipped file small and
# avoids extruding buildings far outside where the shade map is ever shown.
BBOX = (-1.0975, 37.0110, -1.0930, 37.0180)  # south, west, north, east

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_HEIGHT_M = 6.2
METRES_PER_LEVEL = 3.0


def fetch_ways() -> list[dict]:
    query = (
        "[out:json][timeout:30];"
        "way[building](%f,%f,%f,%f);"
        "out geom;" % BBOX
    )
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        OVERPASS_URL, data=data, headers={"User-Agent": "KIVULI-hackathon/1.0"}
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.load(resp)["elements"]


def height_of(tags: dict) -> float:
    h = tags.get("height")
    if h:
        try:
            return float(str(h).replace("m", "").strip())
        except ValueError:
            pass

    levels = tags.get("building:levels")
    if levels:
        try:
            return float(levels) * METRES_PER_LEVEL
        except ValueError:
            pass

    return DEFAULT_HEIGHT_M


def to_feature(way: dict) -> dict | None:
    geom = way.get("geometry")
    if not geom or len(geom) < 4:
        return None

    ring = [[pt["lon"], pt["lat"]] for pt in geom]
    if ring[0] != ring[-1]:
        ring.append(ring[0])

    tags = way.get("tags", {})
    return {
        "type": "Feature",
        "properties": {
            "id": str(way["id"]),
            "name": tags.get("name"),
            "heightM": round(height_of(tags), 1),
            "heightSource": (
                "osm_height" if tags.get("height")
                else "osm_levels" if tags.get("building:levels")
                else "default"
            ),
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def main() -> None:
    ways = fetch_ways()
    features = [f for w in ways if (f := to_feature(w)) is not None]

    by_source: dict[str, int] = {}
    for f in features:
        src = f["properties"]["heightSource"]
        by_source[src] = by_source.get(src, 0) + 1

    print(f"Buildings in campus core: {len(features)}")
    for src, n in by_source.items():
        print(f"  {src}: {n}")

    collection = {"type": "FeatureCollection", "features": features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(collection), encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(ROOT)} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
