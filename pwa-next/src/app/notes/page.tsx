'use client'

import dynamic from 'next/dynamic'

const Notes = dynamic(() => import('@/page/Notes'), { ssr: false })

const NotesPage = () => {
  return <Notes />
}

export default NotesPage
