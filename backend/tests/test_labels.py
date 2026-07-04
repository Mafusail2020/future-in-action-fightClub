"""Label registry: sequencing, dedup, per-run isolation. No network."""

from app.agent import labels


def test_labels_sequence_and_payload_stamp():
    labels.begin_run()
    items = labels.label_items([{"id": "a"}, {"id": "b"}])
    assert [i["label"] for i in items] == ["S1", "S2"]

    more = labels.label_items([{"id": "c"}])
    assert more[0]["label"] == "S3"

    registry = labels.labeled()
    assert set(registry) == {1, 2, 3}
    assert registry[2]["id"] == "b"


def test_labels_dedupe_by_id():
    labels.begin_run()
    labels.label_items([{"id": "x", "content": "first"}])
    again = labels.label_items([{"id": "x", "content": "second"}, {"id": "y"}])
    assert again[0]["label"] == "S1"  # same id -> same label
    assert again[1]["label"] == "S2"
    assert labels.labeled()[1]["content"] == "first"  # first registration wins


def test_begin_run_resets():
    labels.begin_run()
    labels.label_items([{"id": "a"}])
    labels.begin_run()
    assert labels.labeled() == {}
    assert labels.label_items([{"id": "b"}])[0]["label"] == "S1"
