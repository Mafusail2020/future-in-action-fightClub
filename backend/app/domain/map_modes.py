"""Registry of map overlay modes.

Single source of truth for which modes exist and how the frontend should render
them. Adding a mode = one enum value + one descriptor line (+ a prompt file and a
scorer entry in scripts/build_map_layers.py). No schema change: map_layers.mode
is free text and unknown modes 404 at the API.
"""

from enum import StrEnum


class MapMode(StrEnum):
    POPULATION_DENSITY = "population_density"
    ROAD_CONDITION = "road_condition"
    TRAFFIC = "traffic"


# value -> descriptor served by the API; the frontend renders purely from this.
# kind: "polygon" | "line" — which MapLibre layer set to build.
# value_prop: feature property holding the 0..1 score; for temporal modes it is
#   the prefix (traffic stores h0..h23, the client appends the hour).
MODE_DESCRIPTORS: dict[str, dict] = {
    MapMode.POPULATION_DENSITY: {
        "label": "Щільність населення",
        "kind": "polygon",
        "value_prop": "density",
        "temporal": False,
    },
    MapMode.ROAD_CONDITION: {
        "label": "Стан доріг",
        "kind": "line",
        "value_prop": "condition",
        "temporal": False,
    },
    MapMode.TRAFFIC: {
        "label": "Трафік за годинами",
        "kind": "line",
        "value_prop": "h",
        "temporal": True,
    },
}
