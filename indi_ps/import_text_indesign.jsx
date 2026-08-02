/*
 * ============================================================
 *  שלב 2 - אינדיזיין: ייבוא שכבות הטקסט
 *  import_text_indesign.jsx
 * ------------------------------------------------------------
 *  קורא את קובץ ה־TXT שיצא מפוטושופ ובונה תיבות טקסט
 *  במיקום הנכון, עם פונט, גודל, צבע, יישור, ו־RTL מלא.
 *
 *  התקנה:  Window > Utilities > Scripts  >  לחיצה ימנית על
 *          תיקיית User  >  Reveal in Finder / Explorer
 *          שמים שם את הקובץ, ואז לוחצים עליו פעמיים.
 *
 *  https://d85c.com/indi_ps
 * ============================================================
 */

#target indesign

/* ==== הגדרות - אפשר לשנות ידנית או לייצר מותאם באתר ==== */
var CFG = {
    anchor:       "right",      /* "right" = עוגן לקצה הימני (עברית) | "left" */
    rtl:          true,         /* כיוון פסקה מימין לשמאל */
    worldReady:   true,         /* Adobe World-Ready Paragraph Composer */
    fontName:     "",           /* "" = להשאיר את הפונט מפוטושופ. אחרת: "Arial\tRegular" */
    fontSize:     0,            /* 0 = לקחת את הגודל מפוטושופ */
    useColor:     true,         /* להעביר את צבע הטקסט */
    align:        "auto",       /* "auto" = כמו בפוטושופ | "right" | "left" | "center" | "justify" */
    autoSize:     "width",      /* "off" | "width" | "height" | "both" */
    fitFrame:     false,        /* Fit Frame to Content (רק כש-autoSize = "off") */
    layerName:    "PS Text",
    padding:      2,            /* נק' אוויר מסביב לתיבה, כדי שלא ייווצר overset */
    skipHidden:   true          /* לדלג על שכבות מוסתרות */
};
/* ======================================================== */


