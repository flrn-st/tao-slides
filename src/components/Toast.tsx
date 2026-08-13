import { useEffect, useState } from 'react'
import { subscribeToast, type ToastMessage } from '../lib/toast'

export default function Toast() {
  const [current, setCurrent] = useState<ToastMessage | null>(null)

  useEffect(() => subscribeToast(setCurrent), [])

  if (!current) return null

  return (
    <div className="toast-stack" role="status">
      <div className={'toast' + (current.tone === 'error' ? ' error' : '')}>{current.message}</div>
    </div>
  )
}
