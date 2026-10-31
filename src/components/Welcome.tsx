import { isConfigured } from '../lib/google'

const FEATURES = [
  { icon: '▥', title: 'סריקת ברקוד', text: 'מכוונים את המצלמה לגב העטיפה, והאמן, האלבום, השנה, הלייבל, רשימת השירים והעטיפה נכנסים לבד.' },
  { icon: '✎', title: 'הוספה ידנית', text: 'אין ברקוד? מקלידים אמן ושם אלבום ומקבלים את הפרטים, או ממלאים הכל בעצמכם.' },
  { icon: '⌕', title: 'חיפוש ומיון', text: "חיפוש לפי אמן, אלבום או שיר. מיון לפי א-ב, שנה או תאריך הוספה, וסינון לפי ז'אנר ועשור." },
  { icon: '☁', title: 'שמור בדרייב שלך', text: 'הספרייה נשמרת בתיקייה מוסתרת של האפליקציה ב-Google Drive שלכם ומסתנכרנת בין הטלפון למחשב.' },
  { icon: '⇩', title: 'ייצוא לאקסל ו-PDF', text: 'רשימה מסודרת של האוסף להדפסה, לביטוח או לשיתוף עם חברים.' },
  { icon: '✈', title: 'עובדת גם בלי אינטרנט', text: 'מתקינים על מסך הבית כמו אפליקציה, ומשתמשים בה גם בחנות התקליטים בלי קליטה.' },
]

export function Welcome({ onGoogle, onLocal, error }: { onGoogle: () => void; onLocal: () => void; error: string | null }) {
  const ready = isConfigured()
  return (
    <div className="landing">
      <header className="hero">
        <img className="hero-logo" src="/logo.svg" alt="" width="112" height="112" />
        <h1>ספריית התקליטים שלי</h1>
        <p className="hero-en" lang="en" dir="ltr">
          My Vinyl Library
        </p>
        <p className="lead">סורקים את הברקוד, והתקליט נכנס לאוסף עם כל הפרטים. כל האוסף שלכם במקום אחד, מסודר, בטלפון ובמחשב.</p>
        {error && <p className="notice error">{error}</p>}
        <button className="btn google" onClick={onGoogle} disabled={!ready}>
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          התחברות עם Google
        </button>
        {!ready && <p className="hint">ההתחברות עם גוגל עוד לא הוגדרה באתר הזה.</p>}
        <button className="link-btn" onClick={onLocal}>
          לנסות בלי חשבון (נשמר רק במכשיר הזה)
        </button>
      </header>

      <section className="features" aria-label="מה אפשר לעשות">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <span className="feature-icon" aria-hidden="true">
              {f.icon}
            </span>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <section className="data-note">
        <h2>מה קורה עם המידע שלכם</h2>
        <p>
          כשמתחברים עם Google, האפליקציה מבקשת שתי הרשאות בלבד: את השם והמייל שלכם, כדי להראות לאיזה חשבון אתם מחוברים, וגישה לתיקייה המוסתרת של
          האפליקציה ב-Google Drive, כדי לשמור שם את רשימת התקליטים ולסנכרן בין המכשירים. לאפליקציה אין גישה לשום קובץ אחר ב-Drive. אין לנו שרת ששומר
          את הספרייה שלכם, אין פרסומות ואין מעקב. הפרטים המלאים ב<a href="/privacy.html">מדיניות הפרטיות</a>.
        </p>
      </section>

      <footer className="landing-foot">
        <a href="/about.html">אודות</a>
        <a href="/privacy.html">מדיניות פרטיות</a>
        <a href="/terms.html">תנאי שימוש</a>
        <a href="https://github.com/kobi2132/vinyl-library/issues" target="_blank" rel="noopener">יצירת קשר</a>
        <a href="https://jacob-apps.co.il">jacob-apps.co.il</a>
      </footer>
    </div>
  )
}
