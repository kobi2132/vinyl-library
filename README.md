# ספריית התקליטים שלי

אפליקציית ווב לניהול אוסף תקליטים אישי.

- התחברות עם Google, והספרייה נשמרת כקובץ JSON בתיקיית האפליקציה המוסתרת בדרייב (`appDataFolder`).
- סריקת ברקוד במצלמה (BarcodeDetector מובנה, או ZXing/WebAssembly באייפון) ושליפת פרטים מ-[MusicBrainz](https://musicbrainz.org) ועטיפות מ-[Cover Art Archive](https://coverartarchive.org).
- הוספה ידנית, עם מילוי אוטומטי לפי אמן ושם אלבום.
- חיפוש חופשי, מיון לפי אמן/אלבום/שנה/תאריך הוספה, סינון לפי ז'אנר ועשור, תצוגת עטיפות או רשימה.
- גיבוי ושחזור JSON, ייצוא CSV לאקסל.
- עובדת גם כאפליקציה מותקנת בטלפון (PWA) וגם בלי חיבור.

האתר: https://kobi2132.github.io/vinyl-library/

## פיתוח

```bash
npm install
npm run dev      # http://localhost:5173/vinyl-library/
npm run build
```

מזהה ה-OAuth של גוגל נמצא ב-`src/config.ts` (אפשר לדרוס עם `VITE_GOOGLE_CLIENT_ID`).
כל push ל-`main` נפרס אוטומטית ל-GitHub Pages דרך `.github/workflows/deploy.yml`.
