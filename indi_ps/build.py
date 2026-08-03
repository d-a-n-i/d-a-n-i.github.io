# -*- coding: utf-8 -*-
"""
Injects the .jsx source into index.html.

sync_photoshop_text.jsx is the single source of truth. index.html carries a
copy of it inside a <script type="text/plain"> block so the page works with
no network calls and no fetch(), including straight off the filesystem.

Run after editing the script:

    python build.py
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

BLOCK_ID = "src-sync"
FILENAME = "sync_photoshop_text.jsx"


def read(path):
    with io.open(path, encoding="utf-8") as fh:
        return fh.read().replace("\r\n", "\n")


def main():
    html = read(os.path.join(HERE, "index.html"))
    src = read(os.path.join(HERE, FILENAME)).rstrip("\n")

    # A literal </script> inside the payload would close the block early.
    if "</script" in src.lower():
        sys.exit("%s contains </script> - cannot inline it verbatim." % FILENAME)

    pattern = re.compile(
        r'(<script type="text/plain" id="%s">)(.*?)(</script>)' % re.escape(BLOCK_ID),
        re.S,
    )
    if not pattern.search(html):
        sys.exit("Could not find the <script id=%s> block in index.html." % BLOCK_ID)

    html = pattern.sub(
        lambda m: m.group(1) + "\n" + src + "\n" + m.group(3),
        html,
        count=1,
    )
    print("inlined %-28s %5d bytes" % (FILENAME, len(src)))

    with io.open(os.path.join(HERE, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    print("index.html updated (%d bytes)" % len(html))


if __name__ == "__main__":
    main()
