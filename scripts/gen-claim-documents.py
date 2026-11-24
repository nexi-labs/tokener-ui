"""
Builds the sample insurance documents for the claims agent demo: three fictional claim packs as PDF, each page as an image, and the position
of every extracted field, so the approval screen can show the document and highlight where each value was read.
All names, policies and amounts are invented. Run: python3 scripts/gen-claim-documents.py
"""
import json, os, subprocess, tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "samples", "claims")
DATA = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "agents", "claims-docs.generated.json")
os.makedirs(OUT, exist_ok=True)
W, H = 595.0, 842.0
INK, SOFT, LINE, BRAND, ACCENT = HexColor("#16262b"), HexColor("#5b6b70"), HexColor("#cfd8da"), HexColor("#07191E"), HexColor("#02F5A1")

class Doc:
    def __init__(self, ref, title, insurer="Harbor & Pine Insurance"):
        self.ref, self.title, self.insurer = ref, title, insurer
        self.path = os.path.join(OUT, f"{ref}.pdf")
        self.c = canvas.Canvas(self.path, pagesize=(W, H)); self.c.setTitle(f"{title} {ref}"); self.c.setAuthor(insurer)
        self.page = 0; self.fields = []; self.pages = 0
    def begin(self, heading, sub):
        self.page += 1; c = self.c
        c.setFillColor(BRAND); c.rect(0, H - 86, W, 86, stroke=0, fill=1)
        c.setFillColor(ACCENT); c.rect(0, H - 90, W, 4, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 17); c.drawString(44, H - 44, self.insurer)
        c.setFont("Helvetica", 10); c.setFillColor(HexColor("#b9c9cd")); c.drawString(44, H - 62, heading)
        c.setFont("Helvetica", 9); c.drawRightString(W - 44, H - 44, f"Reference {self.ref}"); c.drawRightString(W - 44, H - 62, sub)
        c.setFillColor(SOFT); c.setFont("Helvetica", 8); c.drawString(44, 28, f"{self.insurer}  |  Confidential  |  Page {self.page}"); c.setStrokeColor(LINE); c.line(44, 40, W - 44, 40)
    def t(self, x, top, text, size=10, bold=False, color=INK, key=None, italic=False, align="l"):
        c = self.c; font = "Helvetica-BoldOblique" if bold and italic else "Helvetica-Bold" if bold else "Helvetica-Oblique" if italic else "Helvetica"
        c.setFillColor(color); c.setFont(font, size); w = stringWidth(text, font, size)
        if align == "r": x = x - w
        c.drawString(x, H - top, text)
        if key: self.fields.append({"key": key, "page": self.page, "box": [round((x - 2) / W, 4), round((top - size * 0.9) / H, 4), round((w + 4) / W, 4), round((size * 1.35) / H, 4)], "text": text})
        return w
    def label(self, x, top, text): self.t(x, top, text.upper(), 7, True, SOFT)
    def rule(self, top): self.c.setStrokeColor(LINE); self.c.line(44, H - top, W - 44, H - top)
    def para(self, x, top, text, width, size=10, lead=14):
        words, line, y = text.split(), "", top
        for w in words:
            if stringWidth(line + " " + w, "Helvetica", size) > width and line: self.t(x, y, line, size); y += lead; line = w
            else: line = (line + " " + w).strip()
        if line: self.t(x, y, line, size); y += lead
        return y
    def section(self, top, text): self.t(44, top, text, 11, True, BRAND); self.c.setFillColor(ACCENT); self.c.rect(44, H - top - 6, 22, 2, stroke=0, fill=1); return top + 22
    def end(self):
        self.c.showPage()
    def save(self):
        self.c.save()
        with tempfile.TemporaryDirectory() as d:
            subprocess.run(["pdftoppm", "-r", "100", "-png", self.path, os.path.join(d, "p")], check=True)
            files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
            for i, f in enumerate(files, 1): Image.open(os.path.join(d, f)).convert("RGB").save(os.path.join(OUT, f"{self.ref}-p{i}.webp"), quality=84)
            self.pages = len(files)

def money(v): return f"{v:,.2f}"

