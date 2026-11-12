"""Build the print files for the Trump or Toddler card game.

    python3 print/build.py [output-dir]

Writes, into output-dir (default: print/out):

  trump-or-toddler-cards.pdf            one page per card face, trim + 1/8 in bleed,
                                        TrimBox/BleedBox set. What most print
                                        companies ask for.
  trump-or-toddler-cards-cropmarks.pdf  the same faces on a larger page with
                                        crop marks, for printers who want marks.
  statements.txt                        every statement, in card order, for review.
  rules.txt                             the rules as plain text.
  png/                                  one 300 dpi PNG per face (RGB preview
                                        of the same artwork; for shops that
                                        want images rather than a PDF).

Card order is duplex: card 1 front, card 1 back, card 2 front, ...
All colours are DeviceCMYK; text is 100 % K; fonts are embedded (Inter, OFL).
"""

import json
import os
import re
import shutil
import subprocess
import sys

from reportlab.lib.colors import CMYKColor
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out")

# ---------------------------------------------------------------- geometry
# Print spec: MakePlayingCards / PrinterStudio "Square 3.5 inch" cards,
# 89 x 89 mm trim, 1/8 in bleed. Faces are laid out on a 70 mm design grid
# and scaled up, so changing the card size only means changing REAL_TRIM.
REAL_TRIM = 3.5 * 72          # 89 mm, in points
REAL_BLEED = 0.125 * 72       # 3.175 mm
SLUG = 12 * mm                # extra margin around the bleed on the crop-mark version
TRIM = 70 * mm                # design grid
K = REAL_TRIM / TRIM
BLEED = REAL_BLEED / K        # bleed in design units
SAFE = 6 * mm                 # text stays this far inside the cut (7.6 mm real)

# ---------------------------------------------------------------- colours
# Taken from the web version (--trump #b9603f, --toddler #4a7a8c), pushed a
# little for print so the two voting sides read clearly across a table.
TRUMP = CMYKColor(0, 0.62, 0.78, 0.18)
TODDLER = CMYKColor(0.72, 0.22, 0.12, 0.22)
PAPER = CMYKColor(0, 0.02, 0.06, 0)
INK = CMYKColor(0, 0, 0, 1)
MUTED = CMYKColor(0, 0, 0, 0.55)
LINE = CMYKColor(0, 0, 0, 0.18)
WHITE = CMYKColor(0, 0, 0, 0)

for name, file in [
    ("Display", "InterDisplay-SemiBold.ttf"),
    ("Black", "InterDisplay-Black.ttf"),
    ("Medium", "Inter-Medium.ttf"),
    ("Regular", "Inter-Regular.ttf"),
    ("SemiBold", "Inter-SemiBold.ttf"),
    ("Italic", "Inter-Italic.ttf"),
]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(HERE, "fonts", file)))

# ---------------------------------------------------------------- content
SCORING = "tokens"  # "tokens" | "scoresheet"

RULES_TITLE = "How to play"
RULES_STEPS = [
    ("Read.", "Take the top card and read the statement out loud."),
    ("Talk.", "Who would do that, Trump or a toddler? Talk it over."),
    ("Vote.", "Keep your voting card hidden. On “3, 2, 1” everyone shows "
              "Trump or Toddler at the same time."),
    ("Score.", "Everyone who voted with the majority takes a toddler token. "
               "A tie scores nothing."),
]
RULES_SETUP = ("3 to 10 players. Everyone takes a voting card. Shuffle the "
               "statement cards into a stack. The youngest player reads first.")
RULES_NEXT = "Then the stack moves one player to the left, and they read next."
WIN_TITLE = "Winning"
WIN_TEXT = [
    "The first player to collect 10 toddler tokens wins. For a shorter game, "
    "play to 5.",
    "Every card has a statement on both sides. When the stack runs out, "
    "turn it over and keep going.",
    "The blank side is yours: write your own statement on it.",
]


