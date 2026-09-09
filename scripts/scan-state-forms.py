#!/usr/bin/env python3
"""Re-read every cited state's own source document and list the forms it names.

    python3 scripts/scan-state-forms.py

WHY THIS EXISTS

The state research was a RULES sweep. Texas showed that is not the same as a
FORMS sweep: HHSC publishes Form 4119 for residential support and its own rules
say a provider "may" use it or anything else, so nothing in a rules-first search
had any reason to surface it. We found it because a competitor advertised it,
and until then the public page said West Virginia was the only state publishing
a form at all.

This is the cheap standing check against that failure. It refetches each cited
state's primary document -- the same URL the citation verifier uses -- and
reports every form-shaped identifier that appears within ~160 characters of
documentation language. It would have caught Texas: section 3850 of the HCS
Billing Requirements names 4119 by number, three lines from "service delivery
log".

It does not prove a negative. A state can publish a form its manual never
mentions, and that gap needs a forms-library sweep instead. What this catches is
the cheaper and more likely case: the state told us in a document we already
read, and nobody searched for it.

Run it when adding a state, or when a competitor claims a form we do not have.

Reading the output: most hits are false positives and that is fine. North
Carolina's whole records manual names exactly one form and it is a Drug
Education School Completion certificate; Iowa's "470" is a deemed-status
application. Judge each by the quoted context, not by the count.
"""

import json, re, subprocess, tempfile, os, urllib.request, urllib.error

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"
d = json.load(open('data/state-documentation-rules.json'))
cited = [s for s in d if s.get('source_url') and s.get('confidence') == 'primary-source-read']

FORM = re.compile(r'\b(?:Form|FORM)\s*#?\s*([A-Z]{0,4}-?\d{3,5}[A-Za-z]?)\b|\b([A-Z]{2,4}-[A-Z]{2,5}-[A-Z]*-?\d{1,3})\b')
NEAR = re.compile(r'(progress note|service log|daily note|service delivery log|documentation)', re.I)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read(9_000_000); ct = r.headers.get("Content-Type", "")
    if "pdf" in ct.lower() or url.lower().endswith(".pdf"):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            fh.write(raw); p = fh.name
        try:
            out = subprocess.run(["pdftotext", "-q", "-layout", p, "-"], capture_output=True, text=True)
            return out.stdout
        finally: os.unlink(p)
    if url.lower().endswith(".docx") or "wordprocessing" in ct.lower():
        import zipfile, io
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                xml = zf.read("word/document.xml").decode("utf-8", "replace")
            xml = re.sub(r"</w:(p|tab|br|tr)>", " ", xml)
            return re.sub(r"(?s)<[^>]+>", "", xml)
        except Exception: return ""
    body = raw.decode("utf-8", "replace")
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", body)
    return re.sub(r"(?s)<[^>]+>", " ", body)

print(f"scanning {len(cited)} cited states' own source documents for named forms\n")
for s in sorted(cited, key=lambda x: x['code']):
    code = s['code']
    try:
        txt = fetch(s['source_url'])
    except Exception as e:
        print(f"  {code}  (could not fetch: {type(e).__name__})"); continue
    if not txt.strip():
        print(f"  {code}  (no text extracted)"); continue
    hits = {}
    for m in FORM.finditer(txt):
        tok = m.group(1) or m.group(2)
        ctx = txt[max(0, m.start()-160): m.start()+160]
        if NEAR.search(ctx):
            hits.setdefault(tok, " ".join(ctx.split())[:150])
    if hits:
        print(f"  {code}  {len(hits)} form-ish reference(s) near documentation language:")
        for tok, ctx in list(hits.items())[:4]:
            print(f"       {tok:14} …{ctx}…")
    else:
        print(f"  {code}  none")
