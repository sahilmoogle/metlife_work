"""
Seed Email Templates — loads all Phase 1 & Phase 2 pre-approved brand assets
into the ``email_templates`` table.

Template catalogue mirrors the email_template/ folder structure:

  Phase 1
  ├── ライフイベントきっかけ        → S2  (Life Event,    5 emails)
  ├── 年齢きっかけ×34歳以下         → S1  (Young Prof,   5 emails)
  ├── 年齢きっかけ×35歳以上         → S3  (Senior,       5 emails)
  ├── 情報きっかけ                  → S5  (Active Buyer, 5 emails)
  └── 共通シナリオ医療・死亡         → S1–S3 shared (6 emails: 3 medical + 3 death)

  Phase 2  (general campaign, 4 emails)          → scenario_id = "ALL"

Usage:
    python -m scripts.seed_email_templates
    # or: python metlife_agents_backend/scripts/seed_email_templates.py
"""

from __future__ import annotations

import asyncio
import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from model.database.v1.emails import EmailTemplate
from utils.v1.connections import SessionLocal


# ── HTML helpers ─────────────────────────────────────────────────────────────


def _html(subject: str, body_paragraphs: list[str], cta: str = "詳しく見る") -> str:
    """Minimal brand-safe HTML wrapper for a MetLife Japan email."""
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
    .header img {{ height: 32px; }}
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
# Maps template_name → English subject shown to operators when the UI is set to EN.
# The Japanese subject column is unchanged; it is what gets sent to the lead.

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

