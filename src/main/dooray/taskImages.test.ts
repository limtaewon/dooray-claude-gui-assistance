import { describe, it, expect } from 'vitest'
import {
  extensionForMime,
  extractTaskImageRefs,
  imageFileName,
  parseDataUrl
} from './taskImages'

describe('extractTaskImageRefs', () => {
  it('마크다운 이미지에서 파일 id 와 alt 를 뽑는다 (두레이 QA 업무의 실제 표기)', () => {
    const body =
      '| 디자인 | 리뉴얼 현 적용 |\n| --- | --- |\n' +
      '| ![Inline-image-2026-07-29 21.05.08.770.png](/files/4387432480485153538) ' +
      '| ![두번째.png](/files/4387432131280086578) |'
    expect(extractTaskImageRefs([body])).toEqual([
      { fileId: '4387432480485153538', alt: 'Inline-image-2026-07-29 21.05.08.770.png' },
      { fileId: '4387432131280086578', alt: '두번째.png' }
    ])
  })

  it('html 본문의 <img> 도 훑는다 — 두레이 본문은 마크다운과 html 이 섞여 온다', () => {
    const html = '<div><img src="/files/123" alt="스크린샷"><img alt="뒤에온alt" src="/files/456"></div>'
    expect(extractTaskImageRefs([html])).toEqual([
      { fileId: '123', alt: '스크린샷' },
      { fileId: '456', alt: '뒤에온alt' }
    ])
  })

  it('본문과 댓글에 같은 파일이 겹치면 한 번만 남긴다', () => {
    const refs = extractTaskImageRefs([
      '![a](/files/999)',
      '댓글에서 다시: ![a](/files/999)',
      '![b](/files/1000)'
    ])
    expect(refs.map((r) => r.fileId)).toEqual(['999', '1000'])
  })

  it('이미지가 아닌 링크(첨부 파일 링크)는 집지 않는다', () => {
    expect(extractTaskImageRefs(['[명세서.xlsx](/files/777)'])).toEqual([])
  })

  it('빈 본문·undefined 를 섞어 줘도 터지지 않는다', () => {
    expect(extractTaskImageRefs([undefined, '', undefined])).toEqual([])
  })

  it('alt 가 비어 있으면 alt 없이 돌려준다', () => {
    expect(extractTaskImageRefs(['![](/files/321)'])).toEqual([{ fileId: '321', alt: undefined }])
  })
})

describe('imageFileName', () => {
  it('alt 의 공백을 없앤다 — 경로에 공백이 있으면 프롬프트에서 끊긴다', () => {
    const name = imageFileName(
      { fileId: '42', alt: 'Inline-image-2026-07-29 21.05.08.770.png' },
      'image/png'
    )
    expect(name).not.toContain(' ')
    expect(name).toContain('42')
    expect(name.endsWith('.png')).toBe(true)
  })

  it('한글 alt 는 살린다', () => {
    expect(imageFileName({ fileId: '7', alt: '재현화면.png' }, 'image/png')).toBe('재현화면-7.png')
  })

  it('alt 가 없으면 파일 id 로 이름을 만든다', () => {
    expect(imageFileName({ fileId: '7' }, 'image/jpeg')).toBe('image-7.jpg')
  })

  it('경로 구분자를 이름에 남기지 않는다', () => {
    const name = imageFileName({ fileId: '9', alt: '../../etc/passwd' }, 'image/png')
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
  })
})

describe('extensionForMime', () => {
  it('아는 mime 은 그 확장자, 모르면 png 로 떨어진다', () => {
    expect(extensionForMime('image/png')).toBe('.png')
    expect(extensionForMime('IMAGE/JPEG')).toBe('.jpg')
    expect(extensionForMime('image/heic')).toBe('.png')
  })
})

describe('parseDataUrl', () => {
  it('mime 과 바이트를 가른다', () => {
    const parsed = parseDataUrl('data:image/png;base64,aGVsbG8=')
    expect(parsed?.mime).toBe('image/png')
    expect(parsed?.data.toString('utf-8')).toBe('hello')
  })

  it('data URL 이 아니면 null', () => {
    expect(parseDataUrl('https://example.com/a.png')).toBeNull()
  })
})
