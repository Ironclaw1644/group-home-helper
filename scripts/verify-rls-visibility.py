#!/usr/bin/env python3
"""Prove that a change to RLS policies did not change who can see what.

Row-level security is the only thing standing between one agency's residents
and another's. It has already failed once here: `staff_homes_read` shipped
without an org predicate at all, so any admin anywhere could read every
staff-to-home assignment on the platform. That was found by reading the policy,
not by a test, which is why this exists.

The check is behavioural, not textual. For each table it counts the rows visible
to four different callers, under real RLS, and writes the counts to a file:

  * a DSP at a real agency        - the most restricted role
  * an admin at that same agency  - the most privileged role
  * an admin at a *different* agency - the cross-tenant case
  * a user id belonging to nobody - the stranger case, which must see zero

Run it before a policy migration, apply the migration, run it again, and diff.
Identical counts mean the rewrite moved no rows across a tenant boundary.

  python3 scripts/verify-rls-visibility.py before.json
  # ...apply migration...
  python3 scripts/verify-rls-visibility.py after.json
  python3 scripts/verify-rls-visibility.py --diff before.json after.json

A count is a weaker statement than a full row comparison, but it is the one that
matters: these policies partition by tenant, so any predicate that leaks or
over-restricts changes a count.
"""

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PGQUERY = os.path.join(HERE, "pgquery.py")

# Chosen to span the privilege range and the tenant boundary. Bare uuids, not
# secrets: these identify rows, they do not authenticate anything.
CALLERS = {
    "dsp@real-agency": "d860d1ac-8701-47de-bfee-ae75f520922f",
    "admin@real-agency": "8c3a1fb3-8819-4e6d-90be-e8018fa18c0d",
    "admin@other-agency": "bb598fa8-1fe9-412e-acc2-6b2291f7669e",
    "nobody": "00000000-0000-0000-0000-000000000000",
}

TABLES = [
    "ai_generations", "audit_log", "documents", "form_templates", "homes",
    "invitations", "note_activities", "note_addenda", "note_outcomes", "notes",
    "organizations", "outcome_activities", "profiles", "resident_outcomes",
    "residents", "shifts", "staff_homes",
]


def counts_for(user_id: str) -> dict:
    """Count rows visible to one caller, in a single round trip."""
    unions = "\nunion all\n".join(
        f"select '{t}' as tbl, count(*)::bigint as n from ghh.{t}" for t in TABLES
    )
    return counts_for_sql(user_id, unions)


def counts_for_sql(user_id: str, body: str) -> dict:
    """Run `body` as `user_id` with RLS on, returning {tbl: n}."""
    sql = (
        "set local role authenticated;\n"
        f"set local request.jwt.claims = '{{\"sub\":\"{user_id}\",\"role\":\"authenticated\"}}';\n"
        f"{body};\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as fh:
        fh.write(sql)
        sql_path = fh.name
    try:
        proc = subprocess.run(
            [sys.executable, PGQUERY, "--file", sql_path, "--full"],
            capture_output=True, text=True, cwd=os.path.dirname(HERE),
        )
    finally:
        os.unlink(sql_path)
    if proc.returncode != 0:
        raise SystemExit(f"query failed for {user_id}:\n{proc.stderr[:800]}")
    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise SystemExit(f"unparseable response for {user_id}:\n{proc.stdout[:800]}")
    return {r["tbl"]: r["n"] for r in rows}


def snapshot(path: str) -> None:
    result = {}
    for label, uid in CALLERS.items():
        print(f"  counting as {label} ...", flush=True)
        result[label] = counts_for(uid)
    with open(path, "w") as fh:
        json.dump(result, fh, indent=2, sort_keys=True)
    print(f"\nwrote {path}")
    for label in CALLERS:
        total = sum(result[label].values())
        print(f"  {label:20} {total:>7} rows visible across {len(TABLES)} tables")
    check_stranger_sees_no_tenant_data(result["nobody"])


def check_stranger_sees_no_tenant_data(stranger: dict) -> None:
    """A caller with no profile must reach nothing that belongs to a tenant.

    One table is deliberately not empty. `form_templates` holds the shipped
    state forms -- Virginia #680, Ohio 5123-9-30, and the generic fallback --
    as rows with a null org_id, readable by everyone. The sign-up page needs
    them before the visitor has an org, which is the whole point; they contain
    form layout, not resident data. So the rule is not "zero rows", it is "zero
    rows that belong to somebody", and that is what gets asserted.
    """
    leaks = {t: n for t, n in stranger.items() if n and t != "form_templates"}
    if leaks:
        raise SystemExit(
            f"\nFAIL: a user id belonging to no profile can read tenant rows: {leaks}\n"
            "Some policy is missing its tenant predicate."
        )

    owned = counts_for_sql(
        CALLERS["nobody"],
        "select 'owned_templates' as tbl, count(*)::bigint as n "
        "from ghh.form_templates where org_id is not null",
    )
    if owned.get("owned_templates"):
        raise SystemExit(
            f"\nFAIL: a stranger can read {owned['owned_templates']} form template(s) "
            "belonging to a specific agency. Only global (org_id is null) templates "
            "may be world-readable -- a customised template carries their letterhead "
            "and their wording."
        )
    print("  stranger check: sees only global form templates, no tenant rows")


def diff(before_path: str, after_path: str) -> None:
    before = json.load(open(before_path))
    after = json.load(open(after_path))
    problems = []
    for label in sorted(set(before) | set(after)):
        b, a = before.get(label, {}), after.get(label, {})
        for tbl in sorted(set(b) | set(a)):
            bv, av = b.get(tbl), a.get(tbl)
            if bv != av:
                direction = "MORE VISIBLE" if (av or 0) > (bv or 0) else "less visible"
                problems.append(f"  {label:20} {tbl:20} {bv} -> {av}   {direction}")
    if problems:
        print("FAIL: row visibility changed\n")
        print("\n".join(problems))
        print("\nA rewrite meant to be performance-only changed who can read what.")
        raise SystemExit(1)
    tables = len(next(iter(after.values())))
    print(f"OK: identical row visibility for {len(after)} callers across {tables} tables")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--diff":
        if len(args) != 3:
            raise SystemExit(__doc__)
        diff(args[1], args[2])
    elif len(args) == 1:
        snapshot(args[0])
    else:
        raise SystemExit(__doc__)
