from pydantic import BaseModel


class CitationModel(BaseModel):
    n: int                          # inline marker in the answer text: [1], [2], ...
    chunk_id: str
    source_type: str                # document | digest | metric | feature | solution_case
    title: str
    url: str | None = None
    snippet: str                    # exact retrieved text — render in the sources side panel
    raion: str | None = None
    city: str | None = None
    published_at: str | None = None
