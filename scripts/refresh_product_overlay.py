#!/usr/bin/env python3
"""Refresh product-only presentation on a previously validated pinned-engine artifact.

Used by the fast browser job; full release CI still builds from the original engine.
The embedded runtime and original script prefix are retained byte-for-byte.
"""
import argparse
from pathlib import Path
import re
from build_oneowner import overlay, TAG


def refresh(html):
    marker='\n/* oneowner-adapter: CSP compatible */\n'
    if html.count(TAG)!=1 or html.count(marker)!=1:
        raise ValueError('Expected one validated OneOwner overlay')
    start=html.index(marker)
    close=html.rfind('</script>')
    if close<start or not any(registration in html[:start] for registration in ('window.MPLPB=', 'globalThis.MPLPB=')):
        raise ValueError('Missing original engine script')
    original=html[:start]+html[close:]
    original,count=re.subn(re.escape(TAG)+r'\s*<style id="oneowner-style">[\s\S]*?</style>\s*','',original,count=1)
    if count!=1:
        raise ValueError('Missing product stylesheet')
    return overlay(original)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html',type=Path)
    args=parser.parse_args()
    args.html.write_text(refresh(args.html.read_text(encoding='utf-8')),encoding='utf-8')


if __name__=='__main__':main()
