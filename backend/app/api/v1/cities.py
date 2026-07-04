from fastapi import APIRouter, HTTPException

from app.db.repositories import solutions as solutions_repo
from app.schemas.solutions import CaseDetailOut, CaseSummaryOut, CityOut, CityRef

router = APIRouter(tags=["cities"])


@router.get("/cities", response_model=list[CityOut])
def list_cities() -> list[CityOut]:
    """Cities with solved-problem cases, for the world map labels."""
    return [CityOut(**row) for row in solutions_repo.list_cities_with_case_counts()]


@router.get("/cities/{city_id}/cases", response_model=list[CaseSummaryOut])
def list_city_cases(city_id: str) -> list[CaseSummaryOut]:
    return [CaseSummaryOut(**row) for row in solutions_repo.list_cases_by_city(city_id)]


@router.get("/cases/{case_id}", response_model=CaseDetailOut)
def get_case(case_id: str) -> CaseDetailOut:
    row = solutions_repo.get_case(case_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Case not found")
    city = row.pop("cities", None) or {}
    return CaseDetailOut(**row, city=CityRef(**city))