TEMPLATES: list[dict] = [
    # ── S2 · Life Event (ライフイベントきっかけ) ─────────────────────────────
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email1",
        "subject": "後回しにしていない？見直すべき家族のお金の貯め方・使い方",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _html(
            "後回しにしていない？見直すべき家族のお金の貯め方・使い方",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "ライフイベントを迎えたいま、家族のためのお金の管理を見直してみませんか？",
                "「いつかやろう」と後回しにしている方も多いのですが、早めに動くことで将来の選択肢が大きく広がります。",
                "まずは現在の家計を把握するところから。メットライフ生命のファイナンシャルプランナーが無料でサポートいたします。",
            ],
            cta="無料相談を予約する",
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email2",
        "subject": "保険はどうして必要？気になる基本のキをFPに聞いてみた",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _html(
            "保険はどうして必要？気になる基本のキをFPに聞いてみた",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "「保険って、本当に必要なの？」——そう思ったことはありませんか？",
                "ファイナンシャルプランナーが「保険の基本のキ」をわかりやすく解説します。",
                "万が一の備えと、将来のための資産形成を両立させる方法をご紹介します。",
            ],
            cta="FPに相談してみる",
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email3",
        "subject": "我が家の保険を見直すタイミングは？賢い保険の入り方",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _html(
            "我が家の保険を見直すタイミングは？賢い保険の入り方",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "結婚・出産・転職など、人生の転機は保険を見直す絶好のタイミングです。",
                "ライフステージが変わると、必要な保障も変わります。今のご家族の状況に合った保険を一緒に考えてみましょう。",
                "賢い保険の選び方を、専門家が丁寧にご説明いたします。",
            ],
            cta="保険を見直す",
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email4",
        "subject": "誰に相談する？我が家の保険選びの3つのポイント",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _html(
            "誰に相談する？我が家の保険選びの3つのポイント",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "保険を選ぶとき、誰に相談すればよいか迷いますよね。",
                "今回は「我が家にぴったりの保険を選ぶ3つのポイント」をお伝えします。",
                "①必要な保障額を知る、②ライフプランと合わせて考える、③専門家の意見を聞く。",
                "メットライフ生命の保険のプロが、あなたに寄り添ってサポートします。",
            ],
            cta="保険のプロに相談",
        ),
    },
    {
        "scenario_id": "S2",
        "persona_code": "E",
        "template_name": "S2_life_event_email5",
        "subject": "今の我が家にぴったりの保険は？ライフプランをもとに保険のプロに相談を",
        "version": 5,
        "keigo_level": "casual",
        "body_html": _html(
            "今の我が家にぴったりの保険は？ライフプランをもとに保険のプロに相談を",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "これまで保険についての基礎から見直しポイントまでお伝えしてきました。",
                "いよいよ最終回。「今のご家族に最適な保険」を見つけるために、ライフプランに基づいた専門家への無料相談をおすすめします。",
                "不安なことや疑問点はすべて解消して、安心できるプランを手に入れましょう。",
            ],
            cta="無料相談を予約する（最終回特典あり）",
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
        "body_html": _html(
            "20〜30代のお金事情。人生の選択肢を増やすために今できること",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "20〜30代は将来に向けた資産形成の黄金期。でも「何から始めればいいの？」という声もよく聞きます。",
                "実は、今から少し行動するだけで、10年後・20年後の人生の選択肢が大きく変わるんです。",
                "まずは自分のお金の現状を把握することから。メットライフ生命がわかりやすくサポートします。",
            ],
            cta="今すぐチェック",
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email2",
        "subject": "ずっと気になる保険のこと。まず何から始めたらいい？",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _html(
            "ずっと気になる保険のこと。まず何から始めたらいい？",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "「保険に入ったほうがいい気はするけど、何から手をつければ…」という方に。",
                "保険選びのファーストステップを3つに絞りました。①自分のリスクを知る、②必要な保障を絞る、③プロに相談する。",
                "シンプルに始めて、あとは専門家にお任せしましょう。",
            ],
            cta="保険の第一歩を踏み出す",
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email3",
        "subject": '若くても備えておきたい"急なお金のリスク"を考えよう',
        "version": 3,
        "keigo_level": "casual",
        "body_html": _html(
            '若くても備えておきたい"急なお金のリスク"を考えよう',
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "若いうちは病気や事故のリスクを実感しにくいもの。でも「まさか」が起きたとき、備えがあるとないとでは大違いです。",
                "急な出費に焦らないための「お金のリスク対策」を一緒に考えましょう。",
            ],
            cta="リスク対策を確認する",
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email4",
        "subject": "4人の事例から学ぶ！自分らしい保険の選び方を考えよう",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _html(
            "4人の事例から学ぶ！自分らしい保険の選び方を考えよう",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "同世代の4人がどのように保険を選んだか、リアルな事例をご紹介します。",
                "独身・共働き・子育て中・フリーランス——それぞれの状況で「正解」は違います。",
                "あなたに合ったスタイルを見つけるヒントにしてください。",
            ],
            cta="事例を読む",
        ),
    },
    {
        "scenario_id": "S1",
        "persona_code": "F-1",
        "template_name": "S1_young_prof_email5",
        "subject": 'あなただけの"納得できる選択"を。保険のプロに無料相談！',
        "version": 5,
        "keigo_level": "casual",
        "body_html": _html(
            'あなただけの"納得できる選択"を。保険のプロに無料相談！',
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "シリーズ最終回。ここまでお読みいただきありがとうございます。",
                "「自分に合った保険」を見つけるには、あなた自身の状況をプロに話すのが一番の近道です。",
                "無料相談では、納得できるまで何でも聞けます。まずはお気軽にどうぞ。",
            ],
            cta="無料相談を予約する",
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
        "body_html": _html(
            '未来の私にはいくら必要？目標額達成の鍵は"早めのスタート"！',
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "老後の生活に必要な資金はいくらでしょうか？公的年金だけでは不十分と感じている方も多いことでしょう。",
                "目標額を早めに設定し、計画的に備えることで、将来への安心感が大きく変わります。",
                "メットライフ生命のライフプランニングで、あなたの未来を一緒に描きましょう。",
            ],
            cta="ライフプランを考える",
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email2",
        "subject": "子育て中のお金の悩みって？プロに聞く資産形成術",
        "version": 2,
        "keigo_level": "丁寧語",
        "body_html": _html(
            "子育て中のお金の悩みって？プロに聞く資産形成術",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "教育費、住宅ローン、老後の備え——子育て中は何かとお金の心配が重なりますよね。",
                "ファイナンシャルプランナーが「子育て世代の資産形成術」をわかりやすく解説します。",
                "優先順位の付け方から、無理なく続けられる積立の方法まで、実践的なアドバイスをお届けします。",
            ],
            cta="資産形成を相談する",
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email3",
        "subject": "放っておくと後悔することも？保険を見直さないデメリットとは",
        "version": 3,
        "keigo_level": "丁寧語",
        "body_html": _html(
            "放っておくと後悔することも？保険を見直さないデメリットとは",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "「保険はとりあえず入っているからいいや」——そのままにしておくと、思わぬ落とし穴があるかもしれません。",
                "保険の見直しを先送りにすることで生じるリスクと、見直すことで得られるメリットをご紹介します。",
            ],
            cta="見直しポイントを確認",
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email4",
        "subject": "今見直さないと後悔する？人生のターニングポイントの保険見直し3ステップ",
        "version": 4,
        "keigo_level": "丁寧語",
        "body_html": _html(
            "今見直さないと後悔する？人生のターニングポイントの保険見直し3ステップ",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "人生のターニングポイント（就職・結婚・出産・マイホーム・子の独立）は保険見直しの絶好タイミングです。",
                "3ステップで簡単に見直せる方法をお伝えします。まずはお気軽にチェックしてみてください。",
            ],
            cta="3ステップで見直す",
        ),
    },
    {
        "scenario_id": "S3",
        "persona_code": "F-2",
        "template_name": "S3_senior_email5",
        "subject": "ライフステージが変わったら保険の見直しを！プロへの相談が安心です",
        "version": 5,
        "keigo_level": "丁寧語",
        "body_html": _html(
            "ライフステージが変わったら保険の見直しを！プロへの相談が安心です",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "シリーズ最終回をお届けします。",
                "ライフステージの変化に合わせた保険見直しは、将来の安心につながります。",
                "専門家に相談することで、不利益を避け、ご自身とご家族にとって最適なプランが見つかります。どうぞお気軽にご相談ください。",
            ],
            cta="専門家に相談する",
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
        "body_html": _html(
            "ミッツさんの資産形成哲学！失敗から得た教訓とは",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "投資家・ミッツさんが語る「資産形成で失敗から学んだこと」。実体験に基づいた生きたアドバイスをご紹介します。",
                "リスクと向き合いながら、長期的な視点で資産を育てる哲学とは？",
            ],
            cta="詳しく読む",
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email2",
        "subject": "短期投資への傾注はリスク大！「長期」「積立」「分散」の3原則",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _html(
            "短期投資への傾注はリスク大！「長期」「積立」「分散」の3原則",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "短期で大きなリターンを狙いたい気持ちはわかります。でも、長期的な資産形成には「長期・積立・分散」の3原則が鉄則です。",
                "なぜこの3つが大切なのか、わかりやすく解説します。",
            ],
            cta="3原則を学ぶ",
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email3",
        "subject": "資産形成が続けられなくなるリスク、考えたことがありますか？",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _html(
            "資産形成が続けられなくなるリスク、考えたことがありますか？",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "積立を途中でやめなければならない状況——病気、事故、失業——は誰にでも起こりえます。",
                "そのリスクに備えることが、長期的な資産形成を「守る」うえで欠かせません。",
            ],
            cta="リスクへの備えを知る",
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email4",
        "subject": "ライフイベントの実現を叶える！金融商品選択のコツ",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _html(
            "ライフイベントの実現を叶える！金融商品選択のコツ",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "マイホーム購入、お子様の教育、海外旅行——夢を実現するための資金をどう用意するか。",
                "目的別に適した金融商品の選び方のコツをご紹介します。",
            ],
            cta="金融商品を比較する",
        ),
    },
    {
        "scenario_id": "S5",
        "persona_code": None,
        "template_name": "S5_active_buyer_email5",
        "subject": "不測の事態でも資産形成を断念しないために！保険のプロに相談を",
        "version": 5,
        "keigo_level": "casual",
        "body_html": _html(
            "不測の事態でも資産形成を断念しないために！保険のプロに相談を",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "シリーズ最終回です。資産形成を長く続けるためには「守り」が重要です。",
                "万が一の際にも積立を続けられるよう、保険と資産形成を組み合わせた最適なプランをご提案します。",
                "保険のプロへの無料相談で、あなたの夢の実現をサポートします。",
            ],
            cta="無料相談を予約する",
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
        "body_html": _html(
            "データで見る「入院日数」あなたに合った備え方を考えよう",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "実際の統計データで見る平均入院日数はどのくらいでしょうか？世代別の傾向と、入院に備えるためのポイントを解説します。",
                "自分に合った医療保険の選び方を一緒に考えましょう。",
            ],
            cta="データを見る",
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
        "body_html": _html(
            "入院費用は1日どれくらい？あなたに合う備え方を一緒に考えませんか？",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "入院1日あたりの自己負担費用は、高額療養費制度を使っても意外とかかります。",
                "実際の費用感を知り、自分に合った医療保険を選ぶためのヒントをご紹介します。",
            ],
            cta="費用シミュレーションを見る",
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
        "body_html": _html(
            "もう迷わない！あなたに合った医療保険を選ぶための2つのポイント",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "医療保険を選ぶとき、「入院日額」と「特約の種類」が重要な判断ポイントです。",
                "この2つを押さえるだけで、自分に合ったプランが見つかりやすくなります。専門家に相談しながら、最適な選択をしましょう。",
            ],
            cta="医療保険を比較する",
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
        "body_html": _html(
            "我が家にぴったりの死亡保険をどう選ぶ？ライフステージに合わせて検討を",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "死亡保険は「いつ・いくら・誰のために」を明確にすることが選び方の第一歩です。",
                "ライフステージ別の選び方のポイントを解説します。",
            ],
            cta="死亡保険を検討する",
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
        "body_html": _html(
            "遺族年金はいくらもらえる？遺族の必要保障額算出のはじめの一歩",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "万が一のとき、遺族年金でいくる受け取れるかご存知ですか？",
                "遺族年金の仕組みを理解したうえで、必要な保障額を計算してみましょう。あなたのご家族に必要な備えがわかります。",
            ],
            cta="必要保障額を計算する",
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
        "body_html": _html(
            "3ステップで簡単！自分に合った死亡保険の選び方",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "死亡保険の選び方は、3ステップで整理できます。",
                "①必要保障額を計算する、②保険期間を決める、③保険料とのバランスを取る。",
                "シンプルに考えて、まず動いてみることが大切です。専門家が無料でサポートします。",
            ],
            cta="専門家に相談する",
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
        "body_html": _html(
            "あなたにぴったりの保険、一緒に探しませんか？",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "メットライフ生命です。日頃よりご愛顧いただきありがとうございます。",
                "今回は、あなたのライフスタイルに合った保険のご提案をさせてください。",
                "無料相談では、現在の状況を詳しくお聞きしたうえで、最適なプランをご提案します。",
            ],
            cta="無料相談に申し込む",
        ),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email2",
        "subject": "【メットライフ生命】保険の見直しを検討されていませんか？",
        "version": 2,
        "keigo_level": "casual",
        "body_html": _html(
            "保険の見直しを検討されていませんか？",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "ライフスタイルの変化とともに、最適な保険も変わっていきます。",
                "今の保険が本当に自分に合っているか、一度プロに確認してもらうことをおすすめします。",
            ],
            cta="今すぐ見直す",
        ),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email3",
        "subject": "【メットライフ生命】知っておきたい！保険活用の賢い方法",
        "version": 3,
        "keigo_level": "casual",
        "body_html": _html(
            "知っておきたい！保険活用の賢い方法",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "保険は「もしもの備え」だけではありません。賢く活用することで、資産形成や節税にも役立てることができます。",
                "「保険の賢い活用術」を専門家がわかりやすく解説します。",
            ],
            cta="賢い保険活用術を見る",
        ),
    },
    {
        "scenario_id": "ALL",
        "persona_code": None,
        "template_name": "phase2_general_email4",
        "subject": "【メットライフ生命】ご不明な点はありませんか？無料相談受付中",
        "version": 4,
        "keigo_level": "casual",
        "body_html": _html(
            "ご不明な点はありませんか？無料相談受付中",
            [
                "{{FIRST_NAME}}様、こんにちは。",
                "保険についてご不明な点や気になることがあれば、いつでもお気軽にご相談ください。",
                "メットライフ生命の専門家が、あなたの疑問に丁寧にお答えします。相談は何度でも無料です。",
            ],
            cta="無料相談を予約する",
        ),
    },
    # ── S4 Dormant Revival · P1 / P2 / P3 segment templates ──────────────────
    # product_code stores the revival segment (P1/P2/P3) so content_strategist
    # can look up the right asset for each dormant lead's behaviour profile.
    {
        "scenario_id": "S4",
        "product_code": "P1",
        "template_name": "s4_revival_p1_brand_campaign",
        "subject": "【メットライフ生命】お久しぶりです。保険の見直しはお済みですか？",
        "version": 1,
        "keigo_level": "casual",
        "body_html": _html(
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
        "body_html": _html(
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
        "body_html": _html(
            "専門家への無料相談のご案内",
            [
                "{{FIRST_NAME}}様、以前、メットライフ生命の保険についてご関心をお持ちいただきありがとうございました。",
                "お客様のご状況に合わせて、専門のライフプランナーが最適な保障プランをご提案します。",
                "相談は完全無料・完全無料です。お気軽にご予約ください。",
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
