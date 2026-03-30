"""Shared subject/topic taxonomy hook for future ecosystem merge."""

from __future__ import annotations

EXAM_TAXONOMY: dict[str, dict[str, dict[str, object]]] = {
    "JAMB": {
        "ENG": {"name": "Use of English", "is_core": True, "topics": ["Lexis and Structure"]},
        "MTH": {"name": "Mathematics", "is_core": False, "topics": ["Algebra"]},
        "PHY": {"name": "Physics", "is_core": False, "topics": ["Motion"]},
        "BIO": {"name": "Biology", "is_core": False, "topics": ["Ecology"]},
    },
    "WAEC": {
        "ENG": {"name": "English Language", "is_core": False, "topics": ["Comprehension"]},
        "MTH": {"name": "General Mathematics", "is_core": False, "topics": ["Number Base"]},
        "PHY": {"name": "Physics", "is_core": False, "topics": ["Energy"]},
    },
    "NECO": {
        "ENG": {"name": "English Language", "is_core": False, "topics": ["Grammar"]},
        "MTH": {"name": "General Mathematics", "is_core": False, "topics": ["Statistics"]},
        "BIO": {"name": "Biology", "is_core": False, "topics": ["Cell Biology"]},
    },
}