def form_page(d, d_heading, rows, desc, decl_name, signed):
    d.begin(d_heading, "Claim form")
    top = 128
    top = d.section(top, "Policy and claimant")
    for (lab1, val1, key1), (lab2, val2, key2) in rows[0]:
        d.label(44, top, lab1); d.t(44, top + 16, val1, 11, True, key=key1)
        d.label(318, top, lab2); d.t(318, top + 16, val2, 11, True, key=key2); top += 44
    d.rule(top - 8); top += 14
    top = d.section(top, "The loss")
    for (lab1, val1, key1), (lab2, val2, key2) in rows[1]:
        d.label(44, top, lab1); d.t(44, top + 16, val1, 11, True, key=key1)
        d.label(318, top, lab2); d.t(318, top + 16, val2, 11, True, key=key2); top += 44
    d.rule(top - 8); top += 14
    top = d.section(top, "What happened")
    top = d.para(44, top + 4, desc, W - 88) + 12
    d.rule(top); top += 18
    top = d.section(top, "Declaration")
    top = d.para(44, top + 4, "I declare that the information given is true and complete. I understand that a false statement can void the claim and the policy.", W - 88, 9, 13) + 18
    d.label(44, top, "Signed"); d.t(44, top + 22, signed, 18, False, italic=True); d.label(318, top, "Date signed"); d.t(318, top + 16, decl_name, 11, True)
    d.end()

def table(d, top, heads, rows, widths, total_rows):
    x = 44; d.c.setFillColor(HexColor("#eef3f4")); d.c.rect(44, H - top - 16, W - 88, 22, stroke=0, fill=1)
    cx = x + 8
    for h, w in zip(heads, widths): d.t(cx if h != heads[-1] else x + sum(widths) - 8, top + 9, h.upper(), 7, True, SOFT, align="r" if h == heads[-1] else "l"); cx += w
    top += 34
    for r in rows:
        cx = x + 8
        for i, (v, w) in enumerate(zip(r, widths)):
            if i == len(r) - 1: d.t(x + sum(widths) - 8, top, v, 10, align="r")
            else: d.t(cx, top, v, 10)
            cx += w
        d.c.setStrokeColor(LINE); d.c.line(44, H - top - 8, W - 44, H - top - 8); top += 24
    return top

