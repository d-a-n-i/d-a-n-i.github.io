/*
 * ============================================================
 *  sync_photoshop_text.jsx
 * ------------------------------------------------------------
 *  סקריפט יחיד שרץ באינדיזיין בלבד:
 *
 *   1. סורק את כל הקבצים המקושרים (Links) במסמך האינדיזיין
 *      ומאתר את כל אלה שהם קובצי פוטושופ (.psd / .psb),
 *      ולאיזה עמוד כל אחד מהם מקושר.
 *   2. עבור כל קובץ פוטושופ, שולח פקודה לפוטושופ עצמו (דרך
 *      BridgeTalk) שפותחת את הקובץ, אוספת את כל שכבות הטקסט
 *      שבו, וסוגרת אותו בחזרה - בלי לגעת בממשק.
 *   3. בונה באינדיזיין תיבות טקסט חיות במיקום הנכון על גבי
 *      העמוד המתאים, לפי המקום והגודל שבו התמונה מונחת בפועל -
 *      כולל פונט, גודל, צבע, יישור ו-RTL.
 *
 *  דרישות:
 *   - פוטושופ ואינדיזיין חייבים לרוץ על אותו מחשב (BridgeTalk
 *     היא תקשורת בין תוכנות אדובי מקומיות בלבד, לא דרך רשת).
 *   - קובצי הפוטושופ צריכים להיות ממוקמים ב-File > Place
 *     (Link), לא מודבקים כתמונה שטוחה.
 *   - עובד הכי מדויק כשהמסגרת שבה הונחה התמונה תואמת ליחס
 *     הממדים המקורי של קובץ הפוטושופ (בלי חיתוך פנימי).
 *
 *  הפעלה:  Window > Utilities > Scripts > User  (להעתיק לשם
 *          את הקובץ) > לחיצה כפולה על הסקריפט.
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


/* ============================================================
 *  הפונקציה הזו לעולם לא רצה באינדיזיין - היא רק "מודפסת"
 *  (toString) ונשלחת דרך BridgeTalk כדי לרוץ בתוך פוטושופ.
 *  כל מה שבפנים הוא ExtendScript תקני של פוטושופ בלבד.
 * ============================================================ */
