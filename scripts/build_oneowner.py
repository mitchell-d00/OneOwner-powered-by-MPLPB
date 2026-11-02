#!/usr/bin/env python3
"""Build OneOwner from a verified, unchanged Combined MPLPB source checkout.

No independent reader, ledger, or supersession implementation is bundled.
The standalone input must already be built by Combined MPLPB's pinned WASM builder.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / 'upstream.lock.json').read_text(encoding='utf-8'))
TAG = '<!-- OneOwner product overlay: presentation only -->'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified_engine(root):
    root = Path(root).resolve()
    try:
        head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        diff = subprocess.check_output(['git', '-C', str(root), 'diff', '--name-only', 'HEAD'], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as error:
        raise ValueError('A git checkout of the pinned Combined MPLPB engine is required') from error
    if head != LOCK['commit']:
        raise ValueError('Combined MPLPB checkout is not the reviewed pinned commit: ' + head)
    if diff:
        raise ValueError('Combined MPLPB tracked files changed; refusing product build: ' + diff[:300])
    return root


def overlay(html):
    if TAG in html: raise ValueError('OneOwner overlay already present; refusing double injection')
    if html.count('</head>') != 1 or html.count('</body>') != 1:
        raise ValueError('Unexpected upstream HTML shape; review integration')
    css = (ROOT / 'oneowner/panel.css').read_text(encoding='utf-8')
    adapter = (ROOT / 'oneowner/adapter.js').read_text(encoding='utf-8')
    panel = (ROOT / 'oneowner/panel.js').read_text(encoding='utf-8')
    if any('</script' in x.lower() for x in (adapter, panel)) or '</style' in css.lower():
        raise ValueError('Overlay source contains an unsafe inline-tag terminator')
    output = html.replace('</head>', TAG + '\n<style id="oneowner-style">\n' + css + '\n</style>\n</head>')
    output = output.replace('</body>', '<script>\n/* oneowner-adapter: CSP compatible */\n' + adapter +
                            '\n</script>\n<script>\n/* oneowner-panel: CSP compatible */\n' + panel + '\n</script>\n</body>')
    output = output.replace('<title>MPLPB · The Local Ledger</title>',
                            '<title>OneOwner · Powered by Combined MPLPB</title>')
    return output


def write_overlay(source, destination):
    source, destination = Path(source), Path(destination)
    raw = source.read_bytes()
    if b'window.MPLPB' not in raw and b'MPLPB=' not in raw:
        # Keep engine registration intact; reject unrelated documents.
        raise ValueError('Input is not recognized as the Combined MPLPB interface')
    output = overlay(raw.decode('utf-8')).encode('utf-8')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    return {'input_sha256': sha(raw), 'output_sha256': sha(output), 'output_size': len(output)}


def tracked_files(engine):
    raw = subprocess.check_output(['git', '-C', str(engine), 'ls-files', '-z'])
    for name in raw.split(b'\0'):
        if not name: continue
        relative = Path(name.decode('utf-8'))
        source = engine / relative
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(engine):
            raise ValueError('Tracked path cannot be safely packaged: ' + str(relative))
        yield relative, source


def release_zip(engine, standalone, output):
    """Ship a single offline archive with standalone WASM and original Python/CLI files."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        base = Path(temp)
        (base / 'OneOwner.html').write_bytes(Path(standalone).read_bytes())
        # All tracked Combined MPLPB files preserve their bytes, except the
        # desktop HTML presentation copy. Original source stays unchanged.
        for relative, source in tracked_files(engine):
            dest = base / 'desktop' / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(source.read_bytes())
        write_overlay(engine / 'index.html', base / 'desktop/index.html')
        (base / 'README-FIRST.md').write_text(
            'OneOwner — Powered by Combined MPLPB\n\n'
            '1. Standalone: open OneOwner.html in a supported browser (no server).\n'
            '2. Local Python: cd desktop && python3 launch.py, then open the local URL.\n'
            '3. CLI: cd desktop && python3 -m mplpb_answers --help\n\n'
            'The owner rule, ledger, reader, and provenance gates come from Combined MPLPB.\n'
            'Offline use requires browser storage/WebAssembly support. No network lookup is enabled by OneOwner.\n'
            'Bundled example corpus includes synthetic starter pages in desktop/examples/.\n'
            'Research license and third-party attribution remain under desktop/LICENSE and desktop/resources/.\n',
            encoding='utf-8')
        manifest = {'schema': 1, 'upstream_repository': LOCK['repository'],
                    'upstream_commit': LOCK['commit'],
                    'standalone_sha256': sha((base / 'OneOwner.html').read_bytes()),
                    'files': {p.relative_to(base).as_posix(): sha(p.read_bytes())
                              for p in sorted(base.rglob('*')) if p.is_file()}}
        (base / 'ONEOWNER-MANIFEST.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(base.rglob('*')):
                if not path.is_file(): continue
                arcname=path.relative_to(base).as_posix()
                info=zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type=zipfile.ZIP_DEFLATED
                info.external_attr=0o644 << 16
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    with zipfile.ZipFile(output) as archive:
        bad=archive.testzip()
        if bad: raise ValueError('ZIP extraction CRC failed: '+bad)
        parsed=json.loads(archive.read('ONEOWNER-MANIFEST.json'))
        for file_name, expected in parsed['files'].items():
            if sha(archive.read(file_name)) != expected:
                raise ValueError('Archive source pin mismatch: '+file_name)
    return {'zip':str(output), 'sha256':sha(output.read_bytes()), 'files':len(parsed['files'])+1}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', type=Path, required=True, help='Git checkout at upstream.lock.json commit')
    parser.add_argument('--standalone', type=Path, required=True, help='Existing verified engine dist/MPLPB_Browser.html')
    parser.add_argument('--output', type=Path, default=ROOT/'dist/OneOwner.html')
    parser.add_argument('--zip', dest='archive', type=Path, help='Also make full offline archive with Python/CLI')
    args=parser.parse_args()
    engine=verified_engine(args.engine)
    standalone=Path(args.standalone).resolve()
    if not standalone.is_relative_to(engine):
        raise ValueError('Standalone input must be built in the verified engine checkout')
    metadata=write_overlay(standalone,args.output)
    metadata.update(upstream_commit=LOCK['commit'], destination=str(args.output))
    if args.archive: metadata['archive']=release_zip(engine,args.output,args.archive)
    print(json.dumps(metadata, indent=2))

if __name__=='__main__':main()