def build_a():
    d = Doc("CLM-24-00871", "Home claim pack")
    form_page(d, "Property claim form", [[(("Claim reference", "CLM-24-00871", None), ("Policy number", "HP-HOM-558201", "policy")), (("Policyholder", "Amira Haddad", "claimant"), ("Contact", "a.haddad@example.test", None))],
        [(("Date of loss", "28 October 2026", "lossDate"), ("Reported on", "29 October 2026", "reportedOn")), (("Type of loss", "Escaped water, burst pipe", "cause"), ("Property", "14 Larch Court, Dunmore", None))]],
        "At about 06:30 on 28 October I found water coming through the kitchen ceiling. A supply pipe in the bathroom above had split. I turned off the water at the stopcock and called a plumber, who stopped the leak the same morning. The ceiling, the kitchen floor and two cupboards were damaged. I attach the plumber's invoice, a restoration estimate and photographs.",
        "29 October 2026", "A. Haddad")
    d.begin("Restoration estimate", "Supporting document")
    top = d.section(128, "Brightline Restoration Ltd")
    d.label(44, top, "Estimate number"); d.t(44, top + 16, "EST-20418", 11, True); d.label(318, top, "Estimate date"); d.t(318, top + 16, "30 October 2026", 11, True, key="invoiceDate"); top += 52
    d.label(44, top, "For"); d.t(44, top + 16, "Amira Haddad, 14 Larch Court, Dunmore", 11, True); d.label(318, top, "Contractor"); d.t(318, top + 16, "Brightline Restoration Ltd", 11, True, key="contractor"); top += 56
    top = table(d, top, ["Item", "Qty", "Amount (USD)"], [["Emergency water extraction and drying", "1", "1,180.00"], ["Replace kitchen ceiling plasterboard and repaint", "1", "2,260.00"], ["Replace kitchen floor, laminate, 14 sq m", "14", "2,310.00"], ["Repair two wall cupboards", "2", "1,020.00"], ["Plumber call-out and pipe repair", "1", "420.00"]], [360, 50, 85], [])
    top += 6
    d.t(W - 52, top, "Subtotal  7,190.00", 10, align="r"); d.t(W - 52, top + 18, "Sales tax  230.00", 10, align="r"); d.t(W - 52, top + 42, "Total  " + money(7420.0), 13, True, key="amount", align="r")
    top += 84; d.para(44, top, "Photographs of the damaged ceiling, floor and cupboards are attached to the claim as images 1 to 6. This estimate is valid for 60 days.", W - 88, 9, 13)
    d.end()
    d.begin("Policy schedule extract", "Held on file")
    top = d.section(128, "Cover in force")
    for (l1, v1, k1), (l2, v2, k2) in [(("Policy number", "HP-HOM-558201", None), ("Cover type", "Home buildings and contents", None)), (("Period", "1 March 2026 to 28 February 2027", None), ("Escaped water limit", "USD 25,000", "limit")), (("Excess (escaped water)", "USD 500", "excess"), ("Wear and tear", "Not covered", None))]:
        d.label(44, top, l1); d.t(44, top + 16, v1, 11, True, key=k1); d.label(318, top, l2); d.t(318, top + 16, v2, 11, True, key=k2); top += 44
    d.rule(top - 8); top += 14; top = d.section(top, "Conditions that apply to this claim")
    for line in ["The policyholder must report a loss within 7 days.", "Repair estimates must be dated after the date of loss.", "A payout above USD 5,000 needs a second person's approval.", "Gradual damage and faulty workmanship are not covered."]:
        d.t(52, top, "-", 10); top = d.para(66, top, line, W - 120) + 4
    d.end(); d.save(); return d

def build_b():
    d = Doc("CLM-24-00902", "Motor claim pack")
    form_page(d, "Motor claim form", [[(("Claim reference", "CLM-24-00902", None), ("Policy number", "MV-AUTO-771034", "policy")), (("Policyholder", "Daniel Okoye", "claimant"), ("Vehicle", "Meridian Wagon, DK21 TXR", None))],
        [(("Date of loss", "2 November 2026", "lossDate"), ("Reported on", "3 November 2026", "reportedOn")), (("Type of loss", "Collision, third party at fault", "cause"), ("Location", "Ring Road, junction 4", None))]],
        "I was stopped at the lights at junction 4 on the Ring Road at about 17:40 on 2 November when another car hit the back of my vehicle. The other driver gave me their details. The boot lid and rear bumper are damaged and the rear sensors no longer work. I attach the garage's repair invoice and the other driver's details.",
        "3 November 2026", "D. Okoye")
    d.begin("Repair invoice", "Supporting document")
    top = d.section(128, "Ashgrove Autobody")
    d.label(44, top, "Invoice number"); d.t(44, top + 16, "INV-77219", 11, True); d.label(318, top, "Invoice date"); d.t(318, top + 16, "30 October 2026", 11, True, key="invoiceDate"); top += 52
    d.label(44, top, "For"); d.t(44, top + 16, "Daniel Okoye, Meridian Wagon DK21 TXR", 11, True); d.label(318, top, "Contractor"); d.t(318, top + 16, "Ashgrove Autobody", 11, True, key="contractor"); top += 56
    top = table(d, top, ["Item", "Qty", "Amount (USD)"], [["Replace boot lid and respray", "1", "4,860.00"], ["Replace rear bumper and fit", "1", "2,950.00"], ["Rear parking sensors, supply and fit", "4", "1,340.00"], ["Paint and materials", "1", "2,130.00"], ["Labour, 31 hours", "31", "1,700.00"]], [360, 50, 85], [])
    top += 6; d.t(W - 52, top, "Subtotal  12,980.00", 10, align="r"); d.t(W - 52, top + 24, "Total  " + money(12980.0), 13, True, key="amount", align="r")
    d.end()
    d.begin("Policy schedule extract", "Held on file")
    top = d.section(128, "Cover in force")
    for (l1, v1, k1), (l2, v2, k2) in [(("Policy number", "MV-AUTO-771034", None), ("Cover type", "Comprehensive", None)), (("Period", "14 January 2026 to 13 January 2027", None), ("Repair limit", "Market value, USD 21,000", "limit")), (("Excess (collision)", "USD 750", "excess"), ("Courtesy car", "Included, 10 days", None))]:
        d.label(44, top, l1); d.t(44, top + 16, v1, 11, True, key=k1); d.label(318, top, l2); d.t(318, top + 16, v2, 11, True, key=k2); top += 44
    d.rule(top - 8); top += 14; top = d.section(top, "Conditions that apply to this claim")
    for line in ["Repair invoices must be dated after the date of loss.", "A payout above USD 5,000 needs a second person's approval.", "The insurer may recover the cost from a third party at fault."]:
        d.t(52, top, "-", 10); top = d.para(66, top, line, W - 120) + 4
    d.end(); d.save(); return d

