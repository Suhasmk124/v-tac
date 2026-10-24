"""Download the public VCT Reference snapshot, preserving a local SHA-256 fingerprint."""
import argparse
import hashlib
import os
import urllib.request
from pathlib import Path
import duckdb

URL = 'https://vct-reference.com/dataset/vct.duckdb'


def fetch(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix('.part')
    try:
        request = urllib.request.Request(URL, headers={'User-Agent': 'V-Tac academic dataset importer'})
        size = 0
        with urllib.request.urlopen(request, timeout=45) as response, partial.open('wb') as target:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 100 * 1024 * 1024:
                    raise ValueError('Snapshot exceeds 100 MiB; inspect source changes before continuing')
                target.write(chunk)
        with duckdb.connect(str(partial), read_only=True) as db:
            db.execute('SELECT match_id FROM matches LIMIT 1')
        os.replace(partial, output)
    finally:
        partial.unlink(missing_ok=True)
    print(f'{output}: {size} bytes; SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('.tools/datasets/vct.duckdb'))
    fetch(parser.parse_args().output)
