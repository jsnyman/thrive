#!/usr/bin/env python3
"""
Import materials from a semicolon-delimited CSV file into the application.

CSV format (header required):
    NAME;POINTSPERKG

Usage:
    export DOMAIN=https://your-domain.com
    export TOKEN=<bearer-token>
    python3 import_materials.py [path/to/materials.csv]

If no CSV path is given, defaults to 20260316-materials.csv in the same directory.

To obtain a token:
    curl -s -X POST $DOMAIN/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"admin","passcode":"..."}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error

DOMAIN = os.environ.get("DOMAIN", "").rstrip("/")
TOKEN = os.environ.get("TOKEN", "")

if len(sys.argv) > 1:
    CSV_FILE = sys.argv[1]
else:
    CSV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "20260316-materials.csv")

if not DOMAIN:
    print("Error: DOMAIN environment variable is required.")
    print("  export DOMAIN=https://your-domain.com")
    sys.exit(1)

if not TOKEN:
    print("Error: TOKEN environment variable is required.")
    print(f"  curl -s -X POST {DOMAIN}/api/auth/login \\")
    print(f'    -H "Content-Type: application/json" \\')
    print(f'    -d \'{{\"username\":\"admin\",\"passcode\":\"...\"}}\' \\')
    print(f'  | python3 -c "import sys,json; print(json.load(sys.stdin)[\'token\'])"')
    sys.exit(1)

success = 0
failed = 0

with open(CSV_FILE, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter=";")
    for row in reader:
        name = row["NAME"].strip()
        points_per_kg = float(row["POINTSPERKG"].strip())

        payload = json.dumps({
            "name": name,
            "pointsPerKg": points_per_kg,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{DOMAIN}/api/materials",
            data=payload,
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                print(f"OK    {name} ({points_per_kg} pts/kg)")
                success += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            print(f"FAIL  [{e.code}] {name} — {body}")
            failed += 1

print(f"\nDone: {success} created, {failed} failed.")