def build_c():
    d = Doc("CLM-24-00915", "Travel claim pack")
    form_page(d, "Travel baggage claim form", [[(("Claim reference", "CLM-24-00915", None), ("Policy number", "TR-SGL-330917", "policy")), (("Policyholder", "Lena Vogel", "claimant"), ("Trip", "Lisbon, 4 to 9 November 2026", None))],
        [(("Date of loss", "5 November 2026", "lossDate"), ("Reported on", "9 November 2026", "reportedOn")), (("Type of loss", "Baggage lost by airline", "cause"), ("Reference", "Airline report LIS-55012", None))]],
        "My checked bag did not arrive in Lisbon on 5 November. The airline opened a report and told me on 8 November that the bag could not be traced. I bought no replacements. I list the contents below with the receipts I still have. The airline's written confirmation of the loss is attached.",
        "9 November 2026", "L. Vogel")
    d.begin("Contents and receipts", "Supporting document")
    top = d.section(128, "Items lost")
    top = table(d, top, ["Item", "Receipt", "Value (USD)"], [["Compact camera", "Yes", "420.00"], ["Waterproof jacket", "Yes", "180.00"], ["Wireless headphones", "Yes", "250.00"], ["Travel bag and contents", "Partly", "300.00"]], [330, 80, 85], [])
    top += 8; d.t(W - 52, top, "Total claimed  " + money(1150.0), 13, True, key="amount", align="r")
    top += 40; d.label(44, top, "Airline confirmation"); d.t(44, top + 16, "Received 8 November 2026, report LIS-55012", 11, True, key="contractor")
    d.end()
    d.begin("Policy schedule extract", "Held on file")
    top = d.section(128, "Cover in force")
    for (l1, v1, k1), (l2, v2, k2) in [(("Policy number", "TR-SGL-330917", None), ("Cover type", "Single trip, standard", None)), (("Period", "4 to 9 November 2026", None), ("Baggage limit", "USD 2,000, USD 500 per item", "limit")), (("Excess (baggage)", "USD 50", "excess"), ("Receipts", "Required above USD 100", None))]:
        d.label(44, top, l1); d.t(44, top + 16, v1, 11, True, key=k1); d.label(318, top, l2); d.t(318, top + 16, v2, 11, True, key=k2); top += 44
    d.rule(top - 8); top += 14; top = d.section(top, "Conditions that apply to this claim")
    for line in ["Report a loss to the carrier and to us within 31 days.", "Receipts are required for items above USD 100.", "A payout above USD 5,000 needs a second person's approval."]:
        d.t(52, top, "-", 10); top = d.para(66, top, line, W - 120) + 4
    d.end(); d.save(); return d

out = {}
for fn in (build_a, build_b, build_c):
    d = fn(); out[d.ref] = {"pdf": f"/samples/claims/{d.ref}.pdf", "pages": [f"/samples/claims/{d.ref}-p{i}.webp" for i in range(1, d.pages + 1)], "fields": d.fields, "size": [W, H]}
    print(d.ref, d.pages, "pages", len(d.fields), "field boxes")
json.dump(out, open(DATA, "w"), indent=1)
