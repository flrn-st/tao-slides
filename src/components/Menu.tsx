import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MenuProps {
  label?: ReactNode
  icon?: string
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  disabled?: boolean
}

export default function Menu({ label, icon, children, align = 'left', className, disabled }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={'menu ' + (className ?? '')} ref={ref}>
      <button
        className={'tool-btn' + (open ? ' active' : '')}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && (
          <span className="menu-title-icon">
            <i data-icon={icon} />
          </span>
        )}
        {label && <span className="menu-label">{label}</span>}
        <span className="menu-caret">▾</span>
      </button>
      {open && (
        <div className={`menu-popup ${align === 'right' ? 'menu-popup-right' : ''}`} onClick={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  disabled,
  checked,
  danger,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  checked?: boolean
  danger?: boolean
  icon?: string
}) {
  return (
    <button
      className={'menu-item' + (danger ? ' danger' : '')}
      disabled={disabled}
      onClick={() => !disabled && onClick?.()}
    >
      <span className="menu-item-icon">{checked ? '✓' : icon ? '' : ''}</span>
      <span className="menu-item-text">{children}</span>
      {checked != null && <span className="menu-item-checked">{checked ? '✓' : ''}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="menu-sep" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label-header">{children}</div>
}