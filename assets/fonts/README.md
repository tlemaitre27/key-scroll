# Fonts

| File | Font | License |
| --- | --- | --- |
| `AstaSans-*.woff2` | [Asta Sans](https://github.com/42dot/Asta-Sans) | SIL OFL 1.1, see `OFL-AstaSans.txt` |
| `DMMono-Regular.woff2` | [DM Mono](https://github.com/googlefonts/dm-mono) | SIL OFL 1.1, see `OFL-DMMono.txt` |

These files are **subsets** of the original fonts (Latin, common punctuation and arrows only), converted to WOFF2 to keep the extension small. Asta Sans also covers Korean, which the UI doesn't use.

To regenerate them from the original `.ttf` files (needs `pip install fonttools brotli`):

```bash
U="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2122,U+2190-2193,U+2212,U+2248,U+2260,U+2264-2265,U+25CF"
for f in AstaSans-Regular AstaSans-Medium AstaSans-Bold DMMono-Regular; do
  python3 -m fontTools.subset "$f.ttf" --unicodes="$U" \
    --layout-features='kern,liga,lnum,tnum,calt,ccmp,locl,mark,mkmk' \
    --flavor=woff2 --output-file="$f.woff2"
done
```
