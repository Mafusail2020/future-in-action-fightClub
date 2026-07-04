"""Persist a SourceOutput: documents -> chunks -> embeddings, plus metrics and map features."""

from app.db.repositories import documents as docs_repo
from app.db.repositories import metrics_features as mf_repo
from app.db.repositories import raions as raions_repo
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_texts
from ingestion.common.base_source import Source, SourceOutput


def load(source: Source, output: SourceOutput) -> list[str]:
    source_id = docs_repo.upsert_source(source.kind, source.name)
    slug_map = raions_repo.slug_id_map()

    def resolve(slug: str | None) -> str | None:
        if slug and slug not in slug_map:
            print(f"  ! unknown raion slug '{slug}' — stored as city-wide")
        return slug_map.get(slug) if slug else None

    doc_ids: list[str] = []
    for raw in output.docs:
        raion_id = resolve(raw.raion_slug)
        if raw.external_id:  # re-scrape replaces the previous version of this doc
            docs_repo.delete_by_external_id(source_id, raw.external_id)
        doc_id = docs_repo.insert_document({
            "source_id": source_id,
            "raion_id": raion_id,
            "title": raw.title,
            "doc_type": raw.doc_type,
            "category": raw.category,
            "url": raw.url,
            "published_at": raw.published_at.isoformat() if raw.published_at else None,
            "external_id": raw.external_id,
            "content": raw.content,
            "meta": raw.meta,
        })
        chunks = chunk_text(raw.content)
        if chunks:
            embeddings = embed_texts(chunks)
            docs_repo.insert_chunks([
                {
                    "document_id": doc_id,
                    "raion_id": raion_id,
                    "category": raw.category,
                    "chunk_index": i,
                    "content": chunk,
                    "embedding": embedding,
                }
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
            ])
        doc_ids.append(doc_id)
        print(f"  doc: {raw.title!r} -> {len(chunks)} chunks")

    if output.metrics:
        metric_rows = []
        for m in output.metrics:
            slug = m.get("raion_slug")
            if slug is not None and slug not in slug_map:
                print(f"  ! metric '{m['metric']}': unknown raion '{slug}' — dropped")
                continue
            metric_rows.append({
                "raion_id": slug_map.get(slug) if slug else None,  # None = city-wide
                "metric": m["metric"],
                "value": m["value"],
                "unit": m.get("unit"),
                "source_id": source_id,
                "meta": m.get("meta", {}),
            })
        mf_repo.insert_metrics(metric_rows)
        print(f"  metrics: {len(metric_rows)}")

    if output.features:
        mf_repo.insert_features([
            {
                "raion_id": resolve(f.get("raion_slug")),
                "feature_type": f["feature_type"],
                "label": f.get("label"),
                "geometry": f["geometry"],
                "properties": f.get("properties", {}),
                "document_id": doc_ids[f["doc_ref"]] if f.get("doc_ref") is not None else None,
            }
            for f in output.features
        ])
        print(f"  features: {len(output.features)}")

    return doc_ids
