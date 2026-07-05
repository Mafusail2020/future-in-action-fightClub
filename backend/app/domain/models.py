"""Pydantic models shared across the API and agent layers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.categories import Category


# --- Core entities -------------------------------------------------------------------

class City(BaseModel):
    id: str
    name: str
    country: str
    region: str | None = None
    lat: float
    lng: float
    population: int | None = None
    area_km2: float | None = None
    climate: str | None = None
    solution_count: int | None = None


class Solution(BaseModel):
    id: str
    city_id: str
    category: Category
    title: str
    problem: str
    solution: str
    outcome: str | None = None
    cost: str | None = None
    year_start: int | None = None
    year_end: int | None = None
    source_urls: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    # Denormalized city fields, populated when a solution is served with its city context.
    city: City | None = None


# --- Agent I/O -----------------------------------------------------------------------

class CityProfile(BaseModel):
    """Generated profile of the user's city and its likely challenges."""

    city: str
    country: str
    region: str | None = None
    population_tier: str | None = None  # e.g. "small", "mid-size", "large", "metropolis"
    climate: str | None = None
    density: str | None = None
    economy: str | None = None
    problem_domains: list[Category] = Field(default_factory=list)
    notable_challenges: list[str] = Field(default_factory=list)
    summary: str | None = None


class Match(BaseModel):
    """A single ranked solution recommendation for the user's city."""

    solution_id: str
    score: float = Field(ge=0, le=1)
    rationale: str
    adaptation_notes: str | None = None
    solution: Solution | None = None  # hydrated from the catalog before returning


# --- Request / response payloads -----------------------------------------------------

class ProfileRequest(BaseModel):
    city: str
    country: str


class MatchRequest(BaseModel):
    city: str
    country: str
    limit: int = Field(default=8, ge=1, le=20)


class MatchResponse(BaseModel):
    profile: CityProfile
    matches: list[Match]


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    city: str | None = None
    country: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    limit: int = Field(default=6, ge=1, le=20)
    # Per-request model override; None -> ANTHROPIC_MODEL from settings.
    model: Literal[
        "claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"
    ] | None = None
