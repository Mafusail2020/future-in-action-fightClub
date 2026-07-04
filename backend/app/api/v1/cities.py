from fastapi import APIRouter, Depends, HTTPException

from app.db.repositories.cities import CitiesRepository
from app.db.repositories.solutions import SolutionsRepository
from app.dependencies import get_cities_repo, get_solutions_repo
from app.domain.models import City, Solution

router = APIRouter(prefix="/cities", tags=["cities"])


@router.get("")
def list_cities(repo: CitiesRepository = Depends(get_cities_repo)) -> list[City]:
    """All cities with solution counts — powers the world map."""
    return [City(**row) for row in repo.list_with_counts()]


@router.get("/{city_id}")
def get_city(
    city_id: str,
    cities: CitiesRepository = Depends(get_cities_repo),
    solutions: SolutionsRepository = Depends(get_solutions_repo),
) -> dict:
    """A city and every solution it implemented — the click-city popup."""
    city = cities.get(city_id)
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    sols = solutions.by_city(city_id)
    return {
        "city": City(**city),
        "solutions": [Solution(**s) for s in sols],
    }
