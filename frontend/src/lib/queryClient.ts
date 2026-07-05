import { QueryClient } from '@tanstack/react-query'

/** Singleton so non-React code (map op resolution) can read cached data. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})
