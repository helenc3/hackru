"""Validate the portable plan independently of application checks."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parent
registry = json.loads((root / "segment-registry.json").read_text())
segments = registry["segments"]
ids = {segment["id"] for segment in segments}
assert len(ids) == len(segments) == 16, "Expected sixteen unique segments"
assert ids == {f"Segment-{i:03}" for i in range(16)}, "Stable packet IDs must be retained"
assert registry["specVersion"] == "1.3"
assert registry["baselineSpecVersion"] == "1.2"
by_id = {segment["id"]: segment for segment in segments}
visited = set()
active = set()

def visit(segment_id):
    assert segment_id not in active, f"Dependency cycle at {segment_id}"
    if segment_id in visited:
        return
    active.add(segment_id)
    for dependency in by_id[segment_id]["dependencies"]:
        assert dependency in ids, f"Missing dependency {dependency}"
        visit(dependency)
    active.remove(segment_id)
    visited.add(segment_id)

for segment in segments:
    visit(segment["id"])
    packet = root / segment["packet"]
    assert packet.is_file(), f"Missing packet {packet}"
    text = packet.read_text()
    for section in (
        "Context available to a fresh account", "Mandatory reads", "Dependencies",
        "Writable scope", "Build steps", "Acceptance criteria", "Exclusions",
        "Deliver and merge",
    ):
        assert f"## {section}" in text, f"Missing {section} in {packet.name}"
    assert f"Build {segment['id']}" in text
    assert f"# {segment['id']}: {segment['title']}" in text
    expected_version = "1.2" if int(segment["id"].split("-")[1]) < 10 else "1.3"
    assert segment["specVersion"] == expected_version
    assert f"Spec version {expected_version}" in text
    assert "Mandarin Chinese" in text
    assert "required core functionality" in text
    assert segment["status"] == "planned", "Kit must not claim implementation"
    for dependency in segment["dependencies"]:
        assert f"]({dependency}.md)" in text, f"Packet dependency mismatch {packet}"

for document in root.rglob("*.md"):
    # Dependencies and generated test/build outputs are not part of this kit.
    if any(part in {"node_modules", ".git", "dist", "build", "test-results", "playwright-report"}
           for part in document.relative_to(root).parts):
        continue
    text = document.read_text()
    assert "CODEX_TASKS.md" not in text, f"Stale reference in {document}"
    for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", text):
        if "://" in target or target.startswith("#"):
            continue
        destination = (document.parent / target.split("#")[0]).resolve()
        assert destination.exists(), f"Broken relative link {document}: {target}"

core = [segment for segment in segments
        if not segment["optional"] and int(segment["id"].split("-")[1]) < 10]
assert not any("Segment-009" in segment["dependencies"] for segment in core)
assert set(by_id["Segment-007"]["dependencies"]) == {
    f"Segment-{i:03}" for i in range(7)
}
assert all(by_id[f"Segment-{i:03}"]["dependencies"] == ["Segment-000"]
           for i in range(1, 5))
assert by_id["Segment-010"]["dependencies"] == [
    "Segment-007", "Segment-008", "Segment-009"
]
lanes = [f"Segment-{i:03}" for i in range(11, 15)]
assert all(by_id[lane]["dependencies"] == ["Segment-010"] for lane in lanes)
assert by_id["Segment-015"]["dependencies"] == lanes
assert len({by_id[lane]["category"] for lane in lanes}) == 4
assert registry["parallelGroups"] == [{
    "id": "papercraft-overhaul", "prerequisite": "Segment-010",
    "members": lanes, "integration": "Segment-015"
}]
assert registry["overhaulBaselineAssumption"] == by_id["Segment-010"]["dependencies"]
spec = (root / "IMPLEMENTATION_SPEC.md").read_text()
voice_packet = (root / by_id["Segment-005"]["packet"]).read_text()
polish_packet = (root / by_id["Segment-009"]["packet"]).read_text()
assert "**Voice input and spoken NPC replies are core requirements.**" in spec
assert "developer validation harness" in voice_packet
assert "language_code=zh" in voice_packet
assert "Microphone" in voice_packet
assert "not first deliver voice input" in polish_packet
assert "replyEs" not in spec
assert "replyZh" in spec
assert "'audio' | 'text'" not in spec
for required_document in ("OVERHAUL_INTERFACES.md", "OVERHAUL_PLANNING_PROMPT.md"):
    assert (root / "docs" / required_document).is_file()
assert all(f"## {number}." in spec for number in range(17, 21))
print("PASS: 10 historical v1.2 and 6 planned v1.3 Mandarin packets, valid dependency graph, four independent overhaul lanes, core voice and Markdown links.")
