"""Box artwork for the Trump or Toddler card box (91 x 18 x 91 mm, inside).

    python3 print/box.py [output-dir]

Writes into output-dir (default: print/out/box):

  box-panels.pdf   one page per panel, each with 3 mm bleed, CMYK:
                   front, back, left side, right side, top, bottom.
                   Drop these into the printer's die-line template.
  box-net.pdf      the same panels laid out as a standard tuck-end box,
                   for preview (dashed lines are folds, not for print).
"""

import os
import sys

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402  (fonts and colours)
from build import INK, MUTED, PAPER, TODDLER, TRUMP, WHITE  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(build.HERE, "out", "box")
URL = "https://trumportoddler.t-miltzow.workers.dev"
URL_SHORT = "trumportoddler.t-miltzow.workers.dev"

W, D, H = 91 * mm, 18 * mm, 91 * mm   # width, depth, height
BLEED = 3 * mm
SAFE = 4 * mm


def bleed_rect(c, w, h, colour, x=0, y=0):
    c.setFillColor(colour)
    c.rect(x - BLEED, y - BLEED, w + 2 * BLEED, h + 2 * BLEED, stroke=0, fill=1)


def front(c, w, h):
    # top half Trump, bottom half Toddler, like the voting cards
    c.setFillColor(TRUMP)
    c.rect(-BLEED, h / 2, w + 2 * BLEED, h / 2 + BLEED, stroke=0, fill=1)
    c.setFillColor(TODDLER)
    c.rect(-BLEED, -BLEED, w + 2 * BLEED, h / 2 + BLEED, stroke=0, fill=1)
    size = 100
    while pdfmetrics.stringWidth("TODDLER?", "Black", size) > w - 2 * SAFE - 6 * mm:
        size -= 0.5
    c.setFillColor(WHITE)
    c.setFont("Black", size)
    c.drawCentredString(w / 2, h * 0.75 - size * 0.36, "TRUMP")
    c.drawCentredString(w / 2, h * 0.25 - size * 0.36, "TODDLER?")
    # "or" in a cream disc on the seam
    r = 7 * mm
    c.setFillColor(PAPER)
    c.circle(w / 2, h / 2, r, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Display", 13)
    c.drawCentredString(w / 2, h / 2 - 4.6, "or")
    c.setFont("Medium", 6.5)
    c.setFillColor(WHITE)
    c.setFont("SemiBold", 7.5)
    c.drawCentredString(w / 2, SAFE + 1 * mm, "3–10 players   ·   18+   ·   10 min")


def qr(c, x, y, size, url):
    widget = QrCodeWidget(url, barLevel="M", barBorder=0)
    widget.barFillColor = INK
    x0, y0, x1, y1 = widget.getBounds()
    d = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    d.add(widget)
    renderPDF.draw(d, c, x, y)


def back(c, w, h):
    bleed_rect(c, w, h, PAPER)
    x, tw = SAFE + 1 * mm, w - 2 * SAFE - 2 * mm
    y = h - SAFE - 6 * mm
    c.setFillColor(INK)
    c.setFont("Black", 12)
    c.drawString(x, y, "Who would do that?")
    y -= 6 * mm
    blurb = ("Refuses to wear a coat. Gives everyone a nickname. Would like a "
             "parade. Read a statement out loud, argue about it, then everyone "
             "votes at once: Trump or toddler? Side with the majority and you "
             "score a point.")
    y = build.paragraph(c, x, y, tw, [(blurb, "Regular")], 8.4, 10.8) - 1.5 * mm
    c.setFillColor(MUTED)
    n_cards = len(build.pair_up(build.load_statements()))
    y = build.paragraph(c, x, y, tw, [("3–10 players  ·  18+  ·  10 min", "SemiBold")], 6.8, 8.6)
    build.paragraph(c, x, y + 0.6 * mm, tw, [(f"{n_cards} statement cards, 10 voting cards, 1 rules card",
                                   "Medium")], 6.4, 8.2)
    # QR block, bottom left, with a two-colour band below
    band = 4.5 * mm
    c.setFillColor(TRUMP)
    c.rect(-BLEED, -BLEED, w / 2 + BLEED, band + BLEED, stroke=0, fill=1)
    c.setFillColor(TODDLER)
    c.rect(w / 2, -BLEED, w / 2 + BLEED, band + BLEED, stroke=0, fill=1)
    q = 20 * mm
    qx, qy = x, band + 4 * mm
    c.setFillColor(WHITE)
    c.rect(qx - 1.5 * mm, qy - 1.5 * mm, q + 3 * mm, q + 3 * mm, stroke=0, fill=1)
    qr(c, qx, qy, q, URL)
    tx = qx + q + 5 * mm
    c.setFillColor(INK)
    c.setFont("SemiBold", 9)
    c.drawString(tx, qy + q - 5 * mm, "Play online")
    c.setFont("Regular", 6.6)
    build.paragraph(c, tx, qy + q - 10 * mm, w - tx - SAFE,
                    [("Scan to play on your phone and add your own statements.", "Regular")],
                    6.6, 8.2)


def side(c, w, h, upward):
    """Long narrow spine with the title running along it."""
    bleed_rect(c, w, h, TRUMP if upward else TODDLER)
    c.saveState()
    if upward:
        c.translate(w / 2 + 3.6, 0)
        c.rotate(90)
    else:
        c.translate(w / 2 - 3.6, h)
        c.rotate(-90)
    _spine_text(c, h)
    c.restoreState()


def _spine_text(c, length):
    parts = [("TRUMP", "Black"), (" or ", "Display"), ("TODDLER?", "Black")]
    size = 10
    total = sum(pdfmetrics.stringWidth(t, f, size) for t, f in parts)
    x = (length - total) / 2
    c.setFillColor(WHITE)
    for t, f in parts:
        c.setFont(f, size)
        c.drawString(x, 0, t)
        x += pdfmetrics.stringWidth(t, f, size)


def end(c, w, h):
    """Top and bottom: short strip with the title across it."""
    bleed_rect(c, w, h, PAPER)
    c.saveState()
    c.translate(0, h / 2 - 3.6)
    _spine_text_colour(c, w)
    c.restoreState()


def _spine_text_colour(c, length):
    parts = [("TRUMP", "Black", TRUMP), (" or ", "Display", MUTED),
             ("TODDLER?", "Black", TODDLER)]
    size = 10
    total = sum(pdfmetrics.stringWidth(t, f, size) for t, f, _ in parts)
    x = (length - total) / 2
    for t, f, col in parts:
        c.setFillColor(col)
        c.setFont(f, size)
        c.drawString(x, 0, t)
        x += pdfmetrics.stringWidth(t, f, size)


PANELS = [
    ("front", W, H, front),
    ("back", W, H, back),
    ("left side", D, H, lambda c, w, h: side(c, w, h, True)),
    ("right side", D, H, lambda c, w, h: side(c, w, h, False)),
    ("top", W, D, end),
    ("bottom", W, D, end),
]


def panels_pdf(path):
    c = canvas.Canvas(path, initialFontName="Regular")
    c.setTitle("Trump or Toddler - box panels")
    for name, w, h, draw in PANELS:
        c.setPageSize((w + 2 * BLEED, h + 2 * BLEED))
        c.setTrimBox((BLEED, BLEED, BLEED + w, BLEED + h))
        c.setBleedBox((0, 0, w + 2 * BLEED, h + 2 * BLEED))
        c.saveState()
        c.translate(BLEED, BLEED)
        draw(c, w, h)
        c.restoreState()
        c.showPage()
    c.save()


def net_pdf(path):
    """Preview of a tuck-end box: back | right side | front | left side, with
    top and bottom on the front panel. Fold lines dashed."""
    glue = 12 * mm
    m = 15 * mm
    total_w = glue + 2 * W + 2 * D
    total_h = H + 2 * (D + 15 * mm)
    c = canvas.Canvas(path, pagesize=(total_w + 2 * m, total_h + 2 * m),
                      initialFontName="Regular")
    c.setTitle("Trump or Toddler - box net preview")
    y0 = m + D + 15 * mm
    x = m + glue
    order = [("back", W, back), ("right", D, lambda c, w, h: side(c, w, h, False)),
             ("front", W, front), ("left", D, lambda c, w, h: side(c, w, h, True))]
    xs = {}
    for name, w, draw in order:
        c.saveState()
        p = c.beginPath()
        p.rect(x, y0, w, H)
        c.clipPath(p, stroke=0)
        c.translate(x, y0)
        draw(c, w, H)
        c.restoreState()
        xs[name] = x
        x += w
    # top and bottom attached to the front
    for yy in (y0 + H, y0 - D):
        c.saveState()
        p = c.beginPath()
        p.rect(xs["front"], yy, W, D)
        c.clipPath(p, stroke=0)
        c.translate(xs["front"], yy)
        end(c, W, D)
        c.restoreState()
    c.setStrokeColor(MUTED)
    c.setLineWidth(0.4)
    c.setDash(2, 2)
    for name in xs:
        c.line(xs[name], y0, xs[name], y0 + H)
    c.line(m + glue + 2 * W + 2 * D, y0, m + glue + 2 * W + 2 * D, y0 + H)
    c.line(m, y0, m + total_w, y0)
    c.line(m, y0 + H, m + total_w, y0 + H)
    c.setDash()
    # outline of glue flap, tuck flaps and dust flaps
    c.rect(m, y0 + 3 * mm, glue, H - 6 * mm)
    fx = xs["front"]
    c.rect(fx, y0 + H + D, W, 15 * mm)
    c.rect(fx, y0 - D - 15 * mm, W, 15 * mm)
    for sx in (xs["right"], xs["left"]):
        c.rect(sx, y0 + H, D, 14 * mm)
        c.rect(sx, y0 - 14 * mm, D, 14 * mm)
    c.setFont("Regular", 7)
    c.setFillColor(MUTED)
    c.drawString(m, m / 2, "Preview only: standard tuck-end layout. "
                 "Use the printer's own die-line for the real file.")
    c.save()


# ---------------------------------------------------------------- Peterprint
# Die-line from Peterprint (EngView export, tuck-end box 91 x 18 x 91 mm).
# Panel edges below are read from that file, in points from its lower left
# corner. The thumb notch is on the front panel, the lid hinges on the back.
TEMPLATE = os.path.join(build.HERE, "box-template", "peterprint-EVF11103_91x18x91.pdf")
TPL_W, TPL_H = 667.81, 399.08
X_GLUE, X_BACK, X_LEFT, X_FRONT, X_RIGHT, X_END = 0.12, 51.15, 309.10, 360.12, 618.08, 667.68
Y_BOTTOM, Y_BODY, Y_TOP, Y_LID, Y_TUCK = 0.12, 33.77, 291.24, 342.27, 398.96


def _panel(c, x0, y0, x1, y1, draw, grow=(0, 0, 0, 0), rotate=False):
    """Draw a panel clipped to its rectangle; grow = (left, bottom, right,
    top) extends the clip into the bleed on cut edges."""
    l, b, r, t = grow
    c.saveState()
    p = c.beginPath()
    p.rect(x0 - l, y0 - b, (x1 - x0) + l + r, (y1 - y0) + b + t)
    c.clipPath(p, stroke=0)
    w, h = x1 - x0, y1 - y0
    if rotate:
        c.translate(x1, y1)
        c.rotate(180)
    else:
        c.translate(x0, y0)
    draw(c, w, h)
    c.restoreState()


def peterprint_pdf(path):
    import pikepdf
    tmp = path + ".art.pdf"
    page_w, page_h = TPL_W + 2 * BLEED, TPL_H + 2 * BLEED
    c = canvas.Canvas(tmp, pagesize=(page_w, page_h), initialFontName="Regular")
    c.setTitle("Trump or Toddler - box 91 x 18 x 91")
    c.setTrimBox((BLEED, BLEED, BLEED + TPL_W, BLEED + TPL_H))
    c.setBleedBox((0, 0, page_w, page_h))
    c.translate(BLEED, BLEED)
    # flaps and everything outside the panels: plain paper colour
    c.setFillColor(PAPER)
    c.rect(-BLEED, -BLEED, page_w, page_h, stroke=0, fill=1)
    B = BLEED
    _panel(c, X_BACK, Y_BODY, X_LEFT, Y_TOP, back)
    _panel(c, X_LEFT, Y_BODY, X_FRONT, Y_TOP, lambda c, w, h: side(c, w, h, True))
    _panel(c, X_FRONT, Y_BODY, X_RIGHT, Y_TOP, front, grow=(0, 0, 0, B))
    _panel(c, X_RIGHT, Y_BODY, X_END, Y_TOP, lambda c, w, h: side(c, w, h, False),
           grow=(0, 0, B, 0))
    # lid: turned round so it reads from the front once closed
    _panel(c, X_BACK, Y_TOP, X_LEFT, Y_LID, end, grow=(B, 0, B, 0), rotate=True)
    c.showPage()
    c.save()

    with pikepdf.open(tmp) as art, pikepdf.open(TEMPLATE) as tpl:
        page = art.pages[0]
        page.add_overlay(tpl.pages[0], pikepdf.Rectangle(BLEED, BLEED, BLEED + TPL_W, BLEED + TPL_H))
        art.save(path)
    os.remove(tmp)
    build.make_pdfx1a(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    panels_pdf(os.path.join(OUT, "box-panels.pdf"))
    build.make_pdfx1a(os.path.join(OUT, "box-panels.pdf"))
    net_pdf(os.path.join(OUT, "box-net.pdf"))
    peterprint_pdf(os.path.join(OUT, "box-peterprint.pdf"))
    print("box ->", OUT)


if __name__ == "__main__":
    main()
