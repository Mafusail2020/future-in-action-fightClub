"""Map-director ops: the ONLY way the model touches the map.

Pax-Historia safety model: the LLM references known city ids through this
validated vocabulary; geometry and rendering stay on our side. Invalid ops are
dropped silently — a bad op must never break the answer stream.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, ValidationError

MAX_OPS_PER_TURN = 8
_HOME = "home"

CityRef = str  # a city id from the catalog, or "home" (the user's city)


class ZoomToOp(BaseModel):
    op: Literal["zoom_to"]
    target: CityRef | list[CityRef]
    zoom: float | None = Field(default=None, ge=1, le=14)


class HighlightOp(BaseModel):
    op: Literal["highlight"]
    city_ids: list[CityRef] = Field(min_length=1, max_length=10)
    style: Literal["pulse", "ring", "glow"] = "pulse"
    duration_s: float | None = Field(default=None, ge=1, le=60)


class MarkOp(BaseModel):
    op: Literal["mark"]
    city_id: CityRef
    kind: Literal["pin", "star", "warning", "check", "flag"] = "pin"
    label: str | None = Field(default=None, max_length=60)


class CalloutOp(BaseModel):
    op: Literal["callout"]
    city_id: CityRef
    text: str = Field(min_length=1, max_length=200)
    side: Literal["auto", "left", "right"] = "auto"


class ConnectOp(BaseModel):
    op: Literal["connect"]
    from_: CityRef = Field(alias="from")
    to: CityRef
    label: str | None = Field(default=None, max_length=40)

    model_config = {"populate_by_name": True}


class TourStop(BaseModel):
    city_id: CityRef
    text: str | None = Field(default=None, max_length=200)
    hold_s: float = Field(default=3, ge=1, le=10)


class TourOp(BaseModel):
    op: Literal["tour"]
    stops: list[TourStop] = Field(min_length=1, max_length=5)
    zoom: float | None = Field(default=None, ge=1, le=14)


class SpotlightOp(BaseModel):
    op: Literal["spotlight"]
    city_ids: list[CityRef] = Field(default_factory=list, max_length=10)
    off: bool = False


class ClearOp(BaseModel):
    op: Literal["clear"]


MapOp = Annotated[
    Union[ZoomToOp, HighlightOp, MarkOp, CalloutOp, ConnectOp, TourOp, SpotlightOp, ClearOp],
    Field(discriminator="op"),
]


class _OpEnvelope(BaseModel):
    root: MapOp


def _refs(op: BaseModel) -> list[str]:
    """Every city reference an op makes (for id validation)."""
    match op:
        case ZoomToOp(target=target):
            return target if isinstance(target, list) else [target]
        case HighlightOp(city_ids=ids) | SpotlightOp(city_ids=ids):
            return list(ids)
        case MarkOp(city_id=cid) | CalloutOp(city_id=cid):
            return [cid]
        case ConnectOp(from_=a, to=b):
            return [a, b]
        case TourOp(stops=stops):
            return [s.city_id for s in stops]
    return []


def validate_op(raw: dict, known_city_ids: set[str]) -> dict | None:
    """Parse + validate a raw tool input; returns a JSON-ready op dict or None."""
    try:
        op = _OpEnvelope(root=raw).root
    except ValidationError:
        return None
    for ref in _refs(op):
        if ref != _HOME and ref not in known_city_ids:
            return None
    return op.model_dump(by_alias=True, exclude_none=True)


# One tool, `op` discriminates — keeps the model's tool list minimal.
MAP_OP_TOOL: dict = {
    "name": "direct_map",
    "description": (
        "Direct the interactive world map the user is looking at. Use ONLY when it adds "
        "spatial value (showing a city, comparing places, guiding attention) — most answers "
        "need no map ops. Reference cities strictly by ids from the city catalog or the "
        "matched solutions; the string 'home' means the user's own city. Ops: zoom_to "
        "(fly camera), highlight (pulse/ring/glow on cities), mark (pin/star/warning/check/"
        "flag + short label), callout (short text bubble anchored to a city — prefer this "
        "when pointing at one place), connect (animated arc between two cities), tour "
        "(2-5 stop camera journey with texts), spotlight (dim everything except chosen "
        "cities; off:true to undo), clear (reset your previous map drawings)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "op": {
                "type": "string",
                "enum": [
                    "zoom_to", "highlight", "mark", "callout",
                    "connect", "tour", "spotlight", "clear",
                ],
            },
            "target": {
                "description": "zoom_to: city id, 'home', or array of ids to fit",
                "anyOf": [
                    {"type": "string"},
                    {"type": "array", "items": {"type": "string"}, "maxItems": 10},
                ],
            },
            "zoom": {"type": "number", "minimum": 1, "maximum": 14},
            "city_ids": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
            "style": {"type": "string", "enum": ["pulse", "ring", "glow"]},
            "duration_s": {"type": "number", "minimum": 1, "maximum": 60},
            "city_id": {"type": "string"},
            "kind": {"type": "string", "enum": ["pin", "star", "warning", "check", "flag"]},
            "label": {"type": "string", "maxLength": 60},
            "text": {"type": "string", "maxLength": 200},
            "side": {"type": "string", "enum": ["auto", "left", "right"]},
            "from": {"type": "string"},
            "to": {"type": "string"},
            "stops": {
                "type": "array",
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "city_id": {"type": "string"},
                        "text": {"type": "string", "maxLength": 200},
                        "hold_s": {"type": "number", "minimum": 1, "maximum": 10},
                    },
                    "required": ["city_id"],
                },
            },
            "off": {"type": "boolean"},
        },
        "required": ["op"],
    },
}
