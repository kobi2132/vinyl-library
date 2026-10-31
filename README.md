# ספריית התקליטים שלי

אפליקציית ווב לניהול אוסף תקליטים אישי.

- התחברות עם Google, והספרייה נשמרת כקובץ JSON בתיקיית האפליקציה המוסתרת בדרייב (`appDataFolder`).
- סריקת ברקוד במצלמה (BarcodeDetector מובנה, או ZXing/WebAssembly באייפון) ושליפת פרטים מ-[MusicBrainz](https://musicbrainz.org) (עטיפות מ-[Cover Art Archive](https://coverartarchive.org)) ומ-[Discogs](https://www.discogs.com), שבו יש הרבה יותר תקליטים ישראליים. הבקשות ל-Discogs עוברות דרך Caddy בשרת (`/api/discogs/`), שמוסיף את הטוקן, כך שהטוקן לא מגיע לדפדפן.
- הוספה ידנית, עם מילוי אוטומטי לפי אמן ושם אלבום.
- חיפוש חופשי, מיון לפי אמן/אלבום/שנה/תאריך הוספה, סינון לפי ז'אנר ועשור, תצוגת עטיפות או רשימה.
- גיבוי ושחזור JSON, ייצוא CSV לאקסל.
- עובדת גם כאפליקציה מותקנת בטלפון (PWA) וגם בלי חיבור.

האתר: https://my-vinyl-library.jacob-apps.co.il

## פיתוח

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

מזהה ה-OAuth של גוגל נמצא ב-`src/config.ts` (אפשר לדרוס עם `VITE_GOOGLE_CLIENT_ID`).
## פריסה

כל push ל-`main` מריץ את `.github/workflows/deploy.yml`, שבונה את האפליקציה ושומר את התוצאה בענף `deploy`
(האתר בתיקייה `site/`, ולידו `docker-compose.yml`, `nginx.conf` ו-`Caddyfile.snippet`).
השרת מושך את הענף הזה כל דקה, כמו שאר האפליקציות ב-jacob-apps.co.il.

### התקנה על השרת (פעם אחת)

```bash
cd /srv/apps
git clone -b deploy https://github.com/kobi2132/vinyl-library.git vinyl
cd vinyl
docker compose up -d
```

אחר כך:

1. להוסיף את התוכן של `Caddyfile.snippet` ל-`/srv/proxy/Caddyfile` (עם `sudo tee -a`, הקובץ שייך ל-root), להחליף בו את `PUT_DISCOGS_TOKEN_HERE` בטוקן של Discogs, ולטעון מחדש את Caddy.
2. ב-DNS: רשומת A בשם `my-vinyl-library` אל 65.109.12.170.
3. עדכון אוטומטי ב-crontab:
   `* * * * * cd /srv/apps/vinyl && git fetch -q origin deploy && git reset -q --hard origin/deploy`
4. ב-Google Cloud, ב-OAuth client, להוסיף ל-Authorized JavaScript origins את `https://my-vinyl-library.jacob-apps.co.il`.
