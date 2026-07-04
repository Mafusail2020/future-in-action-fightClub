/** Tiny shared states: spinner, empty, error. One file — they travel together. */

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-6 text-muted" role="status">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-line border-t-amber"
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1.5 text-xs font-medium text-paper underline underline-offset-2 hover:text-amber"
        >
          Спробувати ще раз
        </button>
      )}
    </div>
  )
}
