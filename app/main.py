"""CLI entrypoint for bootstrapping the standalone CBT backend."""

from __future__ import annotations

import json
import sys
from dataclasses import asdict

from cbt_platform import CBTService, get_connection, init_db, seed_reference_data
from cbt_platform.api_v1 import run_server
from cbt_platform.contracts import CreateSessionInput


def bootstrap() -> None:
    connection = get_connection()
    init_db(connection)
    seed_reference_data(connection)
    connection.close()
    print("Database initialized and seeded.")


def demo_mock_session() -> None:
    connection = get_connection()
    init_db(connection)
    seed_reference_data(connection)
    service = CBTService(connection)
    questions = service.fetch_questions("JAMB", subject_codes=["ENG", "MTH", "PHY", "BIO"], limit=12)
    session_input = CreateSessionInput(
        user_id=1,
        exam_type="JAMB",
        mode="mock",
        subject_codes=["ENG", "MTH", "PHY", "BIO"],
        topic_ids=[],
        duration_seconds=2 * 60 * 60,
        explanation_mode="deferred",
        light_timer_enabled=False,
    )
    session_id = service.create_exam_session(session_input, [q.id for q in questions])
    for question in questions:
        service.save_answer(session_id, question.id, "A", False, 35)
    result = service.submit_session(session_id)
    leaderboard = service.leaderboard("JAMB", user_id=1)
    print(json.dumps({"session_result": asdict(result), "leaderboard": leaderboard}, default=str, indent=2))
    connection.close()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "bootstrap"
    if command == "bootstrap":
        bootstrap()
    elif command == "demo":
        demo_mock_session()
    elif command == "serve":
        run_server()
    else:
        raise SystemExit(f"Unknown command: {command}")