export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { signal })
  if (!response.ok) {
    throw new ApiError(`Запит не вдався (${response.status})`, response.status)
  }
  return response.json() as Promise<T>
}
