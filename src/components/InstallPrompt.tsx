import { useEffect, useState } from 'react'
import { canPromptInstall, isIosSafari, onInstallChange, platform, promptInstall, snoozeInstall } from '../lib/install'

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
  </svg>
)
const PlusBoxIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
)
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

export function InstallPrompt({ onClose }: { onClose: () => void }) {
  const os = platform()
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), [])

  const later = () => {
    snoozeInstall()
    onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && later()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const install = async () => {
    await promptInstall()
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && later()}>
      <div className="modal install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title">
        <div className="install-hero">
          <img src="/icon-192.png" alt="" width="72" height="72" />
          <h2 id="install-title">התקינו את האפליקציה בטלפון</h2>
          <p>אייקון במסך הבית, פתיחה במסך מלא וסריקה מהירה יותר, בלי לחפש את האתר בדפדפן.</p>
        </div>

        {os === 'android' && canPrompt && (
          <div className="install-actions">
            <button className="btn primary big wide" onClick={install}>
              התקנה
            </button>
            <button className="link-btn" onClick={later}>
              לא עכשיו
            </button>
          </div>
        )}

        {os === 'android' && !canPrompt && (
          <>
            <ol className="install-steps">
              <li>
                <span className="step-icon"><DotsIcon /></span>
                <span>פתחו את תפריט הדפדפן (שלוש הנקודות למעלה)</span>
              </li>
              <li>
                <span className="step-icon"><PlusBoxIcon /></span>
                <span>
                  בחרו <b>התקנת אפליקציה</b> או <b>הוספה למסך הבית</b>
                </span>
              </li>
            </ol>
            <div className="install-actions">
              <button className="btn primary big wide" onClick={later}>
                הבנתי
              </button>
            </div>
          </>
        )}

        {os === 'ios' && (
          <>
            {!isIosSafari() && <p className="notice install-note">באייפון ההתקנה עובדת הכי טוב מ-Safari. פתחו את האתר ב-Safari ואז:</p>}
            <ol className="install-steps">
              <li>
                <span className="step-icon"><ShareIcon /></span>
                <span>
                  הקישו על כפתור <b>השיתוף</b> בתחתית המסך
                </span>
              </li>
              <li>
                <span className="step-icon"><PlusBoxIcon /></span>
                <span>
                  גללו ובחרו <b>הוספה למסך הבית</b>
                </span>
              </li>
              <li>
                <span className="step-icon step-text">הוסף</span>
                <span>
                  הקישו <b>הוסף</b> בפינה העליונה, והאייקון יופיע במסך הבית
                </span>
              </li>
            </ol>
            <div className="install-actions">
              <button className="btn primary big wide" onClick={later}>
                הבנתי
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
