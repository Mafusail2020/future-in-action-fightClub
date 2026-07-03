import json

from langchain_core.tools import tool

from app.rag import retriever


@tool
def solutions_search(query: str, domain: str | None = None,
                     include_large_cities: bool = False) -> str:
    """Search case studies of how OTHER cities solved urban problems.

    By default only cities comparable to Zhytomyr (100k-600k population) are searched.
    Args:
        query: the problem to find solutions for; include concrete Zhytomyr specifics.
        domain: one of roads|transport|commerce|demographics|utilities|safety, or omit.
        include_large_cities: set true only if the comparable-city search found nothing.
    Returns JSON case fragments; each has an "id" usable for citations.
    """
    pop_band = None if include_large_cities else retriever.ZHYTOMYR_POP_BAND
    items = [
        {
            "id": row["id"],
            "source_type": "solution_case",
            "content": row["content"],
            "case_id": row["case_id"],
            "city": f"{row.get('city_name')}, {row.get('country')}",
            "population": row.get("population"),
            "similarity": round(row.get("similarity", 0), 3),
        }
        for row in retriever.search_solutions(query, domain=domain, pop_band=pop_band)
    ]
    return json.dumps({"items": items}, ensure_ascii=False, default=str)
