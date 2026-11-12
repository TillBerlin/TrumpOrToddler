# Print version

A card game version of Trump or Toddler, made for MakePlayingCards /
PrinterStudio "Square 3.5 inch" cards (89 x 89 mm, 1/8 in bleed).

    pip install reportlab
    python3 print/build.py

Output lands in `print/out/`: the card PDF (one page per face, duplex order,
CMYK, TrimBox/BleedBox set), the same with crop marks, one 300 dpi PNG per face,
and `statements.txt` / `rules.txt` for proofreading.

Statements live in `statements.json` (pulled from the live game). Rules text is
at the top of `build.py`. Fonts are Inter (SIL Open Font License, see
`fonts/OFL.txt`), converted to TrueType so they can be embedded.

The deck: 1 rules card, 21 statement cards (one statement per side, the last
back left blank for writing your own) and 10 voting cards (Trump / Toddler).

Toddler tokens: `toddler-token.pdf` / `png/toddler-token.png`, made for
BoardGamesMaker.com 25 mm chipboard circles (1/8 in bleed plus 1/8 in safe
area, same image on both sides). 24 per sheet, 2 sheets per game.

Peterprint.de version: `out/peterprint/`, 89 x 89 mm trim with exactly 3 mm
bleed (95 x 95 mm pages), front/back alternating, no crop marks, saved as
PDF/X-1a:2001 (FOGRA39 output intent, PDF 1.3). Same for the 25 mm token
(31 x 31 mm page). Needs `pip install pikepdf`.

Box: `python3 print/box.py` writes `out/box/`: `box-panels.pdf` (front, back,
two sides, top, bottom for a 91 x 18 x 91 mm box, 3 mm bleed each, PDF/X-1a)
and `box-net.pdf`, a tuck-end preview. The back has a QR code to the web game.
