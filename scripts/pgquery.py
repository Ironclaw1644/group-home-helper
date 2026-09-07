"""Run SQL against the production Supabase project via the Management API.

The access token is read from the Supabase CLI's own credential file and used
only as a request header — it is never printed, logged, or echoed.

  python3 scripts/pgquery.py --sql "select 1"
  python3 scripts/pgquery.py --file supabase/migrations/0021_x.sql
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

REF = "kflzqkuioiiyfrvlvcvl"
TOKEN_PATH = os.path.expanduser("~/.supabase/access-token")


def token() -> str:
    try:
        with open(TOKEN_PATH) as fh:
            return fh.read().strip()
    except OSError as exc:
        sys.exit(f"cannot read Supabase CLI credentials: {exc.strerror}")


def run(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            # The API edge rejects requests without a real User-Agent.
            "User-Agent": "flipbrief-admin/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        body = err.read().decode()[:400]
        sys.exit(f"HTTP {err.code}: {body}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql")
    ap.add_argument("--file")
    ap.add_argument(
        "--full",
        action="store_true",
        help="Print the whole result. The default truncates, which keeps a "
        "stray SELECT * from filling a terminal but produces invalid JSON — "
        "so anything parsing this output must pass --full.",
    )
    args = ap.parse_args()

    if args.file:
        with open(args.file) as fh:
            statement = fh.read()
    elif args.sql:
        statement = args.sql
    else:
        statement = sys.stdin.read()

    rendered = json.dumps(run(statement), indent=2)
    print(rendered if args.full else rendered[:4000])
