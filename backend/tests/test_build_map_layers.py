"""Scoring pipeline of scripts/build_map_layers.py with a fake LLM (no network)."""

from scripts.build_map_layers import batches, score_features, score_props


def _road(name: str) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "MultiLineString", "coordinates": [[[28.6, 50.2], [28.7, 50.3]]]},
        "properties": {"name": name, "road_class": "primary"},
    }


class FakeLLM:
    """Returns canned scores; records how many batches were requested."""

    def __init__(self, scores_per_call: list[list[dict]]):
        self.scores_per_call = scores_per_call
        self.calls: list[str] = []

    def structured(self, system, prompt, schema, **kwargs):
        self.calls.append(prompt)
        return {"scores": self.scores_per_call[len(self.calls) - 1]}


def test_batches_split():
    assert [len(b) for b in batches(list(range(95)), 40)] == [40, 40, 15]
    assert batches([], 40) == []


def test_score_features_merges_and_drops_hallucinations():
    features = [_road("вулиця Київська"), _road("вулиця Тиха")]
    llm = FakeLLM(
        [
            [
                {"name": "Вулиця КИЇВСЬКА", "condition": 0.8},  # case-insensitive join
                {"name": "вулиця Вигадана", "condition": 0.1},  # never sent -> dropped
            ]
        ]
    )

    scored = score_features(llm, "road_condition", {"name": "Zhytomyr", "country": "Ukraine"}, features)

    assert scored == 1
    assert features[0]["properties"]["condition"] == 0.8
    assert "condition" not in features[1]["properties"]  # unscored stays gray
    assert "Zhytomyr" in llm.calls[0] and "вулиця Тиха" in llm.calls[0]


def test_traffic_scores_flatten_and_clamp():
    props = score_props("traffic", {"name": "x", "hours": [1.5] + [0.2] * 22 + [-0.1]})
    assert props is not None
    assert len(props) == 24
    assert props["h0"] == 1.0  # clamped down
    assert props["h23"] == 0.0  # clamped up
    assert props["h5"] == 0.2


def test_traffic_wrong_hour_count_rejected():
    assert score_props("traffic", {"name": "x", "hours": [0.5] * 23}) is None


def test_density_props_include_confidence():
    props = score_props("population_density", {"name": "Центр", "density": 0.9, "confidence": "high"})
    assert props == {"density": 0.9, "confidence": "high"}


def test_traffic_batches_of_twenty():
    features = [_road(f"вулиця {i}") for i in range(45)]
    canned = [
        [{"name": f"вулиця {i}", "hours": [0.1] * 24} for i in range(20)],
        [{"name": f"вулиця {i}", "hours": [0.1] * 24} for i in range(20, 40)],
        [{"name": f"вулиця {i}", "hours": [0.1] * 24} for i in range(40, 45)],
    ]
    llm = FakeLLM(canned)

    scored = score_features(llm, "traffic", {"name": "Zhytomyr", "country": "Ukraine"}, features)

    assert len(llm.calls) == 3
    assert scored == 45
    assert features[44]["properties"]["h8"] == 0.1


def test_junk_score_items_are_skipped_not_fatal():
    """Regression: the model emitted bare strings inside `scores` -> crash."""
    features = [_road("вулиця Київська")]
    llm = FakeLLM(
        [
            [
                "вулиця Київська",  # bare string instead of an object
                {"name": "вулиця Київська"},  # missing the value key
                {"name": "вулиця Київська", "condition": "поганий"},  # non-numeric
                {"name": "вулиця Київська", "condition": 0.4},  # finally valid
            ]
        ]
    )
    scored = score_features(
        llm, "road_condition", {"name": "Zhytomyr", "country": "Ukraine"}, features
    )
    assert scored == 1
    assert features[0]["properties"]["condition"] == 0.4


def test_duplicate_names_all_receive_score():
    """Two features sharing a name (split segments) both get the score."""
    features = [_road("вулиця Київська"), _road("вулиця Київська")]
    llm = FakeLLM([[{"name": "вулиця Київська", "condition": 0.6}]])
    scored = score_features(
        llm, "road_condition", {"name": "Zhytomyr", "country": "Ukraine"}, features
    )
    assert scored == 2
    assert all(f["properties"]["condition"] == 0.6 for f in features)
    # the duplicated name is sent to the LLM once
    assert llm.calls[0].count("вулиця Київська") == 1
