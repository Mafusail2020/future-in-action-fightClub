"""Ingestion CLI. Run from backend/:

    uv run python -m ingestion.run --source osm|docs|news|cameras|public|all
"""

import argparse

from ingestion.common import loader
from ingestion.sources.cameras import CamerasSource
from ingestion.sources.news import NewsSource
from ingestion.sources.official_docs import OfficialDocsSource
from ingestion.sources.osm import OsmSource
from ingestion.sources.public_data import PublicDataSource

REGISTRY = {
    "osm": OsmSource,
    "docs": OfficialDocsSource,
    "news": NewsSource,
    "cameras": CamerasSource,
    "public": PublicDataSource,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest data into the problems layer")
    parser.add_argument("--source", required=True, choices=[*REGISTRY, "all"])
    args = parser.parse_args()

    names = list(REGISTRY) if args.source == "all" else [args.source]
    for name in names:
        print(f"=== {name} ===")
        source = REGISTRY[name]()
        output = source.fetch()
        if not (output.docs or output.metrics or output.features):
            print("  nothing to ingest")
            continue
        loader.load(source, output)
    print("Ingestion finished. Remember: uv run python -m scripts.generate_digests")


if __name__ == "__main__":
    main()