function importPhotoshopText() {

    if (app.documents.length === 0) {
        alert("פתחו קודם מסמך אינדיזיין (רצוי באותו גודל כמו בפוטושופ).");
        return;
    }

    var doc = app.activeDocument;

    var f = File.openDialog("בחרו את קובץ ה־TXT שייצאתם מפוטושופ");
    if (!f) return;

    f.encoding = "UTF-8";
    if (!f.open("r")) { alert("לא הצלחתי לקרוא את הקובץ."); return; }
    var raw = f.read();
    f.close();
    if (raw.length && raw.charCodeAt(0) === 65279) raw = raw.substring(1);

    /* ---------- פענוח ---------- */

    var lines = raw.split(/\r\n|\r|\n/);
    var psW = 0, psH = 0, psRes = 72;
    var cols = null;
    var recs = [];
    var i;

    for (i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (ln === "") continue;
        var p = ln.split("\t");

        if (p[0] === "#DOC")  { psW = parseFloat(p[1]); psH = parseFloat(p[2]); psRes = parseFloat(p[3]) || 72; continue; }
        if (p[0] === "#COLS") { cols = p.slice(1); continue; }
        if (p[0].charAt(0) === "#") continue;

        recs.push(p);
    }

    if (!cols)        { alert("הקובץ לא נראה כמו פלט של הסקריפט מפוטושופ (חסרה שורת #COLS)."); return; }
    if (!recs.length) { alert("לא נמצאו שכבות טקסט בקובץ."); return; }

    var idx = {};
    for (i = 0; i < cols.length; i++) idx[cols[i]] = i;

    function get(rec, key) {
        var k = idx[key];
        return (k === undefined || rec[k] === undefined) ? "" : rec[k];
    }
    function getNum(rec, key, dflt) {
        var v = parseFloat(get(rec, key));
        return isNaN(v) ? dflt : v;
    }
    function unesc(s) {
        var out = "", j = 0;
        while (j < s.length) {
            var c = s.charAt(j);
            if (c === "\\" && j + 1 < s.length) {
                var d = s.charAt(j + 1);
                if (d === "n")       { out += "\r"; j += 2; continue; }
                if (d === "t")       { out += "\t"; j += 2; continue; }
                if (d === "\\")      { out += "\\"; j += 2; continue; }
            }
            out += c;
            j++;
        }
        return out;
    }

    /* ---------- יחידות ---------- */

    var prevH = doc.viewPreferences.horizontalMeasurementUnits;
    var prevV = doc.viewPreferences.verticalMeasurementUnits;
    var prevO = doc.viewPreferences.rulerOrigin;

    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits   = MeasurementUnits.POINTS;
    doc.viewPreferences.rulerOrigin                = RulerOrigin.PAGE_ORIGIN;
    doc.zeroPoint = [0, 0];

    var K = 72 / psRes;                 /* פיקסלים -> נקודות */
    var pageW = doc.documentPreferences.pageWidth;

    var page;
    try { page = app.activeWindow.activePage; } catch (ePage) { page = doc.pages[0]; }

    /* ---------- שכבה ---------- */

    var layer = doc.layers.itemByName(CFG.layerName);
    if (!layer.isValid) layer = doc.layers.add({ name: CFG.layerName });

    /* ---------- עזרים ---------- */

    var colorCache = {};
    function swatch(hex) {
        if (!hex || hex.length < 6) return null;
        hex = hex.toUpperCase();
        if (colorCache[hex]) return colorCache[hex];
        var name = "PS " + hex;
        var c = doc.colors.itemByName(name);
        if (!c.isValid) {
            c = doc.colors.add({
                name: name,
                model: ColorModel.PROCESS,
                space: ColorSpace.RGB,
                colorValue: [
                    parseInt(hex.substr(0, 2), 16),
                    parseInt(hex.substr(2, 2), 16),
                    parseInt(hex.substr(4, 2), 16)
                ]
            });
        }
        colorCache[hex] = c;
        return c;
    }

    var JUST = {
        left:    Justification.LEFT_ALIGN,
        right:   Justification.RIGHT_ALIGN,
        center:  Justification.CENTER_ALIGN,
        centered:Justification.CENTER_ALIGN,
        justify: Justification.LEFT_JUSTIFIED,
        justifyleft:   Justification.LEFT_JUSTIFIED,
        justifyright:  Justification.RIGHT_JUSTIFIED,
        justifycenter: Justification.CENTER_JUSTIFIED,
        justifyall:    Justification.FULLY_JUSTIFIED
    };

    /* ---------- בנייה ---------- */

    var made = 0, hidden = 0;
    var missingFonts = {}, missingList = [];
    var rtlFailed = false;

    for (i = 0; i < recs.length; i++) {
        var r = recs[i];

        if (CFG.skipHidden && get(r, "visible") === "0") { hidden++; continue; }

        var txt = unesc(get(r, "text"));
        if (txt === "") continue;

        var x      = getNum(r, "x", 0);
        var y      = getNum(r, "y", 0);
        var w      = getNum(r, "w", 0);
        var h      = getNum(r, "h", 0);
        var xRight = getNum(r, "xRight", psW - (x + w));

        var wPt = w * K, hPt = h * K, pad = CFG.padding;

        var x1, x2;
        if (CFG.anchor === "right") {
            x2 = pageW - (xRight * K);      /* נעוץ לקצה הימני - זה מה שמחזיק עברית במקום */
            x1 = x2 - wPt;
        } else {
            x1 = x * K;
            x2 = x1 + wPt;
        }
        var y1 = y * K;
        var y2 = y1 + hPt;

        var tf = page.textFrames.add(layer, undefined, undefined, {
            geometricBounds: [y1 - pad, x1 - pad, y2 + pad, x2 + pad],
            name: get(r, "name")
        });

        var tfp = tf.textFramePreferences;
        try {
            tfp.insetSpacing         = [0, 0, 0, 0];
            tfp.verticalJustification = VerticalJustification.TOP_ALIGN;
            tfp.firstBaselineOffset  = FirstBaseline.CAP_HEIGHT;
        } catch (eTfp) {}

        /* כיוון הסיפור נקבע לפני שמכניסים טקסט */
        if (CFG.rtl) {
            try {
                tf.parentStory.storyPreferences.storyDirection =
                    StoryDirectionOptions.RIGHT_TO_LEFT_DIRECTION;
            } catch (eDir) { rtlFailed = true; }
        }

        tf.contents = txt;

        var t = tf.parentStory.texts[0];

        if (CFG.worldReady) {
            try { t.composer = "Adobe World-Ready Paragraph Composer"; } catch (eComp) {}
        }

        if (CFG.rtl) {
            try { t.paragraphDirection = ParagraphDirectionOptions.RIGHT_TO_LEFT_DIRECTION; } catch (e1) { rtlFailed = true; }
            try { t.characterDirection = CharacterDirectionOptions.DEFAULT_DIRECTION; }        catch (e2) {}
            try { t.digitsType         = DigitsTypeOptions.DEFAULT_DIGITS; }                   catch (e3) {}
            try { t.kashidas           = KashidasOptions.KASHIDAS_OFF; }                       catch (e4) {}
        }

        /* פונט */
        var wantFont = CFG.fontName || get(r, "font");
        if (wantFont) {
            var fnt = app.fonts.itemByName(wantFont);
            if (fnt.isValid) {
                try { t.appliedFont = fnt; } catch (e5) {}
            } else if (!missingFonts[wantFont]) {
                missingFonts[wantFont] = true;
                missingList.push(wantFont);
            }
        }

        /* גודל */
        var size = CFG.fontSize > 0 ? CFG.fontSize : getNum(r, "size", 0);
        if (size > 0) { try { t.pointSize = size; } catch (e6) {} }

        /* ריווח שורות */
        var lead = get(r, "leading");
        try {
            if (lead === "auto" || lead === "") t.leading = Leading.AUTO;
            else if (!isNaN(parseFloat(lead)))  t.leading = parseFloat(lead);
        } catch (e7) {}

        /* מרווח אותיות */
        var trk = getNum(r, "tracking", 0);
        if (trk) { try { t.tracking = trk; } catch (e8) {} }

        /* יישור */
        var alignKey = (CFG.align === "auto") ? String(get(r, "justify")).toLowerCase() : CFG.align;
        if (JUST[alignKey]) { try { t.justification = JUST[alignKey]; } catch (e9) {} }

        /* צבע */
        if (CFG.useColor) {
            var sw = swatch(get(r, "color"));
            if (sw) { try { t.fillColor = sw; } catch (e10) {} }
        }

        /* התאמת תיבה */
        if (CFG.autoSize !== "off") {
            try {
                tfp.autoSizingReferencePoint = (CFG.anchor === "right")
                    ? AutoSizingReferenceEnum.TOP_RIGHT_POINT
                    : AutoSizingReferenceEnum.TOP_LEFT_POINT;
                tfp.autoSizingType =
                    CFG.autoSize === "width"  ? AutoSizingTypeEnum.WIDTH_ONLY :
                    CFG.autoSize === "height" ? AutoSizingTypeEnum.HEIGHT_ONLY :
                                                AutoSizingTypeEnum.HEIGHT_AND_WIDTH;
            } catch (e11) {}
        } else if (CFG.fitFrame) {
            try { tf.fit(FitOptions.FRAME_TO_CONTENT); } catch (e12) {}
        }

        made++;
    }

    /* ---------- שחזור העדפות ---------- */

    doc.viewPreferences.horizontalMeasurementUnits = prevH;
    doc.viewPreferences.verticalMeasurementUnits   = prevV;
    doc.viewPreferences.rulerOrigin                = prevO;

    /* ---------- דוח ---------- */

    var msg = "יובאו " + made + " תיבות טקסט לשכבה “" + CFG.layerName + "”.";
    if (hidden) msg += "\n" + hidden + " שכבות מוסתרות דולגו.";
    if (rtlFailed) {
        msg += "\n\n⚠ לא הצלחתי להחיל RTL.\nצריך אינדיזיין עם תמיכה במזרח התיכון " +
               "(InDesign ME / World-Ready), או להפעיל ידנית:\nType > Story > Direction > Right to Left.";
    }
    if (missingList.length) {
        msg += "\n\n⚠ פונטים שלא נמצאו במערכת:\n• " + missingList.join("\n• ");
    }
    alert(msg);
}


try {
    app.doScript(importPhotoshopText, ScriptLanguage.JAVASCRIPT, undefined,
                 UndoModes.ENTIRE_SCRIPT, "ייבוא טקסטים מפוטושופ");
} catch (eRun) {
    alert("שגיאה: " + eRun.message + (eRun.line ? "\nשורה: " + eRun.line : ""));
}
