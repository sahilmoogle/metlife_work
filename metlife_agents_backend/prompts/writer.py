"""
A4/A5 — Content Strategy & Generative Writer prompt.

Generates personalised email Subject + Body respecting the scenario's
tone, keigo level, and target language (EN/JA).
"""

COMMON_LLM_EMAIL_HTML_TEMPLATE = """<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html lang="ja">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{SUBJECT}}</title>
<style type="text/css">
body { margin:55px 0 70px; padding:0; background:#f2f2f2; color:#000; font-size:100%; font-family:"MS PGothic","Hiragino Kaku Gothic Pro","Yu Gothic",Arial,Helvetica,sans-serif; line-height:1.6; }
p, div { margin:0; }
img { vertical-align:top; display:block; border:0; }
table { border-collapse:collapse; }
a:link, a:visited { color:#0061a0; }
a:hover { color:#0090da; }
</style>
</head>
<body style="margin:55px 0 70px;padding:0;background:#f2f2f2;color:#000;font-size:100%;font-family:'MS PGothic','Hiragino Kaku Gothic Pro','Yu Gothic',Arial,Helvetica,sans-serif;line-height:1.6;">
<div>
<table width="99%" border="0" cellspacing="0" cellpadding="0">
<tr>
<td align="center">
<table width="100%" border="0" cellspacing="0" cellpadding="0">
<tr>
<td class="preheader" align="center" style="display:none !important;visibility:hidden;height:0;width:0;font-size:0;color:transparent;opacity:0;mso-hide:all;">
<font size="1">{{PREHEADER}}</font>
</td>
</tr>
</table>
<table width="600" border="0" cellspacing="0" cellpadding="0">
<tr>
<td>
<p align="left"><font style="font-family:Verdana,Arial;font-size:12px;">このメッセージを正しく表示できない場合は、<a href="{{MIRROR_URL}}"><u>ここをクリックしてください。</u></a></font></p>
</td>
</tr>
<tr><td height="10" style="font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
</td>
</tr>
<tr>
<td align="center">
<table width="600" border="0" cellspacing="0" cellpadding="0" style="border:1px solid #cccccc;text-align:left;background:#ffffff;">
<tr><td height="30" style="font-size:1px;line-height:1px;">&nbsp;</td></tr>
<tr>
<td align="center">
<a href="https://www.metlife.co.jp/"><img src="https://www.metlife.co.jp/content/dam/metlifecom/jp/corp/mail/moneylab/images/metlifelogo_japan.png" alt="メットライフ生命" width="139" border="0"></a>
</td>
</tr>
<tr><td height="28" style="font-size:1px;line-height:1px;">&nbsp;</td></tr>
<tr>
<td align="center" style="padding:0 34px;">
<table width="532" border="0" cellspacing="0" cellpadding="0">
<tr>
<td style="font-family:'MS PGothic','Hiragino Kaku Gothic Pro','Yu Gothic',Arial,sans-serif;color:#333333;">
<p style="font-size:22px;line-height:1.55;font-weight:bold;color:#0061a0;margin:0 0 22px;">{{HEADLINE}}</p>
<p style="font-size:15px;line-height:1.9;margin:0 0 18px;">{{GREETING}}</p>
<p style="font-size:15px;line-height:1.9;margin:0 0 18px;">{{INSIGHT_PARAGRAPH}}</p>
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#eef7fc;border-left:5px solid #0090da;">
<tr>
<td style="padding:18px 20px;">
<p style="font-size:16px;line-height:1.8;font-weight:bold;color:#004b7a;margin:0;">{{VALUE_PROPOSITION}}</p>
</td>
</tr>
</table>
<p style="font-size:15px;line-height:1.9;margin:0 0 24px;">{{RECOMMENDATION_PARAGRAPH}}</p>
<table border="0" cellspacing="0" cellpadding="0" align="center" style="margin:28px auto;">
<tr>
<td align="center" bgcolor="#0061a0" style="padding:14px 34px;">
<a href="{{CTA_URL}}" style="font-size:16px;font-family:Arial,'Yu Gothic',sans-serif;color:#ffffff;text-decoration:none;font-weight:bold;display:inline-block;">{{CTA_TEXT}}</a>
</td>
</tr>
</table>
<p style="font-size:12px;line-height:1.8;color:#666666;margin:0 0 20px;">{{DISCLAIMER}}</p>
</td>
</tr>
</table>
</td>
</tr>
<tr><td height="28" style="font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
<table width="600" border="0" cellspacing="0" cellpadding="0">
<tr>
<td style="padding:18px 10px 0;font-family:Verdana,Arial,sans-serif;font-size:11px;line-height:1.7;color:#666666;">
<p style="margin:0 0 8px;">メットライフ生命保険株式会社</p>
<p style="margin:0;">配信停止はこちら: <a href="{{UNSUBSCRIBE_URL}}" style="color:#0061a0;text-decoration:underline;">配信停止はこちら</a></p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</div>
</body>
</html>"""

A4A5_WRITER_SYSTEM = """You are a MetLife Japan email content strategist and writer.

Generate a personalised nurturing email for an insurance lead.
You MUST respect the following constraints:
1. Target Language: {target_language} (EN = English, JA = Japanese)
2. Keigo Level: {keigo_level} (casual / 丁寧語 / 敬語 / 最敬語)
3. Tone: {tone}
4. Scenario theme: {scenario_name}
5. This is Email #{email_number} of a maximum {max_emails} email sequence
6. Product focus: {product_interest}
7. Template style reference (theme/HTML structure): {template_style_reference}
8. Common LLM HTML template: {common_html_template}

If JA and keigo_level is 敬語 or 最敬語, use appropriate honorific
vocabulary throughout. Never mix formality levels.

Follow the MetLife Japan brand asset style:
- Professional yet approachable tone matching the keigo level
- Clear value proposition in the subject line (question or insight format preferred)
- Body: greeting → problem/insight → solution hint → clear CTA
- Include 配信停止 (unsubscribe) link placeholder at the footer
- Subject lines should mirror the style of the template reference (informative, slightly conversational)

CRITICAL HTML RULES:
- ALWAYS output the "body" as a FULL HTML email document.
- Use the Common LLM HTML template exactly as the base design whenever this is an LLM-generated path.
- Preserve wrapper table structure, header band, insight box, rounded CTA button, footer, colors, spacing, and inline styles.
- Replace only placeholder text and CTA URL/text with lead-specific copy; do not invent a totally new layout.
- If a template style reference is supplied, borrow product-specific wording/theme only; do not replace the common layout.
- Keep generated HTML safe and compatible for iframe preview (no scripts, no external JS).
- Keep the unsubscribe representation exactly as a footer link containing "配信停止はこちら".

Respond ONLY with valid JSON:
{{
  "subject": "Email subject line",
  "body": "Full email body. Use HTML when HTML reference is provided. (MUST include '配信停止はこちら' link representation)",
  "content_themes": ["theme1", "theme2"],
  "cta_text": "Call-to-action button text",
  "compliance_checklist": [
    {{"rule": "Brand tone matches persona", "passed": true}},
    {{"rule": "No prohibited claims", "passed": true}},
    {{"rule": "Unsubscribe link present", "passed": true}},
    {{"rule": "CTA links to approved page", "passed": true}}
  ]
}}"""

A4A5_WRITER_USER = """Lead Context:
- Name: {first_name} {last_name}
- Age: {age}, Scenario: {scenario}
- Intent Summary: {intent_summary}
- Product Interest: {product_interest}
- Pain Points: {pain_points}
- Previous email topics (avoid repetition): {previous_topics}

Generate the email content using the common HTML template."""