def load_statements():
    with open(os.path.join(HERE, "statements.json"), encoding="utf-8") as f:
        return [s["text"] for s in json.load(f)["statements"]]


def pair_up(statements):
    """Two statements per card. The first half go on the fronts and the
    second half on the backs, so the short quotes and the longer
    descriptions get mixed rather than doubled up."""
    half = (len(statements) + 1) // 2
    fronts, backs = statements[:half], statements[half:]
    backs += [None] * (len(fronts) - len(backs))  # None = "write your own"
    return list(zip(fronts, backs))


# ---------------------------------------------------------------- drawing
def fill_bleed(c, colour):
    c.setFillColor(colour)
    c.rect(-BLEED, -BLEED, TRIM + 2 * BLEED, TRIM + 2 * BLEED, stroke=0, fill=1)


def wrap(text, font, size, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def fit_text(text, font, width, height, max_size, min_size=8):
    size = max_size
    while size > min_size:
        lines = wrap(text, font, size, width)
        widest = max(pdfmetrics.stringWidth(l, font, size) for l in lines)
        if widest <= width and len(lines) * size * 1.22 <= height:
            return size, lines
        size -= 0.5
    return size, wrap(text, font, size, width)


def header(c):
    """'TRUMP or TODDLER?' along the top, in the two vote colours."""
    size, y = 6.5, TRIM - SAFE - 2 * mm
    parts = [("TRUMP", "SemiBold", TRUMP), (" or ", "Medium", MUTED),
             ("TODDLER?", "SemiBold", TODDLER)]
    sp = 0.6
    widths = [pdfmetrics.stringWidth(t, f, size) + sp * len(t) for t, f, _ in parts]
    x = (TRIM - sum(widths) + sp) / 2
    for (t, f, col), w in zip(parts, widths):
        o = c.beginText(x, y)
        o.setFont(f, size)
        o.setCharSpace(sp)
        o.setFillColor(col)
        o.textOut(t)
        c.drawText(o)
        x += w


def footer_band(c, label):
    """Two-colour band along the bottom edge, running into the bleed."""
    band = 4.5 * mm
    c.setFillColor(TRUMP)
    c.rect(-BLEED, -BLEED, TRIM / 2 + BLEED, band + BLEED, stroke=0, fill=1)
    c.setFillColor(TODDLER)
    c.rect(TRIM / 2, -BLEED, TRIM / 2 + BLEED, band + BLEED, stroke=0, fill=1)
    if label:
        c.setFont("Medium", 5.5)
        c.setFillColor(MUTED)
        c.drawCentredString(TRIM / 2, band + 2.6 * mm, label)


def face_statement(c, text, label):
    fill_bleed(c, PAPER)
    header(c)
    footer_band(c, label)
    box_w = TRIM - 2 * SAFE - 2 * mm
    top, bottom = TRIM - SAFE - 6 * mm, 13 * mm
    size, lines = fit_text(text, "Display", box_w, top - bottom, 17)
    lead = size * 1.22
    y = bottom + (top - bottom) / 2 + (len(lines) * lead) / 2 - size * 0.8
    c.setFont("Display", size)
    c.setFillColor(INK)
    for line in lines:
        c.drawCentredString(TRIM / 2, y, line)
        y -= lead


def face_blank(c, label):
    fill_bleed(c, PAPER)
    header(c)
    footer_band(c, label)
    c.setFont("Italic", 8)
    c.setFillColor(MUTED)
    c.drawCentredString(TRIM / 2, TRIM - SAFE - 10 * mm, "Write your own:")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    y = TRIM - SAFE - 18 * mm
    for _ in range(4):
        c.line(SAFE + 2 * mm, y, TRIM - SAFE - 2 * mm, y)
        y -= 8 * mm


def paragraph(c, x, y, width, runs, size, lead):
    """Draw mixed-font text (list of (text, font)) wrapped to width.
    Returns the y below the last line."""
    words = []
    for text, font in runs:
        for w in text.split():
            words.append((w, font))
    line, line_w = [], 0
    space = lambda f: pdfmetrics.stringWidth(" ", f, size)

    def flush():
        xx = x
        for w, f in line:
            c.setFont(f, size)
            c.drawString(xx, y, w)
            xx += pdfmetrics.stringWidth(w, f, size) + space(f)

    for w, f in words:
        ww = pdfmetrics.stringWidth(w, f, size)
        if line and line_w + ww > width:
            flush()
            y -= lead
            line, line_w = [], 0
        line.append((w, f))
        line_w += ww + space(f)
    if line:
        flush()
    return y - lead


def face_rules(c):
    fill_bleed(c, PAPER)
    x, w = SAFE, TRIM - 2 * SAFE
    y = TRIM - SAFE - 4 * mm
    c.setFillColor(INK)
    c.setFont("Black", 12)
    c.drawString(x, y, RULES_TITLE)
    y -= 6 * mm
    size, lead = 7.1, 8.8
    c.setFillColor(INK)
    y = paragraph(c, x, y, w, [(RULES_SETUP, "Regular")], size, lead) - 1.2 * mm
    for n, (head, body) in enumerate(RULES_STEPS, 1):
        c.setFillColor(TRUMP if n % 2 else TODDLER)
        c.setFont("Black", 10)
        c.drawString(x, y - 0.4, str(n))
        c.setFillColor(INK)
        y = paragraph(c, x + 4.2 * mm, y, w - 4.2 * mm,
                      [(head, "SemiBold"), (body, "Regular")], size, lead) - 1.0 * mm
    paragraph(c, x, y - 0.4 * mm, w, [(RULES_NEXT, "Regular")], size, lead)


def face_winning(c):
    fill_bleed(c, PAPER)
    x, w = SAFE, TRIM - 2 * SAFE
    y = TRIM - SAFE - 4 * mm
    c.setFillColor(INK)
    c.setFont("Black", 12)
    c.drawString(x, y, WIN_TITLE)
    y -= 6 * mm
    for para in WIN_TEXT:
        c.setFillColor(INK)
        y = paragraph(c, x, y, w, [(para, "Regular")], 8.2, 10.4) - 2.2 * mm
    footer_band(c, None)


def face_vote(c, word, colour):
    fill_bleed(c, colour)
    c.setFillColor(WHITE)
    # same size on both sides, so the longer word decides
    size = 100
    while pdfmetrics.stringWidth("TODDLER", "Black", size) > TRIM - 2 * SAFE - 4 * mm:
        size -= 0.5
    c.setFont("Black", size)
    c.drawCentredString(TRIM / 2, TRIM / 2 - size * 0.36, word)
    c.setStrokeColor(WHITE)
    c.setLineWidth(1.2)
    inset = SAFE - 1 * mm
    c.roundRect(inset, inset, TRIM - 2 * inset, TRIM - 2 * inset, 3 * mm, stroke=1, fill=0)


# ---------------------------------------------------------------- pages
def faces(statements):
    """Every card face, in duplex order, as (description, draw-function)."""
    out = [("Rules (front)", face_rules), ("Rules (back)", face_winning)]
    for i, (a, b) in enumerate(pair_up(statements), 1):
        out.append((f"Card {i}A", lambda c, a=a, i=i: face_statement(c, a, f"{i}A")))
        if b is None:
            out.append((f"Card {i}B", lambda c, i=i: face_blank(c, f"{i}B")))
        else:
            out.append((f"Card {i}B", lambda c, b=b, i=i: face_statement(c, b, f"{i}B")))
    for n in range(1, 11):
        out.append((f"Vote {n} Trump", lambda c: face_vote(c, "TRUMP", TRUMP)))
        out.append((f"Vote {n} Toddler", lambda c: face_vote(c, "TODDLER", TODDLER)))
    return out


def set_boxes(c, offset):
    # TrimBox / BleedBox in page coordinates, read by every prepress tool.
    t0, t1 = offset, offset + REAL_TRIM
    b0, b1 = offset - REAL_BLEED, offset + REAL_TRIM + REAL_BLEED
    c.setTrimBox((t0, t0, t1, t1))
    c.setBleedBox((b0, b0, b1, b1))
    c.setArtBox((t0, t0, t1, t1))


def crop_marks(c, offset):
    c.setStrokeColor(CMYKColor(1, 1, 1, 1))  # registration: shows on every plate
    c.setLineWidth(0.25)
    TRIM, BLEED = REAL_TRIM, REAL_BLEED
    gap, length = BLEED + 1 * mm, 6 * mm
    for edge in (offset, offset + TRIM):
        # vertical marks above and below, horizontal marks left and right
        c.line(edge, offset - gap, edge, offset - gap - length)
        c.line(edge, offset + TRIM + gap, edge, offset + TRIM + gap + length)
        c.line(offset - gap, edge, offset - gap - length, edge)
        c.line(offset + TRIM + gap, edge, offset + TRIM + gap + length, edge)


def build_pdf(path, all_faces, marks):
    margin = SLUG + REAL_BLEED if marks else REAL_BLEED
    size = REAL_TRIM + 2 * margin
    c = canvas.Canvas(path, pagesize=(size, size), initialFontName="Regular")
    c.setTitle("Trump or Toddler - cards")
    c.setAuthor("Trump or Toddler")
    c.setSubject("89 x 89 mm (3.5 in) square cards, 1/8 in bleed, CMYK")
    for desc, draw in all_faces:
        set_boxes(c, margin)
        c.saveState()
        c.translate(margin, margin)
        c.scale(K, K)
        draw(c)
        c.restoreState()
        if marks:
            # white slug so the bleed edge is visible, then the marks
            c.setFillColor(WHITE)
            crop_marks(c, margin)
            c.setFont("Regular", 5)
            c.setFillColor(INK)
            c.drawString(margin, 3 * mm, f"Trump or Toddler  ·  {desc}  ·  89 x 89 mm trim, 3.175 mm bleed")
        c.showPage()
    c.save()


# ---------------------------------------------------------------- tokens
# BoardGamesMaker.com 25 mm chipboard circles: 1/8 in bleed, and the art
# stays a further 1/8 in inside the cut.
TOKEN = 25 * mm
TOKEN_BLEED = 0.125 * 72


def draw_token(c, r):
    """A toddler face in a teal circle, centred on (0, 0), radius r of the
    cut line. The background runs past r so it bleeds."""
    c.setFillColor(TODDLER)
    c.circle(0, 0, r + TOKEN_BLEED, stroke=0, fill=1)
    c.setStrokeColor(WHITE)
    c.setFillColor(WHITE)
    # face
    fr = r * 0.52
    c.setLineWidth(r * 0.07)
    c.circle(0, -r * 0.05, fr, stroke=1, fill=0)
    # ears
    for sx in (-1, 1):
        c.circle(sx * fr * 1.02, -r * 0.05, fr * 0.2, stroke=1, fill=0)
    c.setFillColor(TODDLER)
    c.circle(0, -r * 0.05, fr - r * 0.035, stroke=0, fill=1)
    c.setFillColor(WHITE)
    # eyes
    for sx in (-1, 1):
        c.circle(sx * fr * 0.36, fr * 0.08, fr * 0.1, stroke=0, fill=1)
    # smile
    c.setLineCap(1)
    c.setLineWidth(r * 0.06)
    c.arc(-fr * 0.38, -fr * 0.62, fr * 0.38, -fr * 0.02, startAng=200, extent=140)
    # hair curl on top
    p = c.beginPath()
    top = -r * 0.05 + fr
    p.moveTo(0, top)
    p.curveTo(-fr * 0.05, top + fr * 0.35, fr * 0.38, top + fr * 0.42, fr * 0.3, top + fr * 0.12)
    p.curveTo(fr * 0.24, top - fr * 0.02, fr * 0.06, top + fr * 0.02, fr * 0.1, top + fr * 0.16)
    c.drawPath(p, stroke=1, fill=0)
    c.setLineCap(0)


def build_tokens(path):
    """One page per token face (front and back the same), trim + bleed,
    TrimBox set to the square around the circle."""
    size = TOKEN + 2 * TOKEN_BLEED
    c = canvas.Canvas(path, pagesize=(size, size), initialFontName="Regular")
    c.setTitle("Trump or Toddler - toddler tokens")
    c.setSubject("25 mm round tokens, 1/8 in bleed, CMYK")
    for _ in range(2):
        c.setTrimBox((TOKEN_BLEED, TOKEN_BLEED, TOKEN_BLEED + TOKEN, TOKEN_BLEED + TOKEN))
        c.setBleedBox((0, 0, size, size))
        c.saveState()
        c.translate(size / 2, size / 2)
        c.setFillColor(TODDLER)
        c.rect(-size / 2, -size / 2, size, size, stroke=0, fill=1)
        draw_token(c, TOKEN / 2)
        c.restoreState()
        c.showPage()
    c.save()


def write_text(statements):
    lines = [f"Trump or Toddler: all {len(statements)} statements", ""]
    for i, (a, b) in enumerate(pair_up(statements), 1):
        lines.append(f"Card {i:>2}A  {a}")
        lines.append(f"Card {i:>2}B  {b if b else '(blank: write your own)'}")
    with open(os.path.join(OUT, "statements.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    r = [RULES_TITLE.upper(), "", RULES_SETUP, ""]
    for n, (h, b) in enumerate(RULES_STEPS, 1):
        r.append(f"{n}. {h} {b}")
    r += ["", RULES_NEXT, "", WIN_TITLE.upper(), ""] + [p + "\n" for p in WIN_TEXT]
    with open(os.path.join(OUT, "rules.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(r))


def export_png(pdf, all_faces):
    """One 300 dpi PNG per face (1125 x 1125 px for 3.5 in + bleed), named so
    fronts and backs pair up when uploading to the print shop. Needs
    pdftoppm (poppler); skipped if it is not installed."""
    if not shutil.which("pdftoppm"):
        print("pdftoppm not found, skipping PNGs")
        return
    folder = os.path.join(OUT, "png")
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(folder)
    for page, (desc, _) in enumerate(all_faces, 1):
        card = (page + 1) // 2
        side = "front" if page % 2 else "back"
        name = re.sub(r"[^a-z0-9]+", "-", desc.lower()).strip("-")
        name = re.sub(r"-(front|back)$", "", name)
        base = os.path.join(folder, f"{card:02d}-{side}-{name}")
        subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile",
                        "-f", str(page), "-l", str(page), pdf, base], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    statements = load_statements()
    all_faces = faces(statements)
    build_pdf(os.path.join(OUT, "trump-or-toddler-cards.pdf"), all_faces, marks=False)
    build_pdf(os.path.join(OUT, "trump-or-toddler-cards-cropmarks.pdf"), all_faces, marks=True)
    write_text(statements)
    export_png(os.path.join(OUT, "trump-or-toddler-cards.pdf"), all_faces)
    build_tokens(os.path.join(OUT, "toddler-token.pdf"))
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile", "-f", "1", "-l", "1",
                        os.path.join(OUT, "toddler-token.pdf"),
                        os.path.join(OUT, "png", "toddler-token")], check=True)
    cards = len(all_faces) // 2
    print(f"{len(statements)} statements, {cards} cards, {len(all_faces)} pages -> {OUT}")


if __name__ == "__main__":
    main()
