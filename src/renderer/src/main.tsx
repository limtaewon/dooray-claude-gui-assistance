import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 앱 내 링크 클릭 시 외부 브라우저로 열기 (Electron 네비게이션 방지)
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
  if (!target) return
  const href = target.getAttribute('href')
  if (!href) return
  // 내부 앵커(#)는 허용
  if (href.startsWith('#')) return
  e.preventDefault()
  e.stopPropagation()
  // dooray:// 프로토콜은 웹 URL로 변환
  if (href.startsWith('dooray://')) {
    window.open(`https://nhnent.dooray.com`, '_blank')
  } else if (href.startsWith('http://') || href.startsWith('https://')) {
    window.open(href, '_blank')
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
