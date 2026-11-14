import json
import ssl
import sys
import urllib.request

url, field, *credential = sys.argv[1:]
path = credential[0] if credential else "/run/secrets/client"
context = ssl.create_default_context(cafile="/run/secrets/ca.crt")
context.load_cert_chain(path + ".crt", path + ".key")
with urllib.request.urlopen(url, context=context, timeout=4) as response:
    sys.exit(0 if json.load(response).get(field) is True else 1)
