import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from './Icons'
import { useBack } from '../lib/back'

export function Modal({
  title,
  onClose,
  children,
  wide,
  actions,
  hideTitle,
  onBack,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Icon buttons shown in the header, next to the close button */
  actions?: ReactNode
  /** Keep the title for screen readers only (when the page shows it large anyway) */
  hideTitle?: boolean
  /** The phone's Back button; closes the sheet unless given. Return true to stay open. */
  onBack?: () => boolean | void
}) {
  useBack(true, onBack ?? onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2 className={hideTitle ? 'sr-only' : undefined}>{title}</h2>
          {actions && <div className="modal-actions">{actions}</div>}
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
