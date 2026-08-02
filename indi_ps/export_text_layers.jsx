/*
 * ============================================================
 *  שלב 1 - פוטושופ: ייצוא שכבות טקסט
 *  export_text_layers.jsx
 * ------------------------------------------------------------
 *  שומר קובץ TXT עם כל שכבות הטקסט של המסמך:
 *  מיקום (גם מצד שמאל וגם מצד ימין), גודל תיבה, פונט, גודל,
 *  ריווח שורות, מרווח אותיות, יישור, צבע והטקסט עצמו.
 *
 *  ה־xRight (מרחק מהקצה הימני) הוא מה שמאפשר לאינדיזיין
 *  להניח את הטקסט נכון בעברית, גם אם רוחב העמוד שונה.
 *
 *  הפעלה:  File > Scripts > Browse...
 *  https://d85c.com/indi_ps
 * ============================================================
 */

#target photoshop

(function () {

    if (app.documents.length === 0) {
        alert("צריך מסמך פתוח בפוטושופ.");
        return;
    }

    var doc = app.activeDocument;

    var prevRuler = app.preferences.rulerUnits;
    var prevType  = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits  = TypeUnits.POINTS;

    var docW = 0, docH = 0, res = 72;
    var rows = [];
    var found = 0;
    var skippedPoint = 0;

    /* ---------- עזרים ---------- */

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

    /* ---------- איסוף ---------- */

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
                } catch (e1) {
                    isPara = false;
                }
            }

            if (!isPara) {
                /* טקסט נקודתי - נופלים חזרה לגבולות השכבה */
                skippedPoint++;
                var b = L.bounds;
                x = b[0].as("px");
                y = b[1].as("px");
                w = b[2].as("px") - x;
                h = b[3].as("px") - y;
            }

            var size = "";
            try { size = num(ti.size.as("pt")); } catch (e2) {}

            var leading = "auto";
            try {
                if (!ti.useAutoLeading) leading = num(ti.leading.as("pt"));
            } catch (e3) { leading = "auto"; }

            var tracking = "0";
            try { tracking = num(ti.tracking); } catch (e4) {}

            var font = "";
            try { font = ti.font; } catch (e5) {}

            var just = "left";
            try { just = justName(ti.justification); } catch (e6) {}

            var opacity = "100";
            try { opacity = num(L.opacity); } catch (e7) {}

            rows.push([
                esc(path + L.name),
                num(x),
                num(y),
                num(w),
                num(h),
                num(docW - (x + w)),          /* xRight - המרחק מהקצה הימני */
                esc(font),
                size,
                leading,
                tracking,
                just,
                hexOf(ti),
                opacity,
                (L.visible ? "1" : "0"),
                (isPara ? "para" : "point"),
                esc(ti.contents)
            ].join("\t"));

            found++;
        }

        for (j = 0; j < container.layerSets.length; j++) {
            var g = container.layerSets[j];
            collect(g, path + g.name + "/");
        }
    }

    /* ---------- הרצה ---------- */

    try {
        docW = doc.width.as("px");
        docH = doc.height.as("px");
        res  = doc.resolution;

        rows.push("#PSTEXT\t2\thttps://d85c.com/indi_ps");
        rows.push("#DOC\t" + num(docW) + "\t" + num(docH) + "\t" + num(res));
        rows.push("#COLS\tname\tx\ty\tw\th\txRight\tfont\tsize\tleading\ttracking\tjustify\tcolor\topacity\tvisible\tkind\ttext");

        collect(doc, "");

        if (found === 0) {
            alert("לא נמצאו שכבות טקסט במסמך.");
            return;
        }

        /* מיון מלמעלה למטה, ומימין לשמאל */
        var head = rows.slice(0, 3);
        var body = rows.slice(3);
        body.sort(function (a, b) {
            var A = a.split("\t"), B = b.split("\t");
            var dy = parseFloat(A[2]) - parseFloat(B[2]);
            if (Math.abs(dy) > 4) return dy;
            return parseFloat(B[1]) - parseFloat(A[1]);
        });
        rows = head.concat(body);

        var suggested;
        try {
            suggested = new File(doc.path + "/" + doc.name.replace(/\.[^.]+$/, "") + "_text.txt");
        } catch (ePath) {
            suggested = new File(Folder.desktop + "/ps_text.txt");
        }

        var f = suggested.saveDlg("שמרו את קובץ הטקסט");
        if (!f) return;
        if (!/\.txt$/i.test(f.fsName)) f = new File(f.fsName + ".txt");

        f.encoding = "UTF-8";
        f.lineFeed = "Unix";
        if (!f.open("w")) { alert("לא הצלחתי לפתוח את הקובץ לכתיבה."); return; }
        f.write("﻿" + rows.join("\n") + "\n");
        f.close();

        var msg = "נשמרו " + found + " שכבות טקסט.\n" + f.fsName;
        if (skippedPoint > 0) {
            msg += "\n\n⚠ " + skippedPoint + " שכבות הן טקסט נקודתי (point text).\n" +
                   "לתוצאה מדויקת יותר: לחיצה ימנית על השכבה > Convert to Paragraph Text, ולהריץ שוב.";
        }
        alert(msg);

    } catch (err) {
        alert("שגיאה: " + err.message + "\nשורה: " + err.line);
    } finally {
        app.preferences.rulerUnits = prevRuler;
        app.preferences.typeUnits  = prevType;
    }

})();
