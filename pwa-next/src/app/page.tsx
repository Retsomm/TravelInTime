'use client'

import dynamic from 'next/dynamic'

const App = dynamic(() => import('@/App'), { ssr: false })

const Home = () => {
  return <App />
}

export default Home
