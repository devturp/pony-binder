#!/usr/bin/env python3
"""Refresh catalog image URLs from Kayou's official series pages.

Only image URLs change. Card IDs, metadata and share-link positions stay intact.
"""
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SERIES = {
    'BP01': 'https://www.kayouofficial.com/en-US/series/series-2nicsllo',
    'BP02': 'https://www.kayouofficial.com/en-US/series/series-ry03llcx',
    'BP03': 'https://www.kayouofficial.com/en-US/series/series-27z4pa09',
}


def read_cards(html):
    # The server-rendered Next.js payload includes full card records.
    payload = ''.join(json.loads(match.group(1)) for match in re.finditer(
        r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)', html))
    decoder = json.JSONDecoder()
    records = []
    for match in re.finditer(r'\{"id":"merch-', payload):
        record, _ = decoder.raw_decode(payload[match.start():])
        if 'idCode' in record:
            records.append(record)
    if not records:
        raise ValueError('No official card records found; page format may have changed')
    return records


def image_lookup(records):
    images = {}
    for record in records:
        code = record['idCode']
        # Kayou labels BP03 Shining Ruby cards as ※RR_※BP03-RR01, etc.
        if code.startswith('※RR_※BP03-RR'):
            code = code.removeprefix('※RR_')
        shining = '※' in record['rarity']
        if code.startswith('※') != shining:
            raise ValueError(f'Inconsistent Shining status: {code}')
        url = record['image']
        if not url.startswith('https://static-sg.kayouofficial.com/'):
            raise ValueError(f'Unexpected image host: {url}')
        if code in images:
            raise ValueError(f'Duplicate official card: {code}')
        images[code] = url
    return images


def main():
    path = ROOT / 'data/catalog.json'
    catalog = json.loads(path.read_text())
    lookups = {}
    for set_code, url in SERIES.items():
        request = Request(url, headers={'User-Agent': 'PonyBinder catalog updater'})
        with urlopen(request, timeout=45) as response:
            lookups[set_code] = image_lookup(read_cards(response.read().decode('utf-8')))
    # Resolve every card before writing, so partial matches never overwrite the file.
    updates = []
    for card in catalog['cards']:
        code = ('※' if card['sh'] else '') + card['c']
        updates.append(lookups[card['s']][code])
    for card, image in zip(catalog['cards'], updates):
        card['img'] = image
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'Updated {len(updates)} image URLs from Kayou')


if __name__ == '__main__':
    main()
