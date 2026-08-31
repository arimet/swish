import { QueryClientProvider } from '@tanstack/react-query'
import {
  render as rtlRender, renderHook as rtlRenderHook,
  type RenderHookOptions, type RenderOptions,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { WriteBridge, makeQueryClient } from '../persistence/queries'

/**
 * Testing Library's `render` and `renderHook`, with the query client every screen and
 * every hook now needs.
 *
 * The tests mount screens and hooks directly rather than the whole application, so they
 * sit below the provider `main.tsx` mounts. Without this they throw "No QueryClient
 * set" — which says nothing about the screen under test.
 *
 * **A client per call**, never shared: a cache surviving between two cases is a test
 * that passes on the previous case's data. The store the fake API keeps is emptied by
 * `setupTests` for the same reason; this is that rule applied to the layer above it.
 *
 * **Nothing counts as fresh.** In production a read holds for thirty seconds; under
 * test a re-render that skips the fetch is a case reading the previous assertion's
 * data. `staleTime: 0` is the only default this changes — retries are already off in
 * production, for the reason given in `queries.ts`.
 *
 * `WriteBridge` is mounted too: a test that writes and then expects the screen to
 * follow is testing the invalidation as much as the screen, and that is the behaviour
 * the application has.
 */
function harness() {
  const client = makeQueryClient({ staleTime: 0 })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WriteBridge />
      {children}
    </QueryClientProvider>
  )
  return { client, Wrapper }
}

export function render(ui: ReactElement, options?: RenderOptions) {
  const { client, Wrapper } = harness()
  return { ...rtlRender(ui, { wrapper: Wrapper, ...options }), client }
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  const { client, Wrapper } = harness()
  return { ...rtlRenderHook(hook, { wrapper: Wrapper, ...options }), client }
}

/* Everything else comes straight from Testing Library, so a test file needs one
   import and not two. The two functions above shadow the re-exported ones. */
export * from '@testing-library/react'
