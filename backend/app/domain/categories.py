"""Controlled vocabulary of solution categories.

Single source of truth. The SQL CHECK constraint in 0001_schema.sql mirrors this list —
keep them in sync.
"""

from enum import StrEnum


class Category(StrEnum):
    TRANSPORT = "transport"
    ENERGY = "energy"
    HOUSING = "housing"
    WATER = "water"
    WASTE = "waste"
    SAFETY = "safety"
    HEALTH = "health"
    ENVIRONMENT = "environment"
    DIGITAL = "digital"
    GOVERNANCE = "governance"
    ECONOMY = "economy"
    CLIMATE_RESILIENCE = "climate_resilience"


CATEGORIES: list[str] = [c.value for c in Category]

# Human-friendly labels for the frontend filter UI.
CATEGORY_LABELS: dict[str, str] = {
    Category.TRANSPORT: "Transport & Mobility",
    Category.ENERGY: "Energy & Heating",
    Category.HOUSING: "Housing",
    Category.WATER: "Water & Sanitation",
    Category.WASTE: "Waste Management",
    Category.SAFETY: "Public Safety",
    Category.HEALTH: "Health",
    Category.ENVIRONMENT: "Environment & Green Space",
    Category.DIGITAL: "Digital & Smart City",
    Category.GOVERNANCE: "Governance & Participation",
    Category.ECONOMY: "Local Economy",
    Category.CLIMATE_RESILIENCE: "Climate Resilience",
}


def is_valid(category: str) -> bool:
    return category in CATEGORIES
