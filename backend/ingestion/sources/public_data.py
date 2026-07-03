"""Public datasets source: CSV/JSON files from data/public/ mapped straight to metrics.

Expected columns/keys per row: raion_slug, metric, value, unit (optional).
Good for anything exported from opendata portals or hand-collected stats.
"""

import csv
import json
from pathlib import Path

from ingestion.common.base_source import Source, SourceOutput

PUBLIC_DIR = Path("data/public")


class PublicDataSource(Source):
    kind = "public_doc"
    name = "zhytomyr-public-datasets"

    def fetch(self) -> SourceOutput:
        output = SourceOutput()
        if not PUBLIC_DIR.exists():
            return output

        rows: list[dict] = []
        for path in sorted(PUBLIC_DIR.iterdir()):
            try:
                if path.suffix == ".csv":
                    with path.open(newline="", encoding="utf-8-sig") as f:
                        rows += list(csv.DictReader(f))
                elif path.suffix == ".json":
                    rows += json.loads(path.read_text())
            except Exception as exc:
                print(f"  ! cannot parse {path.name}: {exc}")

        for row in rows:
            try:
                output.metrics.append({
                    "raion_slug": row["raion_slug"].strip(),
                    "metric": row["metric"].strip(),
                    "value": float(row["value"]),
                    "unit": (row.get("unit") or "").strip() or None,
                })
            except (KeyError, ValueError) as exc:
                print(f"  ! bad row {row}: {exc}")

        return output
