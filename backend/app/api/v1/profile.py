from fastapi import APIRouter, Depends

from app.agent.pipeline import Agent
from app.dependencies import get_agent
from app.domain.models import CityProfile, ProfileRequest

router = APIRouter(tags=["agent"])


@router.post("/profile")
def build_profile(req: ProfileRequest, agent: Agent = Depends(get_agent)) -> CityProfile:
    """Generate (or return cached) profile of the user's city — the city-profile tab."""
    return agent.build_profile(req.city, req.country)
