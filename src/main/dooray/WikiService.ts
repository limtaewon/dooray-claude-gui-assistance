import { DoorayClient } from './DoorayClient'
import type { DoorayWikiPage, DoorayWikiUpdateParams } from '../../shared/types/dooray'

interface DoorayListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T[]
  totalCount: number
}

interface DoorayItemResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T
}

interface WikiDomain {
  id: string
  name: string
  type: string
}

export class WikiService {
  private domainsCache: { data: WikiDomain[]; timestamp: number } | null = null
  private pageListCache = new Map<string, { pages: DoorayWikiPage[]; timestamp: number }>()
  private static LIST_TTL = 3 * 60 * 1000 // 3분

  constructor(private client: DoorayClient) {}

  // 접근 가능한 위키 도메인 목록 (3분 캐시)
  async listDomains(): Promise<WikiDomain[]> {
    if (this.domainsCache && Date.now() - this.domainsCache.timestamp < WikiService.LIST_TTL) {
      return this.domainsCache.data
    }
    const res = await this.client.request<DoorayListResponse<WikiDomain>>(
      '/wiki/v1/wikis?size=50&page=0'
    )
    const data = res.result || []
    this.domainsCache = { data, timestamp: Date.now() }
    return data
  }

  // 위키 페이지 목록 (병렬 페이지네이션 + TTL 캐시)
  async list(wikiId: string, parentPageId?: string): Promise<DoorayWikiPage[]> {
    const cacheKey = `${wikiId}|${parentPageId || 'root'}`
    const cached = this.pageListCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < WikiService.LIST_TTL) {
      return cached.pages
    }

    const size = 100
    const MAX_PAGES = 5
    const baseParams = parentPageId ? `parentPageId=${parentPageId}&` : ''

    // 첫 페이지로 totalCount 확인
    const firstRes = await this.client.request<DoorayListResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages?${baseParams}size=${size}&page=0`
    ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))

    const firstPageItems = firstRes.result || []
    const totalCount = firstRes.totalCount || firstPageItems.length
    const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / size))

    // 나머지 페이지 병렬 호출
    const remaining: number[] = []
    for (let p = 1; p < totalPages; p++) remaining.push(p)

    const rest = await Promise.all(
      remaining.map((page) =>
        this.client.request<DoorayListResponse<DoorayWikiPage>>(
          `/wiki/v1/wikis/${wikiId}/pages?${baseParams}size=${size}&page=${page}`
        ).catch(() => ({ header: { resultCode: 0, isSuccessful: false }, result: [], totalCount: 0 }))
      )
    )

    const allPages: DoorayWikiPage[] = [...firstPageItems]
    for (const r of rest) {
      if (r.result) allPages.push(...r.result)
    }

    this.pageListCache.set(cacheKey, { pages: allPages, timestamp: Date.now() })
    return allPages
  }

  // 특정 페이지 내용 조회
  async get(wikiId: string, pageId: string): Promise<DoorayWikiPage> {
    const res = await this.client.request<DoorayItemResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}`
    )
    return res.result
  }

  // 새 위키 페이지 생성 (parentPageId 아래 하위 페이지)
  async create(params: { wikiId: string; parentPageId?: string; subject: string; body: string }): Promise<{ id: string }> {
    const res = await this.client.request<DoorayItemResponse<{ id: string }>>(
      `/wiki/v1/wikis/${params.wikiId}/pages`,
      {
        method: 'POST',
        body: JSON.stringify({
          parentPageId: params.parentPageId,
          subject: params.subject,
          body: { mimeType: 'text/x-markdown', content: params.body }
        })
      }
    )
    // 목록 캐시 무효화
    this.pageListCache.clear()
    return { id: res.result.id }
  }

  // Dooray 위키는 페이지 DELETE가 불가 — 제목만 재설정(소프트 삭제용)
  async renameTitle(wikiId: string, pageId: string, subject: string): Promise<void> {
    await this.client.request(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}/title`,
      {
        method: 'PUT',
        body: JSON.stringify({ subject })
      }
    )
    this.pageListCache.clear()
  }

  // 페이지 수정 - dooray API는 제목/내용을 분리 업데이트
  async update(params: DoorayWikiUpdateParams): Promise<void> {
    // 제목 업데이트
    if (params.title) {
      await this.client.request(
        `/wiki/v1/wikis/${params.projectId}/pages/${params.pageId}/title`,
        {
          method: 'PUT',
          body: JSON.stringify({ subject: params.title })
        }
      )
    }

    // 내용 업데이트
    if (params.body) {
      await this.client.request(
        `/wiki/v1/wikis/${params.projectId}/pages/${params.pageId}/content`,
        {
          method: 'PUT',
          body: JSON.stringify({
            body: {
              mimeType: 'text/x-markdown',
              content: params.body
            }
          })
        }
      )
    }
    // 캐시 무효화 (수정된 페이지의 목록 캐시 제거)
    this.pageListCache.clear()
  }
}
