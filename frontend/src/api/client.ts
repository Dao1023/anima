import type {
  AddTaskPayload,
  SnoozeOptionsResponse,
  TagsResponse,
  TaskDetail,
  TasksResponse,
  UpdateTaskPayload,
} from '@/types'

/**
 * 拉取面板数据。生产模式同源(maid-dashboard 托管)。
 * 失败时抛错,由调用方用 el-message 提示。
 */
export async function fetchTasks(): Promise<TasksResponse> {
  const res = await fetch('/api/tasks', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`请求失败:${res.status} ${res.statusText}`)
  }
  return (await res.json()) as TasksResponse
}

/** 拉取单任务详情。404 时抛错,由调用方提示。 */
export async function fetchTaskDetail(id: string): Promise<TaskDetail> {
  const res = await fetch(`/api/tasks/${id}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? '任务不存在' : `请求失败:${res.status} ${res.statusText}`)
  }
  return (await res.json()) as TaskDetail
}

/** 拉取任务的提醒记录(已按时间倒序)。V4.2 由女仆本人提醒,暂无推送流水。 */
export async function fetchTaskPushes(id: string): Promise<{ pushes: never[] }> {
  void id
  return { pushes: [] }
}

/** 任务动作(完成/关闭),统一走 POST /api/tasks/{id}/{action}。可带 note 留言。 */
async function postAction(id: string, action: 'done' | 'close', note?: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note ? { note } : {}),
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? '任务不存在' : `操作失败:${res.status} ${res.statusText}`)
  }
}

/** 完成任务(周期任务自动克隆下一个)。note 为留言。 */
export const doneTask = (id: string, note?: string) => postAction(id, 'done', note)
/** 关闭任务(不再催,周期任务不再克隆)。 */
export const closeTask = (id: string) => postAction(id, 'close')

/** 推迟任务。until 为 'YYYY-MM-DD HH:MM' 字符串,缺省 1 小时;note 为留言。 */
export async function snoozeTask(id: string, until?: string, note?: string): Promise<void> {
  const body: Record<string, string> = {}
  if (until !== undefined) body.until = until
  if (note) body.note = note
  const res = await fetch(`/api/tasks/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? '任务不存在' : `操作失败:${res.status} ${res.statusText}`)
  }
}

/** 拉取某任务的推迟选项(start=预期×系数,end=剩余×系数);taskId 缺省给兜底。 */
export async function fetchSnoozeOptions(taskId?: string): Promise<SnoozeOptionsResponse> {
  const url = taskId ? `/api/snooze-options?task_id=${encodeURIComponent(taskId)}` : '/api/snooze-options'
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`请求失败:${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SnoozeOptionsResponse
}

/** 清除推迟(恢复正常催促节奏)。 */
export async function unsnoozeTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/snooze`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`恢复失败:${res.status} ${res.statusText}`)
  }
}

/** 新增任务。成功返回 { task_id, title }。 */
export async function addTask(payload: AddTaskPayload): Promise<{ task_id: string }> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`新增失败:${res.status} ${res.statusText}`)
  }
  return (await res.json()) as { task_id: string }
}

/** 编辑任务(只传要改的字段)。 */
export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? '任务不存在' : `保存失败:${res.status} ${res.statusText}`)
  }
}

/** 读后端 400 的 detail(中文提示)给调用方展示。 */
async function _detail(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.detail ?? `请求失败:${res.status}`
}

/** 完整标签树(管理页)。 */
export async function fetchTags(): Promise<TagsResponse> {
  const res = await fetch('/api/tags', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(await _detail(res))
  return (await res.json()) as TagsResponse
}

/** 建标签;parentId 缺省=根级。重名/防环抛后端中文提示。 */
export async function createTag(name: string, parentId?: number | null): Promise<{ id: number }> {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId ?? null }),
  })
  if (!res.ok) throw new Error(await _detail(res))
  return (await res.json()) as { id: number }
}

/** 改标签:改名 / 移父(parentId 传 null=回根级)。不传=不动。 */
export async function updateTag(id: number, patch: { name?: string; parent_id?: number | null }): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? '标签不存在' : await _detail(res))
  }
}

/** 删标签:子标签提升到它的父级 + 任务断关联。 */
export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`删除失败:${res.status}`)
  }
}
