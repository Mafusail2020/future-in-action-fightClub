from fastapi import APIRouter

from app.domain.categories import CATEGORY_LABELS

router = APIRouter()


@router.get("/categories")
def list_categories() -> list[dict]:
    return [{"value": value, "label": label} for value, label in CATEGORY_LABELS.items()]
