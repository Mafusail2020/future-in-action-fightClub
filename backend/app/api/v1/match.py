from fastapi import APIRouter, Depends

from app.agent.pipeline import Agent
from app.dependencies import get_agent
from app.domain.models import MatchRequest, MatchResponse

router = APIRouter(tags=["agent"])


@router.post("/match")
def match(req: MatchRequest, agent: Agent = Depends(get_agent)) -> MatchResponse:
    """Ranked solutions from other cities for the user's city — the recommendations view."""
    profile, matches = agent.recommend(req.city, req.country, req.limit)
    return MatchResponse(profile=profile, matches=matches)
