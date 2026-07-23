'use client'

import dynamic from 'next/dynamic'

const Notes = dynamic(() => import('@/page/Notes'), { ssr: false })

export default function NotesPage() {
  return <Notes />
}