function psWorker(targetPath) {
    function num(v) {
        if (v === null || v === undefined || isNaN(v)) return "";
        return String(Math.round(v * 100) / 100);
    }
    function esc(s) {
        if (s === null || s === undefined) return "";
        s = String(s);
        s = s.replace(/\\/g, "\\\\");
        s = s.replace(/\r\n/g, "\n");
        s = s.replace(/[\r\u0003\u2028\u2029]/g, "\n");
        s = s.replace(/\n/g, "\\n");
        s = s.replace(/\t/g, "\\t");
        return s;
    }
    function justName(j) {
        var s = String(j);
        var i = s.lastIndexOf(".");
        if (i >= 0) s = s.substring(i + 1);
        return s.toLowerCase();
    }
    function hexOf(ti) {
        try { return ti.color.rgb.hexValue; } catch (e) { return ""; }
    }

    var wasOpen = false, doc = null, di;
    for (di = 0; di < app.documents.length; di++) {
        try {
            if (app.documents[di].fullName.fsName === targetPath) {
                doc = app.documents[di];
                wasOpen = true;
                break;
            }
        } catch (eN) {}
    }
    if (!doc) {
        try {
            doc = app.open(new File(targetPath));
        } catch (eOpen) {
            return "ERR\t" + eOpen.message;
        }
    }
    app.activeDocument = doc;

    var prevRuler = app.preferences.rulerUnits;
    var prevType  = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits  = TypeUnits.POINTS;

    var docW = 0, docH = 0, res = 72, rows = [], found = 0, skippedPoint = 0;

    function collect(container, path) {
        var i, j;
        for (i = 0; i < container.artLayers.length; i++) {
            var L = container.artLayers[i];
            if (L.kind !== LayerKind.TEXT) continue;

            var ti = L.textItem;
            var x, y, w, h, isPara = false;

            try { isPara = (ti.kind === TextType.PARAGRAPHTEXT); } catch (e0) { isPara = false; }

            if (isPara) {
                try {
                    x = ti.position[0].as("px");
                    y = ti.position[1].as("px");
                    w = ti.width.as("px");
                    h = ti.height.as("px");
                } catch (e1) { isPara = false; }
            }

            if (!isPara) {
                skippedPoint++;
                var b = L.bounds;
                x = b[0].as("px");
                y = b[1].as("px");
                w = b[2].as("px") - x;
                h = b[3].as("px") - y;
            }

            var size = ""; try { size = num(ti.size.as("pt")); } catch (e2) {}
            var leading = "auto"; try { if (!ti.useAutoLeading) leading = num(ti.leading.as("pt")); } catch (e3) { leading = "auto"; }
            var tracking = "0"; try { tracking = num(ti.tracking); } catch (e4) {}
            var font = ""; try { font = ti.font; } catch (e5) {}
            var just = "left"; try { just = justName(ti.justification); } catch (e6) {}
            var opacity = "100"; try { opacity = num(L.opacity); } catch (e7) {}

            rows.push([
                esc(path + L.name),
                num(x), num(y), num(w), num(h),
                num(docW - (x + w)),
                esc(font), size, leading, tracking, just,
                hexOf(ti), opacity, (L.visible ? "1" : "0"),
                (isPara ? "para" : "point"), esc(ti.contents)
            ].join("\t"));

            found++;
        }
        for (j = 0; j < container.layerSets.length; j++) {
            var g = container.layerSets[j];
            collect(g, path + g.name + "/");
        }
    }

    var out;
    try {
        docW = doc.width.as("px");
        docH = doc.height.as("px");
        res  = doc.resolution;

        rows.push("#DOC\t" + num(docW) + "\t" + num(docH) + "\t" + num(res));
        rows.push("#COLS\tname\tx\ty\tw\th\txRight\tfont\tsize\tleading\ttracking\tjustify\tcolor\topacity\tvisible\tkind\ttext");

        collect(doc, "");

        out = (found === 0) ? "EMPTY" : ("OK\t" + rows.join("\n"));
    } catch (errC) {
        out = "ERR\t" + errC.message;
    } finally {
        app.preferences.rulerUnits = prevRuler;
        app.preferences.typeUnits  = prevType;
        if (!wasOpen) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {} }
    }
    return out;
}


