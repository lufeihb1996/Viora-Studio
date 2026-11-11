"""Set the local generation gateway without exposing it through the web interface."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent.parent
path = root / 'outputs' / 'settings.json'
value = input('Generation server URL: ').strip().rstrip('/')
parsed = urlsplit(value)
if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
    raise SystemExit('Enter an http(s) URL without credentials, query parameters, or fragments.')
path.parent.mkdir(parents=True, exist_ok=True)
data = {}
if path.exists():
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            raise ValueError('Invalid configuration format')
    except (ValueError, OSError) as exc:
        raise SystemExit('Existing configuration could not be read; no changes made.') from exc
data['comfy_url'] = value
temporary = path.with_suffix('.json.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
os.replace(temporary, path)
print('Saved local server configuration.')
if os.getenv('MOSS_GATEWAY_URL'):
    print('MOSS_GATEWAY_URL is set and takes precedence over this file.')
