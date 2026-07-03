"""News source: article URLs from data/news_urls.txt -> trafilatura -> classified RawDocs."""

from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import httpx
import trafilatura

from ingestion.common.base_source import RawDoc, Source, SourceOutput
from ingestion.common.classify import classify_document

URLS_FILE = Path("data/news_urls.txt")
_UA = {"User-Agent": "Mozilla/5.0 (city-adviser hackathon bot; contact in repo)"}


class NewsSource(Source):
    kind = "news"
    name = "zhytomyr-news"

    def fetch(self) -> SourceOutput:
        output = SourceOutput()
        if not URLS_FILE.exists():
            return output

        urls = [
            ln.strip() for ln in URLS_FILE.read_text().splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
        for url in urls:
            try:
                html = httpx.get(url, timeout=30, follow_redirects=True, headers=_UA).text
            except Exception as exc:
                print(f"  ! fetch failed {url}: {exc}")
                continue

            text = trafilatura.extract(html, include_comments=False)
            if not text or len(text) < 200:
                print(f"  ! no article text extracted from {url}")
                continue

            published = None
            title = None
            try:
                metadata = trafilatura.extract_metadata(html)
                if metadata:
                    title = metadata.title
                    if metadata.date:
                        published = date.fromisoformat(str(metadata.date)[:10])
            except Exception:
                pass

            label = classify_document(text, title_hint=title or urlparse(url).path)
            output.docs.append(RawDoc(
                title=title or label.title,
                content=text,
                doc_type="article",
                category=label.category,
                raion_slug=label.raion_slug,
                url=url,
                published_at=published,
                meta={"domain": urlparse(url).netloc},
            ))
            print(f"  article: {title or url}")

        return output
