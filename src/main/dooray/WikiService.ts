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
  constructor(private client: DoorayClient) {}

  // 접근 가능한 위키 도메인 목록
  async listDomains(): Promise<WikiDomain[]> {
    const res = await this.client.request<DoorayListResponse<WikiDomain>>(
      '/wiki/v1/wikis?size=50&page=0'
    )
    return res.result || []
  }

  // 위키 페이지 목록 (parentPageId가 없으면 루트, 있으면 하위)
  async list(wikiId: string, parentPageId?: string): Promise<DoorayWikiPage[]> {
    const params = parentPageId
      ? `parentPageId=${parentPageId}`
      : ''
    const res = await this.client.request<DoorayListResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages?${params}&size=100`
    )
    return res.result || []
  }

  // 특정 페이지 내용 조회
  async get(wikiId: string, pageId: string): Promise<DoorayWikiPage> {
    const res = await this.client.request<DoorayItemResponse<DoorayWikiPage>>(
      `/wiki/v1/wikis/${wikiId}/pages/${pageId}`
    )
    return res.result
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
  }
}
