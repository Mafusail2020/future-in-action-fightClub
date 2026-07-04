"""Ingestion CLI. Run from backend/:

    uv run python -m ingestion.run --source osm|docs|news|cameras|public|saveecobot|prozorro|citybudget|all
"""

import argparse

from ingestion.common import loader
from ingestion.sources.cameras import CamerasSource
from ingestion.sources.citybudget import CityBudgetSource
from ingestion.sources.news import NewsSource
from ingestion.sources.official_docs import OfficialDocsSource
from ingestion.sources.osm import OsmSource
from ingestion.sources.prozorro import ProzorroSource
from ingestion.sources.public_data import PublicDataSource
from ingestion.sources.saveecobot import SaveEcoBotSource

REGISTRY = {
    "osm": OsmSource,
    "docs": OfficialDocsSource,
    "news": NewsSource,
    "cameras": CamerasSource,
    "public": PublicDataSource,
    "saveecobot": SaveEcoBotSource,
    "prozorro": ProzorroSource,
    "citybudget": CityBudgetSource,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest data into the problems layer")
    parser.add_argument("--source", required=True, choices=[*REGISTRY, "all"])
    parser.add_argument("--force", action="store_true",
                        help="bypass the on-disk cache for API scrapers")
    args = parser.parse_args()

    names = list(REGISTRY) if args.source == "all" else [args.source]
    for name in names:
        print(f"=== {name} ===")
        source = REGISTRY[name]()
        if args.force and hasattr(source, "force"):
            source.force = True
        output = source.fetch()
        if not (output.docs or output.metrics or output.features):
            print("  nothing to ingest")
            continue
        loader.load(source, output)
    print("Ingestion finished. Remember: uv run python -m scripts.generate_digests")


if __name__ == "__main__":
    main()
