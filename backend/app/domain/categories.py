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
    Category.TRANSPORT: "Транспорт і мобільність",
    Category.ENERGY: "Енергетика й опалення",
    Category.HOUSING: "Житло",
    Category.WATER: "Вода й водовідведення",
    Category.WASTE: "Поводження з відходами",
    Category.SAFETY: "Громадська безпека",
    Category.HEALTH: "Здоров'я",
    Category.ENVIRONMENT: "Довкілля й зелені зони",
    Category.DIGITAL: "Цифрове й розумне місто",
    Category.GOVERNANCE: "Врядування й участь",
    Category.ECONOMY: "Місцева економіка",
    Category.CLIMATE_RESILIENCE: "Кліматична стійкість",
}


def is_valid(category: str) -> bool:
    return category in CATEGORIES
