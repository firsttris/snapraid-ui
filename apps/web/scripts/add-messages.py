#!/usr/bin/env python3
"""Add translations to all message files at once.

Usage: python3 scripts/add-messages.py '{"key": {"en": "...", "de": "...", "it": "..."}}'
       python3 scripts/add-messages.py --remove key1 key2
Existing keys are overwritten. A file lock lets several editors run it in parallel.
"""
import fcntl
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent / 'messages'
remove = sys.argv[1] == '--remove'
entries = sys.argv[2:] if remove else json.loads(sys.argv[1])
with open(root / '.lock', 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    for locale in ('en', 'de', 'it'):
        path = root / f'{locale}.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        if remove:
            for key in entries:
                data.pop(key, None)
        else:
            for key, texts in entries.items():
                if locale not in texts:
                    sys.exit(f'{key}: missing {locale}')
                data[key] = texts[locale]
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"{'removed' if remove else 'added'} {len(entries)} keys")