function syncPhotoshopText() {

    if (app.documents.length === 0) {
        alert("פתחו קודם מסמך אינדיזיין עם קבצי פוטושופ מקושרים (File > Place).");
        return;
    }

    var doc = app.activeDocument;

    /* ---------- עזרים ---------- */

    function jsStringLiteral(s) {
        return '"' + String(s)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n") + '"';
    }

    function buildBridgeScript(filePath) {
        return "#target photoshop\n(" + psWorker.toString() + ")(" + jsStringLiteral(filePath) + ");";
    }

    function callPhotoshop(script) {
        var result = null, gotError = null;
        var bt = new BridgeTalk();
        bt.target = "photoshop";
        bt.body = script;
        bt.onResult = function (res) { result = res.body; };
        bt.onError  = function (err) { gotError = (err && err.body) ? err.body : String(err); };
        bt.send();

        var waitedMs = 0, stepMs = 100, maxMs = 180000; /* 3 דקות - כולל זמן הפעלת פוטושופ אם צריך */
        while (result === null && gotError === null && waitedMs < maxMs) {
            $.sleep(stepMs);
            waitedMs += stepMs;
        }
        if (gotError !== null) throw new Error(gotError);
        if (result === null) throw new Error("תם הזמן להמתנה לתשובה מפוטושופ (timeout).");
        return result;
    }

    function unesc(s) {
        var out = "", j = 0;
        while (j < s.length) {
            var c = s.charAt(j);
            if (c === "\\" && j + 1 < s.length) {
                var d = s.charAt(j + 1);
                if (d === "n") { out += "\r"; j += 2; continue; }
                if (d === "t") { out += "\t"; j += 2; continue; }
                if (d === "\\") { out += "\\"; j += 2; continue; }
            }
            out += c;
            j++;
        }
        return out;
    }

    function parsePsData(body) {
        var lines = body.split(/\r\n|\r|\n/);
        var psW = 0, psH = 0, psRes = 72, cols = null, recs = [];
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
        if (!cols || !recs.length) return null;

        var idx = {};
        for (i = 0; i < cols.length; i++) idx[cols[i]] = i;

        return { docW: psW, docH: psH, res: psRes, idx: idx, rows: recs };
    }

    function get(idx, rec, key) {
        var k = idx[key];
        return (k === undefined || rec[k] === undefined) ? "" : rec[k];
    }
    function getNum(idx, rec, key, dflt) {
        var v = parseFloat(get(idx, rec, key));
        return isNaN(v) ? dflt : v;
    }

    /* ---------- איתור קבצי פוטושופ מקושרים ועמוד היעד שלהם ---------- */

    function findPsdPlacements() {
        var out = [];
        var links = doc.links.everyItem().getElements();
        var i;
        for (i = 0; i < links.length; i++) {
            var link = links[i];
            var fp;
            try { fp = link.filePath; } catch (eFp) { continue; }
            if (!fp || !/\.(psd|psb)$/i.test(fp)) continue;

            var graphic;
            try { graphic = link.parent; } catch (eG) { continue; }
            if (!graphic || !graphic.isValid) continue;

            /* מטפסים עד לפריט העליון שיושב ישירות על ה-Spread -
               כך ההיקף (geometricBounds) שלו הוא כבר בקואורדינטות
               של ה-Spread, גם אם התמונה מקוננת בתוך קבוצה */
            var topItem = graphic, guard = 0;
            while (topItem && topItem.parent && !(topItem.parent instanceof Spread) && guard < 25) {
                topItem = topItem.parent;
                guard++;
            }

            var bounds;
            try { bounds = topItem.geometricBounds; } catch (eB) { continue; }

            var page = null;
            try { if (topItem.parentPage && topItem.parentPage.isValid) page = topItem.parentPage; } catch (eP) {}
            if (!page) {
                try {
                    var cy = (bounds[0] + bounds[2]) / 2, cx = (bounds[1] + bounds[3]) / 2;
                    var pages = topItem.parent.pages;
                    var pj;
                    for (pj = 0; pj < pages.length; pj++) {
                        var pb = pages[pj].bounds;
                        if (cx >= pb[1] && cx <= pb[3] && cy >= pb[0] && cy <= pb[2]) { page = pages[pj]; break; }
                    }
                } catch (eP2) {}
            }
            if (!page) continue;

            var rotated = false;
            try { rotated = Math.abs(topItem.rotationAngle % 360) > 0.05; } catch (eR) {}

            var itemName = fp;
            try { itemName = File(fp).name; } catch (eNm) {}

            out.push({
                filePath: fp,
                page: page,
                frameBounds: bounds,   /* [y1,x1,y2,x2] בקואורדינטות ה-Spread */
                rotated: rotated,
                displayName: itemName + " (עמ׳ " + page.name + ")"
            });
        }
        return out;
    }

    var jobs = findPsdPlacements();
    if (jobs.length === 0) {
        alert("לא נמצאו קבצי פוטושופ (.psd / .psb) מקושרים במסמך.\nודאו שהם הונחו עם File > Place ולא הודבקו כתמונה שטוחה.");
        return;
    }

    /* קיבוץ לפי קובץ, כדי לפתוח כל PSD בפוטושופ פעם אחת בלבד */
    var byFile = {}, order = [], fi;
    for (fi = 0; fi < jobs.length; fi++) {
        var j = jobs[fi];
        var key = j.filePath.toLowerCase();
        if (!byFile[key]) { byFile[key] = { path: j.filePath, placements: [] }; order.push(key); }
        byFile[key].placements.push(j);
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

    var layer = doc.layers.itemByName(CFG.layerName);
    if (!layer.isValid) layer = doc.layers.add({ name: CFG.layerName });

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

    var made = 0, hidden = 0, filesOk = 0;
    var filesFailed = [], croppedWarnings = [], rotatedWarnings = [];
    var missingFonts = {}, missingList = [], rtlFailed = false;

    var prevH = doc.viewPreferences.horizontalMeasurementUnits;
    var prevV = doc.viewPreferences.verticalMeasurementUnits;
    var prevO = doc.viewPreferences.rulerOrigin;
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits   = MeasurementUnits.POINTS;
    doc.viewPreferences.rulerOrigin                = RulerOrigin.PAGE_ORIGIN;

    function runImport() {
        for (var oi = 0; oi < order.length; oi++) {
            var entry = byFile[order[oi]];
            var raw;
            try {
                raw = callPhotoshop(buildBridgeScript(entry.path));
            } catch (eCall) {
                filesFailed.push(entry.path + " — " + eCall.message);
                continue;
            }

            if (raw.indexOf("ERR\t") === 0)   { filesFailed.push(entry.path + " — " + raw.substring(4)); continue; }
            if (raw === "EMPTY")              { filesFailed.push(entry.path + " — לא נמצאו שכבות טקסט"); continue; }
            if (raw.indexOf("OK\t") !== 0)    { filesFailed.push(entry.path + " — תשובה לא צפויה מפוטושופ"); continue; }

            var psData = parsePsData(raw.substring(3));
            if (!psData) { filesFailed.push(entry.path + " — לא ניתן לפענח את הנתונים שהתקבלו"); continue; }
            filesOk++;

            var natW = psData.docW / psData.res * 72;
            var natH = psData.docH / psData.res * 72;
            var K = 72 / psData.res;

            for (var pp = 0; pp < entry.placements.length; pp++) {
                var placement = entry.placements[pp];
                if (placement.rotated) rotatedWarnings.push(placement.displayName);

                var pb = placement.page.bounds; /* [y1,x1,y2,x2] בקואורדינטות ה-Spread */
                var fb = placement.frameBounds;
                var frameX1 = fb[1] - pb[1], frameY1 = fb[0] - pb[0];
                var frameX2 = fb[3] - pb[1], frameY2 = fb[2] - pb[0];
                var frameW = frameX2 - frameX1, frameH = frameY2 - frameY1;

                if (natW > 0 && natH > 0 && frameH > 0) {
                    var frameAR = frameW / frameH, psAR = natW / natH;
                    if (Math.abs(frameAR - psAR) / psAR > 0.03) croppedWarnings.push(placement.displayName);
                }

                var scaleX = natW > 0 ? frameW / natW : 1;
                var scaleY = natH > 0 ? frameH / natH : 1;

                for (var rr = 0; rr < psData.rows.length; rr++) {
                    var rec = psData.rows[rr];

                    if (CFG.skipHidden && get(psData.idx, rec, "visible") === "0") { hidden++; continue; }

                    var txt = unesc(get(psData.idx, rec, "text"));
                    if (txt === "") continue;

                    var x = getNum(psData.idx, rec, "x", 0);
                    var y = getNum(psData.idx, rec, "y", 0);
                    var w = getNum(psData.idx, rec, "w", 0);
                    var h = getNum(psData.idx, rec, "h", 0);
                    var xRight = getNum(psData.idx, rec, "xRight", psData.docW - (x + w));

                    var wPt = w * K * scaleX, hPt = h * K * scaleY, pad = CFG.padding;

                    var x1, x2;
                    if (CFG.anchor === "right") {
                        x2 = frameX2 - (xRight * K * scaleX);
                        x1 = x2 - wPt;
                    } else {
                        x1 = frameX1 + (x * K * scaleX);
                        x2 = x1 + wPt;
                    }
                    var y1 = frameY1 + (y * K * scaleY);
                    var y2 = y1 + hPt;

                    var tf = placement.page.textFrames.add(layer, undefined, undefined, {
                        geometricBounds: [y1 - pad, x1 - pad, y2 + pad, x2 + pad],
                        name: get(psData.idx, rec, "name")
                    });

                    var tfp = tf.textFramePreferences;
                    try {
                        tfp.insetSpacing          = [0, 0, 0, 0];
                        tfp.verticalJustification = VerticalJustification.TOP_ALIGN;
                        tfp.firstBaselineOffset   = FirstBaseline.CAP_HEIGHT;
                    } catch (eTfp) {}

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

                    var wantFont = CFG.fontName || get(psData.idx, rec, "font");
                    if (wantFont) {
                        var fnt = app.fonts.itemByName(wantFont);
                        if (fnt.isValid) {
                            try { t.appliedFont = fnt; } catch (e5) {}
                        } else if (!missingFonts[wantFont]) {
                            missingFonts[wantFont] = true;
                            missingList.push(wantFont);
                        }
                    }

                    var size = CFG.fontSize > 0 ? CFG.fontSize : getNum(psData.idx, rec, "size", 0);
                    if (size > 0) { try { t.pointSize = size; } catch (e6) {} }

                    var lead = get(psData.idx, rec, "leading");
                    try {
                        if (lead === "auto" || lead === "") t.leading = Leading.AUTO;
                        else if (!isNaN(parseFloat(lead)))  t.leading = parseFloat(lead);
                    } catch (e7) {}

                    var trk = getNum(psData.idx, rec, "tracking", 0);
                    if (trk) { try { t.tracking = trk; } catch (e8) {} }

                    var alignKey = (CFG.align === "auto") ? String(get(psData.idx, rec, "justify")).toLowerCase() : CFG.align;
                    if (JUST[alignKey]) { try { t.justification = JUST[alignKey]; } catch (e9) {} }

                    if (CFG.useColor) {
                        var sw = swatch(get(psData.idx, rec, "color"));
                        if (sw) { try { t.fillColor = sw; } catch (e10) {} }
                    }

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
            }
        }
    }

    try {
        app.doScript(runImport, ScriptLanguage.JAVASCRIPT, undefined,
                     UndoModes.ENTIRE_SCRIPT, "סנכרון טקסטים מפוטושופ");
    } finally {
        doc.viewPreferences.horizontalMeasurementUnits = prevH;
        doc.viewPreferences.verticalMeasurementUnits   = prevV;
        doc.viewPreferences.rulerOrigin                = prevO;
    }

    /* ---------- דוח ---------- */

    var msg = "נמצאו " + jobs.length + " הפניות לקבצי פוטושופ (" + order.length + " קבצים ייחודיים).\n" +
              "יובאו " + made + " תיבות טקסט לשכבה “" + CFG.layerName + "”.";
    if (filesOk) msg += "\n" + filesOk + " קבצים עובדו בהצלחה.";
    if (hidden)  msg += "\n" + hidden + " שכבות מוסתרות דולגו.";

    if (filesFailed.length) {
        msg += "\n\n⚠ קבצים שנכשלו:\n• " + filesFailed.join("\n• ");
    }
    if (rotatedWarnings.length) {
        msg += "\n\n⚠ הפניות מסובבות (המיקום עלול להיות לא מדויק):\n• " + rotatedWarnings.join("\n• ");
    }
    if (croppedWarnings.length) {
        msg += "\n\n⚠ יחס הממדים של המסגרת שונה מיחס הממדים של הפוטושופ - יכול להעיד על חיתוך פנימי (המיקום עלול להיות לא מדויק):\n• " + croppedWarnings.join("\n• ");
    }
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
    if (!BridgeTalk.isRunning("photoshop")) {
        /* השליחה תפעיל את פוטושופ אוטומטית - רק מזהירים שזה עשוי לקחת רגע */
    }
    syncPhotoshopText();
} catch (eRun) {
    alert("שגיאה: " + eRun.message + (eRun.line ? "\nשורה: " + eRun.line : ""));
}
