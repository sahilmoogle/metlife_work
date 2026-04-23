from __future__ import annotations

import json
import os
import sqlite3


def main() -> None:
    db_path = os.path.join(os.path.dirname(__file__), "..", "metlife_agents.db")
    db_path = os.path.abspath(db_path)
    print("db_path:", db_path)
    print("db_exists:", os.path.exists(db_path))
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cur.fetchall()]
    print("tables_count:", len(tables))
    print("tables_sample:", tables[:25])

    if "leads" in tables:
        cur.execute("SELECT workflow_status, COUNT(*) FROM leads GROUP BY workflow_status")
        print("leads_by_status:", cur.fetchall())
        cur.execute(
            "SELECT COUNT(*) FROM leads WHERE workflow_status='Dormant' "
            "AND IFNULL(cooldown_flag,0)=0 AND IFNULL(is_converted,0)=0"
        )
        print("eligible_dormant:", cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM leads WHERE workflow_status='New'")
        print("new:", cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM leads WHERE IFNULL(opt_in,0)=1")
        print("opt_out_opt_in_true:", cur.fetchone()[0])

    if "batch_runs" in tables:
        cur.execute(
            "SELECT id,total,total_new,total_dormant,processed_count,success_count,failed_count,"
            "status,started_at,completed_at,failed_lead_ids,error_summary "
            "FROM batch_runs ORDER BY started_at DESC LIMIT 1"
        )
        row = cur.fetchone()
        print("latest_batch:", row[:10] if row else None)
        if row:
            failed_ids = json.loads(row[10] or "[]") if row[10] else []
            errors = json.loads(row[11] or "{}") if row[11] else {}
            print("failed_ids_len:", len(failed_ids))
            if errors:
                k = next(iter(errors.keys()))
                print("sample_error:", k, errors[k])

    con.close()


if __name__ == "__main__":
    main()

