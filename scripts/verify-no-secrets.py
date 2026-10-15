#!/usr/bin/env python3
import os
import re
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IGNORE_DIRS = {'.git', 'node_modules', 'dist', 'dist-docs', 'coverage', '.codegraph', 'tmp', 'tmp-production', 'dist-umd'}
IGNORE_EXTS = {'.lock', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.tar', '.tgz', '.ico'}
IGNORE_FILES = {'verify-no-secrets.py'}

PATTERNS = [
    (re.compile(r'(?<![\w.-])10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?![\w.-])'), 'Internal IP (10.x.x.x)'),
    (re.compile(r'(?<![\w.-])172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(?![\w.-])'), 'Internal IP (172.16-31.x.x)'),
    (re.compile(r'192\.168\.\d+\.\d+'), 'Internal IP (192.168.x.x)'),
    (re.compile(r'(?:[a-zA-Z0-9_\-]+\.)*' + r'dm' + r'\.com'), 'Internal Domain'),
    (re.compile(r'NpmToken\.[a-zA-Z0-9_\-]+'), 'NPM Internal Token'),
]

errors = []

for root, dirs, files in os.walk(BASE_DIR):
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('tmp')]
    for f in files:
        if f in IGNORE_FILES or any(f.endswith(ext) for ext in IGNORE_EXTS):
            continue
        filepath = os.path.join(root, f)
        relpath = os.path.relpath(filepath, BASE_DIR)
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as fp:
                for idx, line in enumerate(fp, 1):
                    for pat, label in PATTERNS:
                        found = pat.findall(line)
                        if found:
                            for item in set(found):
                                errors.append((relpath, idx, label, item, line.strip()[:100]))
        except Exception as e:
            pass

if errors:
    print(f"\033[31m❌ Found {len(errors)} sensitive data match(es):\033[0m")
    for relpath, idx, label, item, snippet in errors:
        print(f"  {relpath}:{idx} [{label}]: {snippet}")
    sys.exit(1)
else:
    print("\033[32m✅ Security Gate Passed: 0 sensitive patterns detected!\033[0m")
    sys.exit(0)
