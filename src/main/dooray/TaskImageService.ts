import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { DoorayClient } from './DoorayClient'
import type { TaskService } from './TaskService'
import {
  extractTaskImageRefs,
  imageFileName,
  parseDataUrl,
  type TaskImageRef
} from './taskImages'

/** 내려받은 이미지 하나 — 렌더러는 `path` 를 프롬프트에 붙인다. */
export interface TaskImageFile {
  fileId: string
  path: string
  alt?: string
}

export interface TaskImageResult {
  files: TaskImageFile[]
  /**
   * 상한에 걸려 못 받은 장수. 0 이 아니면 프롬프트에 그 사실을 밝힌다 —
   * 8장만 주면서 전부인 것처럼 넘기면 claude 가 "이게 다" 라고 가정한다.
   */
  omitted: number
}

/** 한 업무에서 가져올 이미지 상한. 스크린샷 20 장짜리 업무를 통째로 내리지 않는다. */
const MAX_IMAGES = 8

/**
 * 업무의 첨부 이미지를 로컬 파일로 내려둔다.
 *
 * claude 는 프롬프트 안의 **파일 경로**로만 그림을 읽는다. 두레이 이미지는 인증이 필요한
 * URL 이라 경로를 그대로 넘길 수 없어(claude 가 받아올 수 없다), 여기서 미리 받아 디스크에
 * 놓고 그 경로를 넘긴다.
 *
 * 실패는 삼키고 성공한 것만 돌려준다 — 그림 하나를 못 받았다고 업무 시작 자체가 막히면
 * 드래그&드롭 흐름이 통째로 무너진다.
 */
export class TaskImageService {
  constructor(
    private client: DoorayClient,
    private tasks: TaskService,
    /** 이미지를 풀어놓을 뿌리 폴더 (보통 userData/task-images) */
    private baseDir: string
  ) {}

  /**
   * 이미지가 붙을 수 있는 곳은 본문과 댓글 둘 다 — 한 번에 훑는다.
   * 한쪽 조회가 실패해도 다른 쪽 그림은 살린다(댓글을 못 읽었다고 본문 스크린샷까지 버릴 이유가 없다).
   */
  private async collectSources(projectId: string, taskId: string): Promise<(string | undefined)[]> {
    const [detail, comments] = await Promise.all([
      this.tasks.getTaskDetail(projectId, taskId).catch(() => null),
      this.tasks.getTaskComments(projectId, taskId).catch(() => [])
    ])
    return [detail?.body?.content, ...comments.map((c) => c.body?.content)]
  }

  async download(projectId: string, taskId: string): Promise<TaskImageResult> {
    const refs: TaskImageRef[] = extractTaskImageRefs(await this.collectSources(projectId, taskId))
    if (refs.length === 0) return { files: [], omitted: 0 }

    const targets = refs.slice(0, MAX_IMAGES)
    const omitted = refs.length - targets.length
    if (omitted > 0) {
      console.log(`[TaskImages] ${refs.length}개 중 ${targets.length}개만 내려받습니다`)
    }

    const dir = join(this.baseDir, `${projectId}-${taskId}`)
    await mkdir(dir, { recursive: true })

    const saved = await Promise.all(targets.map((ref) => this.saveOne(dir, projectId, taskId, ref)))
    return { files: saved.filter((file): file is TaskImageFile => file !== null), omitted }
  }

  private async saveOne(
    dir: string,
    projectId: string,
    taskId: string,
    ref: TaskImageRef
  ): Promise<TaskImageFile | null> {
    try {
      const dataUrl = await this.client.fetchBinary(`/files/${ref.fileId}`, { projectId, postId: taskId })
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) return null
      // 이미지가 아닌 첨부(문서 등)까지 claude 에 넘기면 "읽을 수 없다" 만 늘어난다.
      if (!parsed.mime.startsWith('image/')) return null
      const path = join(dir, imageFileName(ref, parsed.mime))
      await writeFile(path, parsed.data)
      return { fileId: ref.fileId, path, alt: ref.alt }
    } catch (err) {
      console.warn(
        `[TaskImages] ${ref.fileId} 내려받기 실패:`,
        err instanceof Error ? err.message : err
      )
      return null
    }
  }
}
