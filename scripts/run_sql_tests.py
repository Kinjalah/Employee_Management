#!/usr/bin/env python3
import sys
import subprocess
import os

try:
    import psycopg2
except Exception:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"]) 
    import psycopg2

from psycopg2 import sql

if len(sys.argv) < 7:
    print("Usage: run_sql_tests.py <host> <port> <dbname> <user> <password> <sqlfile1> [<sqlfile2> ...]")
    sys.exit(2)

host, port, dbname, user, password = sys.argv[1:6]
files = sys.argv[6:]

conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
conn.autocommit = True
cur = conn.cursor()

for f in files:
    print(f"--- Executing {f} ---")
    with open(f, 'r', encoding='utf-8') as fh:
        sqltext = fh.read()
    try:
        cur.execute(sqltext)
        print(f"{f}: SUCCESS")
    except Exception as e:
        print(f"{f}: ERROR:\n", e)
        # continue to next file

cur.close()
conn.close()
