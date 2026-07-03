"""Generate and persist per-raion digests. Run after every ingest."""

from pathlib import Path
from typing import Any

from langchain.chat_models import init_chat_model

from app.config import get_settings
from app.db.repositories import digests as digests_repo
from app.db.repositories import documents as docs_repo
from app.db.repositories import metrics_features as mf_repo
from app.db.repositories import raions as raions_repo
from app.rag.embeddings import embed_texts

_PROMPT_PATH = Path(__file__).resolve().parents[1] / "agent" / "prompts" / "digest.md"


def generate_digest(raion: dict[str, Any]) -> str:
    documents = docs_repo.list_documents_for_raion(raion["id"], limit=30)
    metrics = mf_repo.get_metrics(raion["id"], limit=60)

    metric_lines = "\n".join(
        f"- {m['metric']}: {m['value']} {m['unit'] or ''}".rstrip() for m in metrics
    ) or "(немає)"
    doc_lines = "\n\n".join(
        f"### {d['title']} ({d['doc_type']}, категорія: {d['category'] or 'загальна'})\n"
        f"{d['content'][:600]}"
        for d in documents
    ) or "(немає)"

    prompt = _PROMPT_PATH.read_text().format(
        name=raion["name_uk"], metrics=metric_lines, documents=doc_lines
    )
    llm = init_chat_model(get_settings().main_model, temperature=0.2)
    content = llm.invoke(prompt).text

    digests_repo.save_digest(raion["id"], content, embed_texts([content])[0])
    return content


def generate_all() -> None:
    raions = raions_repo.list_raions()
    if not raions:
        print("raions table is empty — run scripts.seed_raions first")
        return
    for raion in raions:
        print(f"digest: {raion['name_uk']} ...", flush=True)
        generate_digest(raion)
    print(f"Done — {len(raions)} digests.")
