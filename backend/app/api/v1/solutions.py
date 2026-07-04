from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.repositories.solutions import SolutionsRepository
from app.dependencies import get_solutions_repo
from app.domain.models import Solution

router = APIRouter(prefix="/solutions", tags=["solutions"])


@router.get("")
def list_solutions(
    category: str | None = Query(default=None),
    city_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
    repo: SolutionsRepository = Depends(get_solutions_repo),
) -> list[Solution]:
    return [Solution(**row) for row in repo.list(category=category, city_id=city_id, q=q)]


@router.get("/{solution_id}")
def get_solution(
    solution_id: str,
    repo: SolutionsRepository = Depends(get_solutions_repo),
) -> Solution:
    row = repo.get(solution_id)
    if not row:
        raise HTTPException(status_code=404, detail="Solution not found")
    return Solution(**row)
