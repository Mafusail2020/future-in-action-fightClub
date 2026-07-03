"""Official documents source: PDFs from data/docs/ plus URLs from data/docs_urls.txt.

Filename convention `<category>__<raion-slug>__<title>.pdf` skips LLM classification;
anything else is classified with the router model.
"""

from datetime import date
from pathlib import Path

import httpx
import pymupdf

from ingestion.common.base_source import CATEGORIES, RawDoc, Source, SourceOutput
from ingestion.common.classify import classify_document

DOCS_DIR = Path("data/docs")
URLS_FILE = Path("data/docs_urls.txt")
DOWNLOAD_DIR = Path("data/raw/docs")


def _read_url_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    lines = path.read_text().splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.strip().startswith("#")]


def _extract_text(pdf_path: Path) -> str:
    with pymupdf.open(pdf_path) as doc:
        return "\n".join(page.get_text() for page in doc)


class OfficialDocsSource(Source):
    kind = "official_doc"
    name = "zhytomyr-official-docs"

    def fetch(self) -> SourceOutput:
        output = SourceOutput()

        pdf_paths: list[tuple[Path, str | None]] = [
            (p, None) for p in sorted(DOCS_DIR.glob("*.pdf"))
        ]
        for url in _read_url_list(URLS_FILE):
            try:
                DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
                target = DOWNLOAD_DIR / url.rstrip("/").split("/")[-1]
                if not target.exists():
                    target.write_bytes(httpx.get(url, timeout=60, follow_redirects=True).content)
                pdf_paths.append((target, url))
            except Exception as exc:
                print(f"  ! download failed {url}: {exc}")

        for path, url in pdf_paths:
            try:
                text = _extract_text(path)
            except Exception as exc:
                print(f"  ! cannot read {path.name}: {exc}")
                continue
            if len(text.strip()) < 100:
                print(f"  ! {path.name}: no extractable text (scanned PDF?) — skipped")
                continue

            parts = path.stem.split("__")
            if len(parts) == 3 and parts[0] in CATEGORIES:
                category, raion_slug = parts[0], parts[1] or None
                title = parts[2].replace("-", " ").replace("_", " ")
            else:
                label = classify_document(text, title_hint=path.stem)
                category, raion_slug, title = label.category, label.raion_slug, label.title

            output.docs.append(RawDoc(
                title=title,
                content=text,
                doc_type="official_doc",
                category=category,
                raion_slug=raion_slug,
                url=url,
                published_at=date.fromtimestamp(path.stat().st_mtime),
                meta={"filename": path.name},
            ))

        return output
