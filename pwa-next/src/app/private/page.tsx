'use client'

import { useState } from 'react'
import Privacy from '@/page/Privacy'

const PrivatePage = () => {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="h-dvh overflow-y-auto bg-stone-50 dark:bg-gray-900 transition-colors">
        <Privacy darkMode={darkMode} onToggleDark={() => setDarkMode(!darkMode)} />
      </div>
    </div>
  )
}

export default PrivatePage
