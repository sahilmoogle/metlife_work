"""
Seed exactly two lightweight test leads.

Run (from repo root):

    python metlife_agents_backend/scripts/seed_two_leads.py

This script:
- Deletes any prior `@mock.metlife.co.jp` leads (and their dependent rows, if tables exist).
- Inserts exactly 2 new leads with realistic routing fields for quick agent testing.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


MOCK_EMAIL_DOMAIN = "@mock.metlife.co.jp"
DB_PATH = Path(__file__).resolve().parents[1] / "metlife_agents.db"


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)
    )
    return cur.fetchone() is not None


def _lead_table_columns(cur: sqlite3.Cursor) -> set[str]:
    cur.execute("PRAGMA table_info(leads)")
    return {row[1] for row in cur.fetchall()}  # row[1] = column name


def _delete_mock_leads(con: sqlite3.Connection) -> int:
    cur = con.cursor()
    if not _table_exists(cur, "leads"):
        raise RuntimeError(f"SQLite DB missing `leads` table at {DB_PATH}")

    cur.execute("SELECT id FROM leads WHERE email LIKE ?", (f"%{MOCK_EMAIL_DOMAIN}%",))
    lead_ids = [r[0] for r in cur.fetchall()]
    if not lead_ids:
        return 0

    # Best-effort cleanup across dependent tables (some may not exist in all envs).
    dependent_tables = [
        ("workflow_timers", "lead_id"),
        ("hitl_queue", "lead_id"),
        ("quotes", "lead_id"),
        ("consultation_requests", "lead_id"),
        ("email_events", "lead_id"),
        ("communications", "lead_id"),
    ]
    for table, fk in dependent_tables:
        if _table_exists(cur, table):
            cur.executemany(
                f"DELETE FROM {table} WHERE {fk} = ?",
                [(lid,) for lid in lead_ids],
            )

    cur.executemany("DELETE FROM leads WHERE id = ?", [(lid,) for lid in lead_ids])
    con.commit()
    return len(lead_ids)


def seed_two_leads() -> list[str]:
    now = datetime.now(timezone.utc)

    if not DB_PATH.is_file():
        raise RuntimeError(
            f"SQLite DB not found at {DB_PATH}. If you haven't created it yet, start the backend once or run migrations/seed."
        )

    con = sqlite3.connect(str(DB_PATH))
    try:
        con.row_factory = sqlite3.Row
        deleted = _delete_mock_leads(con)
        if deleted:
            print(f"Deleted {deleted} prior mock lead(s).")

        cur = con.cursor()
        cols = _lead_table_columns(cur)

        def iso(dt: datetime) -> str:
            return dt.astimezone(timezone.utc).replace(tzinfo=timezone.utc).isoformat()

        lead1_id = str(uuid.uuid4())
        lead2_id = str(uuid.uuid4())

        lead1 = {
            "id": lead1_id,
            "quote_id": f"MOCK-Q-{lead1_id.replace('-', '')[:8]}",
            "first_name": "Taro",
            "last_name": "Yamada",
            "email": f"taro.yamada{lead1_id.replace('-', '')[:6]}{MOCK_EMAIL_DOMAIN}",
            "phone": "090-0000-0001",
            "age": 29,
            "gender": "M",
            "date_of_birth": "1996-01-15",
            "ans3": "C",
            "ans4": "No",
            "ans5": "No",
            "device_type": "PC",
            "banner_code": "BANNER_TEST_001",
            "product_code": "TERM",
            "plan_code": "PLAN-A",
            "registration_source": "manual_seed_two",
            "opt_in": 0,
            "is_converted": 0,
            "cooldown_flag": 0,
            "workflow_status": "New",
            "engagement_score": 0.0,
            "base_score": 0.0,
            "emails_sent_count": 0,
            "max_emails": 5,
            "workflow_completed": 0,
            "commit_time": iso(now),
            "last_active_at": iso(now),
        }

        lead2 = {
            "id": lead2_id,
            "quote_id": f"MOCK-Q-{lead2_id.replace('-', '')[:8]}",
            "first_name": "Hanako",
            "last_name": "Suzuki",
            "email": f"hanako.suzuki{lead2_id.replace('-', '')[:6]}{MOCK_EMAIL_DOMAIN}",
            "phone": "090-0000-0002",
            "age": 46,
            "gender": "F",
            "date_of_birth": "1979-09-03",
            "ans3": "C",
            "ans4": "No",
            "ans5": "No",
            "device_type": "MOBILE",
            "banner_code": "BANNER_TEST_180D",
            "product_code": "WHOLE",
            "plan_code": "PLAN-D",
            "registration_source": "manual_seed_two",
            "opt_in": 0,
            "is_converted": 0,
            "cooldown_flag": 0,
            "workflow_status": "New",
            "engagement_score": 0.0,
            "base_score": 0.0,
            "emails_sent_count": 0,
            "max_emails": 2,
            "workflow_completed": 0,
            "commit_time": iso(now - timedelta(days=200)),
            "last_active_at": iso(now - timedelta(days=200)),
        }

        def insert_lead(lead: dict) -> None:
            payload = {k: v for k, v in lead.items() if k in cols}
            keys = list(payload.keys())
            placeholders = ", ".join(["?"] * len(keys))
            sql = f"INSERT INTO leads ({', '.join(keys)}) VALUES ({placeholders})"
            cur.execute(sql, [payload[k] for k in keys])

        insert_lead(lead1)
        insert_lead(lead2)
        con.commit()

        print("Seeded 2 leads:")
        print(f"- lead1_id={lead1_id} email={lead1['email']}")
        print(f"- lead2_id={lead2_id} email={lead2['email']}")

        return [lead1_id, lead2_id]
    finally:
        con.close()


def main() -> None:
    seed_two_leads()


if __name__ == "__main__":
    main()
