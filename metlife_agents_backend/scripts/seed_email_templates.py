"""
Seed Email Templates — loads all Phase 1 & Phase 2 pre-approved brand assets
into the ``email_templates`` table.

HTML bodies are parsed directly from the source files in email_template/:

  Phase 1
  ├── ライフイベントきっかけ        → S2  (Life Event,    5 emails)
  ├── 年齢きっかけ×34歳以下         → S1  (Young Prof,   5 emails)
  ├── 年齢きっかけ×35歳以上         → S3  (Senior,       5 emails)
  ├── 情報きっかけ                  → S5  (Active Buyer, 5 emails)
  └── 共通シナリオ医療・死亡         → S1–S3 shared (6 emails: 3 medical + 3 death)

  Phase 2  (general campaign, 4 emails)          → scenario_id = "ALL"

  S4  (dormant revival, 3 segments — no source files, uses inline HTML)

Usage:
    python -m scripts.seed_email_templates
    # or: python metlife_agents_backend/scripts/seed_email_templates.py
"""

from __future__ import annotations

import asyncio
import email as _email_lib
import sys
import os
import warnings
from pathlib import Path

# Allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.emails import EmailTemplate
from utils.v1.connections import SessionLocal

try:
    import extract_msg as _extract_msg

    _HAS_EXTRACT_MSG = True
except ImportError:  # pragma: no cover
    _HAS_EXTRACT_MSG = False
    warnings.warn(
        "extract-msg not installed — .msg files will fall back to placeholder HTML. "
        "Install with: pip install extract-msg",
        stacklevel=1,
    )


# ── Paths ─────────────────────────────────────────────────────────────────────

_SCRIPT_DIR = Path(__file__).parent                    # …/scripts/
_REPO_ROOT = _SCRIPT_DIR.parent.parent                 # …/metlife/
_TEMPLATE_DIR = _REPO_ROOT / "email_template"


# ── File loaders ──────────────────────────────────────────────────────────────


def _load_html_from_eml(path: Path) -> str:
    """Extract the HTML body from a MIME .eml file."""
    with open(path, "rb") as fh:
        msg = _email_lib.message_from_bytes(fh.read())

    # Prefer an explicit text/html part; fall back to text/plain (Adobe
    # Campaign sometimes encodes full HTML inside the plain-text part).
    for preferred in ("text/html", "text/plain"):
        for part in msg.walk():
            if part.get_content_type() == preferred:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")

    raise ValueError(f"No usable body found in {path}")


def _load_html_from_msg(path: Path) -> str:
    """Extract the HTML body from an Outlook .msg file."""
    if not _HAS_EXTRACT_MSG:
        raise RuntimeError(
            f"extract-msg is not installed; cannot load {path.name}. "
            "Run: pip install extract-msg"
        )
    msg = _extract_msg.Message(str(path))
    html = msg.htmlBody
    if html:
        return html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    body = msg.body
    if body:
        return f"<pre>{body}</pre>"
    raise ValueError(f"No HTML body found in {path}")


def _load_html(rel_path: str) -> str:
    """Load and return the HTML body from *rel_path* relative to email_template/."""
    path = _TEMPLATE_DIR / rel_path
    if not path.exists():
        raise FileNotFoundError(
            f"Email template file not found: {path}\n"
            "Make sure the email_template/ folder is present at the repo root."
        )
    suffix = path.suffix.lower()
    if suffix == ".eml":
        return _load_html_from_eml(path)
    if suffix == ".msg":
        return _load_html_from_msg(path)
    raise ValueError(f"Unsupported template file type: {suffix!r} ({path})")


