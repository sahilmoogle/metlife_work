"""
Analyse consolidated data: count unique dormant leads.
Deduplication: first seen email wins across all three sheets.
Dormant rule: (last Adobe activity OR commit_time) is >= 180 days ago.
Null dates -> NOT dormant (treat as fresh/unknown).
OPT_IN=True -> Suppressed (excluded from dormant count).
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2] / "consolidated data"
NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(days=180)


def to_utc(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    try:
        t = pd.Timestamp(v).to_pydatetime()
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t
    except Exception:
        return None


def bool_val(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return False
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "y", "t")


# ── Adobe: latest activity per lead key ──────────────────────
aa = pd.read_excel(ROOT / "AdobeAnalytics.xlsx")
adobe_latest: dict = {}
for _, r in aa.iterrows():
    raw = r.get("lead_id")
    lid = None if pd.isna(raw) else str(raw).strip()
    if not lid:
        continue
    ts = max(
        filter(
            None, [to_utc(r.get("LAST_EVENT_DATE")), to_utc(r.get("event_timestamp"))]
        ),
        default=None,
    )
    if ts and (lid not in adobe_latest or ts > adobe_latest[lid]):
        adobe_latest[lid] = ts


def get_activity(row):
    keys = []
    if pd.notna(row.get("id")):
        keys.append(str(row["id"]).strip())
    if pd.notna(row.get("QUOTE_NO")):
        keys.append(str(row["QUOTE_NO"]).strip())
    hits = [adobe_latest[k] for k in keys if k in adobe_latest]
    return max(hits) if hits else None


# ── Counters ────────────────────────────────────────────────
seen_emails: set = set()
total = dormant = suppressed = fresh = no_date = dups = 0


def classify(email, opt_in, last_active, commit_time):
    global total, dormant, suppressed, fresh, no_date, dups
    key = email.strip().lower() if email else ""
    if key and key in seen_emails:
        dups += 1
        return
    if key:
        seen_emails.add(key)
    total += 1

    if opt_in:
        suppressed += 1
        return

    la = last_active
    ct = commit_time

    if la is not None:
        stale = la <= CUTOFF
    elif ct is not None:
        stale = ct <= CUTOFF
    else:
        stale = False
        no_date += 1

    if stale:
        dormant += 1
    else:
        fresh += 1


# ── TYecQuoteMst ────────────────────────────────────────────
tyec = pd.read_excel(ROOT / "TYecQuoteMst.xlsx")
for _, r in tyec.iterrows():
    classify(
        email=str(r.get("MAIL_ID", "") or ""),
        opt_in=bool_val(r.get("OPT_IN")),
        last_active=get_activity(r),
        commit_time=to_utc(r.get("COMMIT_TIME")),
    )

# ── TConsultReq ─────────────────────────────────────────────
consult = pd.read_excel(ROOT / "TConsultReq.xlsx")
for _, r in consult.iterrows():
    classify(
        email=str(r.get("EMAIL_ADDRESS", "") or ""),
        opt_in=False,
        last_active=None,
        commit_time=None,
    )

# ── TSeminarConsultReq ───────────────────────────────────────
seminar = pd.read_excel(ROOT / "TSeminarConsultReq.xlsx")
for _, r in seminar.iterrows():
    classify(
        email=str(r.get("EMAIL", "") or ""),
        opt_in=False,
        last_active=None,
        commit_time=None,
    )

# ── Report ───────────────────────────────────────────────────
w = 36
print("=" * w)
print("  Consolidated data  -  Dormant analysis")
print("=" * w)
print(f"  Reference date  : {NOW.strftime('%Y-%m-%d')}")
print(f"  Dormancy cutoff : {CUTOFF.strftime('%Y-%m-%d')} (>= 180 days ago)")
print("-" * w)
print(f"  Duplicates removed (email) : {dups}")
print(f"  Unique leads analysed      : {total}")
print("-" * w)
print(f"  Suppressed (OPT_IN=True)   : {suppressed}")
print(f"  No usable date (-> fresh)  : {no_date}")
print(f"  NOT dormant / fresh        : {fresh}")
print()
print(f"  *** DORMANT (>= 180d)  :  {dormant} ***")
print("-" * w)
check = suppressed + dormant + fresh + no_date
print(
    f"  Check: {suppressed}+{dormant}+{fresh}+{no_date} = {check}  (should == {total})"
)
print("=" * w)
