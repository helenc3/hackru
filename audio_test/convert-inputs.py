"""Run with pypinyin==0.55.0 and dragonmapper==0.3.0 installed."""
import json
from pathlib import Path
from pypinyin import pinyin, Style
from dragonmapper.transcriptions import pinyin_to_ipa

root = Path(__file__).resolve().parent
manifest = json.loads((root.parent / 'fixtures/audio/pa-manifest.json').read_text())
ids = ['b1.harbor-change.tier-1']
inputs = []
for asset_id in ids:
    hanzi = next(item['textZh'] for item in manifest if item['audioAssetId'] == asset_id)
    syllables = [item[0] for item in pinyin(hanzi, style=Style.TONE, heteronym=False)]
    # Contextual readings: 不 before a fourth tone, 一 before 号 (fourth tone).
    for index, syllable in enumerate(syllables):
        if syllable == 'bù' and index + 1 < len(syllables) and syllables[index + 1] in ['shì', 'zài']:
            syllables[index] = 'bú'
        if syllable == 'yī' and index + 1 < len(syllables) and syllables[index + 1] == 'hào':
            syllables[index] = 'yí'
    marked = ' '.join(syllables)
    ipa = pinyin_to_ipa(marked)
    inputs.append({'assetId': asset_id, 'options': [
        {'option': 1, 'format': 'hanzi', 'text': hanzi},
        {'option': 2, 'format': 'pinyin', 'text': marked},
        {'option': 3, 'format': 'ipa', 'text': '/' + ipa + '/'},
    ]})
(root / 'inputs.json').write_text(json.dumps(inputs, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(inputs, ensure_ascii=False, indent=2))