def _fallback_html(subject: str, body_paragraphs: list[str], cta: str = "詳しく見る") -> str:
    """Minimal inline HTML — used only for S4 revival templates that have no source file."""
    paras = "".join(f"<p>{p}</p>\n" for p in body_paragraphs)
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{subject}</title>
  <style>
    body {{ font-family: 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
           color: #333; background: #f9f9f9; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 600px; margin: 0 auto; background: #fff;
               border-radius: 8px; overflow: hidden; }}
    .header {{ background: #003087; padding: 24px 32px; }}
    .header-text {{ color: #fff; font-size: 18px; font-weight: bold; margin-top: 8px; }}
    .body {{ padding: 32px; line-height: 1.8; }}
    .body p {{ margin: 0 0 16px; }}
    .cta-wrap {{ text-align: center; margin: 32px 0; }}
    .cta {{ display: inline-block; background: #003087; color: #fff;
            text-decoration: none; padding: 14px 36px; border-radius: 4px;
            font-size: 15px; font-weight: bold; }}
    .footer {{ padding: 16px 32px; font-size: 11px; color: #999;
               border-top: 1px solid #eee; }}
    .footer a {{ color: #999; }}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-text">MetLife Insurance K.K.</div>
  </div>
  <div class="body">
    {paras}
    <div class="cta-wrap">
      <a href="{{{{CTA_URL}}}}" class="cta">{cta}</a>
    </div>
  </div>
  <div class="footer">
    メットライフ生命保険株式会社<br />
    本メールは {{{{LEAD_EMAIL}}}} 宛にお送りしています。<br />
    <a href="{{{{UNSUBSCRIBE_URL}}}}">配信停止はこちら</a>
  </div>
</div>
</body>
</html>"""


# ── English subject labels (operator dashboard — EN mode) ────────────────────

_SUBJECT_EN: dict[str, str] = {
    # S2 · Life Event
    "S2_life_event_email1": "Are you putting it off? Review your family's money management [#1]",
    "S2_life_event_email2": "Why do you need insurance? The basics explained by a financial planner [#2]",
    "S2_life_event_email3": "When should you review your insurance? Smart ways to choose coverage [#3]",
    "S2_life_event_email4": "Who should you ask? 3 key points for choosing family insurance [#4]",
    "S2_life_event_email5": "What's the right insurance for your family today? Consult an expert [#5]",
    # S1 · Young Professional
    "S1_young_prof_email1": "Money matters in your 20s–30s: expand your options today [#1]",
    "S1_young_prof_email2": "Still wondering about insurance? Here's where to start [#2]",
    "S1_young_prof_email3": "Preparing for sudden financial risks — even when you're young [#3]",
    "S1_young_prof_email4": "Learn from 4 real case studies: finding your ideal insurance [#4]",
    "S1_young_prof_email5": "Your perfect choice awaits — free consultation with an expert [#5]",
    # S3 · Senior
    "S3_senior_email1": "How much will you need in the future? Start early to reach your goal [#1]",
    "S3_senior_email2": "Money worries while raising kids? Ask a pro about asset building [#2]",
    "S3_senior_email3": "Risks of not reviewing your insurance — don't miss out [#3]",
    "S3_senior_email4": "3 steps to review insurance at life's turning points [#4]",
    "S3_senior_email5": "Life stage changed? Review your insurance — an expert can help [#5]",
    # S5 · Active Buyer
    "S5_active_buyer_email1": "Mitts' asset-building philosophy: lessons learned from failure [#1]",
    "S5_active_buyer_email2": "Short-term investing is risky! The 3 principles: long-term, regular, diversified [#2]",
    "S5_active_buyer_email3": "Have you considered the risk of being forced to stop your savings plan? [#3]",
    "S5_active_buyer_email4": "Tips for choosing financial products to achieve your life goals [#4]",
    "S5_active_buyer_email5": "Don't abandon your savings plan in an emergency — consult an expert [#5]",
    # Shared Medical
    "SHARED_medical_email1": "How many days do people stay in hospital? Data-driven insights [Medical #1]",
    "SHARED_medical_email2": "What does a day in hospital really cost? Finding the right coverage [Medical #2]",
    "SHARED_medical_email3": "No more confusion — 2 key points for choosing medical insurance [Medical #3]",
    # Shared Death / Life Insurance
    "SHARED_death_email1": "How to choose life insurance for your family: match it to your life stage [Life #1]",
    "SHARED_death_email2": "How much survivor's pension will you receive? Calculate your coverage needs [Life #2]",
    "SHARED_death_email3": "3 simple steps to choose the right life insurance [Life #3]",
    # Phase 2 General
    "phase2_general_email1": "Let's find the perfect insurance plan for you [Phase 2 · #1]",
    "phase2_general_email2": "Are you considering reviewing your insurance? [Phase 2 · #2]",
    "phase2_general_email3": "Smart tips for making the most of your insurance [Phase 2 · #3]",
    "phase2_general_email4": "Any questions? Free consultation available now [Phase 2 · #4]",
    # S4 Dormant Revival segments
    "s4_revival_p1_brand_campaign": "We haven't heard from you — time to review your insurance [S4 Revival · P1]",
    "s4_revival_p2_product_sim_invite": "New products + free simulation: find your ideal plan in 5 min [S4 Revival · P2]",
    "s4_revival_p3_consultation_campaign": "Free consultation with an insurance specialist — just for you [S4 Revival · P3]",
}


# ── Template catalogue ────────────────────────────────────────────────────────
# body_html is loaded directly from the source .msg / .eml file for all
# Phase 1 & Phase 2 templates.  S4 revival templates have no source files and
# use _fallback_html() instead.

TEMPLATES: list[dict] = [
    # ── S2 · Life Event (ライフイベントきっかけ) ─────────────────────────────
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email1",
        "subject": "後回しにしていない？見直すべき家族のお金の貯め方・使い方",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/ライフイベントきっかけ"
            "/_EXT_ _MARKETING_ 後回しにしていない？見直すべき家族のお金の貯め方・使い方【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email2",
        "subject": "保険はどうして必要？気になる基本のキをFPに聞いてみた",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/ライフイベントきっかけ"
            "/_EXT_ _MARKETING_ 保険はどうして必要？気になる基本のキをFPに聞いてみた【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email3",
        "subject": "我が家の保険を見直すタイミングは？賢い保険の入り方",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/ライフイベントきっかけ"
            "/_EXT_ _MARKETING_ 我が家の保険を見直すタイミングは？賢い保険の入り方【第3回】.msg"
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email4",
        "subject": "誰に相談する？我が家の保険選びの3つのポイント",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/ライフイベントきっかけ"
            "/_EXT_ _MARKETING_ 誰に相談する？我が家の保険選びの3つのポイント【第4回】.msg"
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email5",
        "subject": "今の我が家にぴったりの保険は？ライフプランをもとに保険のプロに相談を",
        "version": 5,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/ライフイベントきっかけ"
            "/_EXT_ _MARKETING_ 今の我が家にぴったりの保険は？ライフプランをもとに保険のプロに相談を【第5回】.msg"
        ),
    },
    # ── S1 · Young Professional (年齢きっかけ×34歳以下) ──────────────────────
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email1",
        "subject": "20〜30代のお金事情。人生の選択肢を増やすために今できること",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×34歳以下"
            "/_EXT_ _MARKETING_ 20〜30代のお金事情。人生の選択肢を増やすために今できること【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email2",
        "subject": "ずっと気になる保険のこと。まず何から始めたらいい？",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×34歳以下"
            "/_EXT_ _MARKETING_ ずっと気になる保険のこと。まず何から始めたらいい？【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email3",
        "subject": '若くても備えておきたい"急なお金のリスク"を考えよう',
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×34歳以下"
            "/_EXT_ _MARKETING_ 若くても備えておきたい\u201c急なお金のリスク\u201dを考えよう【第3回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email4",
        "subject": "4人の事例から学ぶ！自分らしい保険の選び方を考えよう",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×34歳以下"
            "/_EXT_ _MARKETING_ 4人の事例から学ぶ！自分らしい保険の選び方を考えよう【第4回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email5",
        "subject": 'あなただけの"納得できる選択"を。保険のプロに無料相談！',
        "version": 5,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×34歳以下"
            "/_EXT_ _MARKETING_ あなただけの\u201c納得できる選択\u201dを。保険のプロに無料相談！【第5回】.msg"
        ),
    },
    # ── S3 · Senior (年齢きっかけ×35歳以上) ─────────────────────────────────
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email1",
        "subject": '未来の私にはいくら必要？目標額達成の鍵は"早めのスタート"！',
        "version": 1,
        "keigo_level": "丁寧語",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×35歳以上"
            "/_EXT_ _MARKETING_ 未来の私にはいくら必要？  目標額達成の鍵は\u201d早めのスタート\u201d！【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email2",
        "subject": "子育て中のお金の悩みって？プロに聞く資産形成術",
        "version": 2,
        "keigo_level": "丁寧語",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×35歳以上"
            "/_EXT_ _MARKETING_ 子育て中のお金の悩みって？ プロに聞く資産形成術【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email3",
        "subject": "放っておくと後悔することも？保険を見直さないデメリットとは",
        "version": 3,
        "keigo_level": "丁寧語",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×35歳以上"
            "/_EXT_ _MARKETING_ 放っておくと後悔することも？保険を見直さないデメリットとは【第3回】.msg"
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email4",
        "subject": "今見直さないと後悔する？人生のターニングポイントの保険見直し3ステップ",
        "version": 4,
        "keigo_level": "丁寧語",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×35歳以上"
            "/_EXT_ _MARKETING_ 今見直さないと後悔する？人生のターニングポイントの保険見直し3ステップ【第4回】.msg"
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email5",
        "subject": "ライフステージが変わったら保険の見直しを！プロへの相談が安心です",
        "version": 5,
        "keigo_level": "丁寧語",
        "body_html": _load_html(
            "Phase1/年齢きっかけ×35歳以上"
            "/_EXT_ _MARKETING_ ライフステージが変わったら保険の見直しを！不利益が生じるケースもあるからこそ、プロへの相談が安心です【第5回】.msg"
        ),
    },
    # ── S5 · Active Buyer (情報きっかけ) ─────────────────────────────────────
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email1",
        "subject": "ミッツさんの資産形成哲学！失敗から得た教訓とは",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/情報きっかけ"
            "/_EXT_ _MARKETING_ ミッツさんの資産形成哲学！ 失敗から得た教訓とは【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email2",
        "subject": "短期投資への傾注はリスク大！「長期」「積立」「分散」の3原則",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/情報きっかけ"
            "/_EXT_ _MARKETING_ 短期投資への傾注はリスク大！改めて立ち返る「長期」「積立」「分散」 の3原則【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email3",
        "subject": "資産形成が続けられなくなるリスク、考えたことがありますか？",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/情報きっかけ"
            "/_EXT_ _MARKETING_ 資産形成が続けられなくなるリスク、考えたことがありますか？【第3回】.msg"
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email4",
        "subject": "ライフイベントの実現を叶える！金融商品選択のコツ",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/情報きっかけ"
            "/_EXT_ _MARKETING_ ライフイベントの実現を叶える！金融商品選択のコツ【第4回】.msg"
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email5",
        "subject": "不測の事態でも資産形成を断念しないために！保険のプロに相談を",
        "version": 5,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/情報きっかけ"
            "/_EXT_ _MARKETING_ 不測の事態が起きても資産形成を断念しないために！ 保険のプロに商品選択を相談しませんか？【第5回】.msg"
        ),
    },
    # ── S1–S3 Shared · Medical (共通シナリオ 医療) ───────────────────────────
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "MEDICAL",
        "template_name": "SHARED_medical_email1",
        "subject": "データで見る「入院日数」あなたに合った備え方を考えよう",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[医療Step1] データで見る「入院日数」あなたに合った備え方を考えよう【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "MEDICAL",
        "template_name": "SHARED_medical_email2",
        "subject": "入院費用は1日どれくらい？あなたに合う備え方を一緒に考えませんか？",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[医療Step2]入院費用は1日どれくらい？ あなたに合う備え方を一緒に考えませんか？【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "MEDICAL",
        "template_name": "SHARED_medical_email3",
        "subject": "もう迷わない！あなたに合った医療保険を選ぶための2つのポイント",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[医療Step3]もう迷わない！あなたに合った医療保険を選ぶための2つのポイント【第3回】.msg"
        ),
    },
    # ── S1–S3 Shared · Death (共通シナリオ 死亡) ─────────────────────────────
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "LIFE",
        "template_name": "SHARED_death_email1",
        "subject": "我が家にぴったりの死亡保険をどう選ぶ？ライフステージに合わせて検討を",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[死亡Step1]我が家にぴったりの死亡保険をどう選ぶ？ライフステージに合わせて検討を【第1回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "LIFE",
        "template_name": "SHARED_death_email2",
        "subject": "遺族年金はいくらもらえる？遺族の必要保障額算出のはじめの一歩",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[死亡Step2]遺族年金はいくらもらえる？遺族の必要保障額算出のはじめの一歩【第2回】.msg"
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": None,
        "product_code": "LIFE",
        "template_name": "SHARED_death_email3",
        "subject": "3ステップで簡単！自分に合った死亡保険の選び方",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html(
            "Phase1/共通シナリオ医療・死亡"
            "/[死亡Step3]3ステップで簡単！自分に合った死亡保険の選び方【第3回】.msg"
        ),
    },
    # ── Phase 2 · General Campaign ────────────────────────────────────────────
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email1",
        "subject": "【メットライフ生命】あなたにぴったりの保険、一緒に探しませんか？",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _load_html("Phase2/20251016_第1配信.eml"),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email2",
        "subject": "【メットライフ生命】保険の見直しを検討されていませんか？",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _load_html("Phase2/20251016_第2配信.eml"),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email3",
        "subject": "【メットライフ生命】知っておきたい！保険活用の賢い方法",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _load_html("Phase2/20251016_第3配信.eml"),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email4",
        "subject": "【メットライフ生命】ご不明な点はありませんか？無料相談受付中",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _load_html("Phase2/20251016_第4配信.eml"),
    },
    # ── S4 Dormant Revival · P1 / P2 / P3 segment templates ──────────────────
    # No source files exist for these; inline HTML is used as the approved asset.
    {
        "scenario_id": "S4",
        "product_code": "P1",
        "template_name": "s4_revival_p1_brand_campaign",
        "subject": "【メットライフ生命】お久しぶりです。保険の見直しはお済みですか？",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _fallback_html(
            "お久しぶりです。保険の見直しはお済みですか？",
            [
                "{{FIRST_NAME}}様、ご無沙汰しております。メットライフ生命です。",
                "以前ご登録いただきましたが、その後いかがお過ごしでしょうか。",
                "人生のステージが変わると、必要な保険も変わります。改めて、あなたに合った保障をご一緒に考えてみませんか。",
                "まずは情報収集だけでも構いません。専門家への無料相談をご利用ください。",
            ],
            cta="無料相談を申し込む",
        ),
    },
    {
        "scenario_id": "S4",
        "product_code": "P2",
        "template_name": "s4_revival_p2_product_sim_invite",
        "subject": "【メットライフ生命】新商品のご案内 ＋ 無料シミュレーション",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _fallback_html(
            "新商品のご案内 ＋ 無料シミュレーション",
            [
                "{{FIRST_NAME}}様、メットライフ生命からの最新情報をお届けします。",
                "お客様のライフステージに合わせた新しい保険プランをご用意しました。",
                "無料のシミュレーションツールを使えば、月々の保険料と保障内容を5分で確認できます。",
                "あなたの家族を守るための最適なプランを、今すぐシミュレーションで確かめてみてください。",
            ],
            cta="無料シミュレーションを試す",
        ),
    },
    {
        "scenario_id": "S4",
        "product_code": "P3",
        "template_name": "s4_revival_p3_consultation_campaign",
        "subject": "【メットライフ生命】専門家への無料相談のご案内",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _fallback_html(
            "専門家への無料相談のご案内",
            [
                "{{FIRST_NAME}}様、以前、メットライフ生命の保険についてご関心をお持ちいただきありがとうございました。",
                "お客様のご状況に合わせて、専門のライフプランナーが最適な保障プランをご提案します。",
                "相談は完全無料です。お気軽にご予約ください。",
                "今なら最短翌日にオンライン・対面のどちらでもご相談いただけます。",
            ],
            cta="今すぐ相談を予約する",
        ),
    },
]


# ── Seed runner ───────────────────────────────────────────────────────────────


async def seed(session: AsyncSession) -> None:
    inserted = 0
    skipped = 0

    for tmpl in TEMPLATES:
        existing = await session.execute(
            select(EmailTemplate).where(
                EmailTemplate.template_name == tmpl["template_name"]
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        row = EmailTemplate(
            scenario_id=tmpl["scenario_id"],
            persona_code=tmpl.get("persona_code"),
            product_code=tmpl.get("product_code"),
            template_name=tmpl["template_name"],
            subject=tmpl["subject"],
            subject_en=_SUBJECT_EN.get(tmpl["template_name"]),
            body_html=tmpl["body_html"],
            keigo_level=tmpl.get("keigo_level"),
            language="JA",
            version=tmpl.get("version", 1),
            is_active=True,
        )
        session.add(row)
        inserted += 1

    await session.commit()
    print(f"Email templates seeded: {inserted} inserted, {skipped} skipped.")


async def main() -> None:
    async with SessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
