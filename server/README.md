# vinyl-api

שירות קטן שמקבל פניות מטופס "צור קשר", סטטיסטיקות שימוש אנונימיות, ומגיש את הנתונים לעמוד המפתח.
בלי תלויות: Node 22 בלבד (`node:http`, `node:sqlite`, `node:crypto`).

- רץ בקונטיינר `vinyl-api` (ראו `deploy/docker-compose.yml`), ו-Caddy מעביר אליו את `/api/app/*`.
- מסד הנתונים והמלח (salt) נשמרים ב-`/srv/apps/vinyl/data`, שלא נמצא ב-git, כך שעדכונים לא נוגעים בהם.
- `node --watch` מפעיל את השירות מחדש כשענף ה-deploy מביא גרסה חדשה.
- כל בקשה לעמוד המפתח נבדקת מול Google: רק `ADMIN_EMAIL` מקבל נתונים.

## פיתוח מקומי

```bash
DATA_DIR=./data node --disable-warning=ExperimentalWarning server/server.mjs   # פורט 8080
npm run dev                                                                    # מעביר /api/app אל 8080
```

## נקודות קצה

| שיטה | נתיב | מה |
|---|---|---|
| POST | `/api/app/events` | אירועי שימוש (מזהה מכשיר, שם פיצ'ר, גודל ספרייה) |
| POST | `/api/app/contact` | פנייה חדשה. עד 5 ביום ממכשיר |
| GET | `/api/app/admin/summary` · `stats?since=` · `users?since=` · `info` · `messages` | עמוד המפתח |
| PATCH / DELETE | `/api/app/admin/messages/:id` | סימון טופל / מחיקה |
