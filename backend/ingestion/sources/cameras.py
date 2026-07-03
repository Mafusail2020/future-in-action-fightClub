"""Camera source: snapshot images -> vision LLM -> observation doc + metrics + map point.

Snapshots go into data/camera_snapshots/, named:
    <raion-slug>__<lat>__<lng>.jpg     (coordinates optional: <raion-slug>.jpg)
Runs offline on demand — no live stream processing.
"""

import base64
from pathlib import Path
from typing import Literal

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from app.config import get_settings
from ingestion.common.base_source import RawDoc, Source, SourceOutput

SNAPSHOTS_DIR = Path("data/camera_snapshots")
_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
_TRAFFIC_SCORE = {"none": 0, "low": 1, "moderate": 2, "heavy": 3}

_PROMPT = (
    "You are analyzing a street camera snapshot from Zhytomyr, Ukraine, for a city "
    "monitoring system. Report only what is actually visible."
)


class CameraObservation(BaseModel):
    traffic_level: Literal["none", "low", "moderate", "heavy"]
    vehicle_count: int = Field(description="Vehicles visible in frame")
    pothole_count: int = Field(description="Distinct road surface defects visible")
    road_condition: Literal["good", "fair", "poor", "not_visible"]
    notes: str = Field(description="1-3 sentences: anything notable (parking, crowds, works...)")


class CamerasSource(Source):
    kind = "camera"
    name = "zhytomyr-street-cameras"

    def fetch(self) -> SourceOutput:
        output = SourceOutput()
        images = [p for p in sorted(SNAPSHOTS_DIR.iterdir()) if p.suffix.lower() in _MIME] \
            if SNAPSHOTS_DIR.exists() else []
        if not images:
            return output

        llm = init_chat_model(get_settings().main_model, temperature=0) \
            .with_structured_output(CameraObservation)

        for image_path in images:
            parts = image_path.stem.split("__")
            raion_slug = parts[0]
            lat = float(parts[1]) if len(parts) == 3 else None
            lng = float(parts[2]) if len(parts) == 3 else None

            message = HumanMessage(content=[
                {"type": "text", "text": _PROMPT},
                {
                    "type": "image",
                    "source_type": "base64",
                    "mime_type": _MIME[image_path.suffix.lower()],
                    "data": base64.b64encode(image_path.read_bytes()).decode(),
                },
            ])
            try:
                obs: CameraObservation = llm.invoke([message])
            except Exception as exc:
                print(f"  ! vision failed for {image_path.name}: {exc}")
                continue

            content = (
                f"Camera snapshot report, raion '{raion_slug}'"
                + (f" at ({lat}, {lng})" if lat else "") + ".\n"
                f"Traffic level: {obs.traffic_level} ({obs.vehicle_count} vehicles visible). "
                f"Road condition: {obs.road_condition}, "
                f"visible road defects: {obs.pothole_count}.\n"
                f"Notes: {obs.notes}"
            )
            doc_ref = len(output.docs)
            output.docs.append(RawDoc(
                title=f"Camera report: {image_path.stem}",
                content=content,
                doc_type="camera_report",
                category="roads",
                raion_slug=raion_slug,
                meta={"filename": image_path.name},
            ))
            output.metrics += [
                {"raion_slug": raion_slug, "metric": "camera_traffic_level",
                 "value": _TRAFFIC_SCORE[obs.traffic_level], "unit": "0-3",
                 "meta": {"label": obs.traffic_level}},
                {"raion_slug": raion_slug, "metric": "camera_vehicle_count",
                 "value": obs.vehicle_count, "unit": "vehicles"},
                {"raion_slug": raion_slug, "metric": "camera_pothole_count",
                 "value": obs.pothole_count, "unit": "defects"},
            ]
            if lat is not None and lng is not None:
                output.features.append({
                    "raion_slug": raion_slug,
                    "feature_type": "pothole" if obs.pothole_count else "camera",
                    "label": f"Камера: {obs.traffic_level} трафік, "
                             f"дефектів дороги: {obs.pothole_count}",
                    "geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "properties": {"traffic_level": obs.traffic_level,
                                   "pothole_count": obs.pothole_count},
                    "doc_ref": doc_ref,
                })
            print(f"  {image_path.name}: traffic={obs.traffic_level} potholes={obs.pothole_count}")

        return output
