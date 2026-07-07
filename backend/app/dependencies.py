"""FastAPI dependency providers. All lazy so the app boots without secrets (e.g. /health)."""

from __future__ import annotations

from app.agent.llm import make_llm
from app.agent.pipeline import Agent
from app.db.client import get_supabase
from app.db.repositories.cities import CitiesRepository
from app.db.repositories.map_layers import MapLayersRepository
from app.db.repositories.profiles import ProfilesRepository
from app.db.repositories.rag import RagRepository
from app.db.repositories.solutions import SolutionsRepository
from app.research.dossier import DossierBuilder


def get_cities_repo() -> CitiesRepository:
    return CitiesRepository(get_supabase())


def get_map_layers_repo() -> MapLayersRepository:
    return MapLayersRepository(get_supabase())


def get_solutions_repo() -> SolutionsRepository:
    return SolutionsRepository(get_supabase())


def get_profiles_repo() -> ProfilesRepository:
    return ProfilesRepository(get_supabase())


def get_rag_repo() -> RagRepository:
    return RagRepository(get_supabase())


def get_dossier_builder() -> DossierBuilder:
    client = get_supabase()
    return DossierBuilder(
        llm=make_llm(),
        rag=RagRepository(client),
        profiles=ProfilesRepository(client),
    )


def get_agent() -> Agent:
    client = get_supabase()
    return Agent(
        llm=make_llm(),
        cities=CitiesRepository(client),
        solutions=SolutionsRepository(client),
        profiles=ProfilesRepository(client),
        rag=RagRepository(client),
    )
