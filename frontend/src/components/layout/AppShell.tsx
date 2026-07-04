import { useState } from 'react'

import { useChatStore } from '../../stores/chatStore'
import { ChatPanel } from '../chat/ChatPanel'
import { CityPanel } from '../city/CityPanel'
import { WorldMap } from '../map/WorldMap'

/**
 * Desktop ≥1280: map + docked chat column (map resizes when chat collapses).
 * 768–1280: chat overlays the map as a right drawer.
 * <768: bottom tab bar switches full-screen Map | Chat.
 */
export function AppShell() {
  const chatOpen = useChatStore((s) => s.chatOpen)
  const toggleChat = useChatStore((s) => s.toggleChat)
  const [mobileView, setMobileView] = useState<'map' | 'chat'>('map')

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1">
        {/* Map zone (always mounted so the globe survives tab switches) */}
        <main
          aria-label="Мапа міст і даних"
          className={`relative min-w-0 flex-1 ${mobileView === 'chat' ? 'max-md:invisible' : ''}`}
        >
          <WorldMap />

          {/* Brand chip */}
          <div className="pointer-events-none absolute top-3 left-3 z-10 max-md:left-1/2 max-md:-translate-x-1/2">
            <div className="rounded-lg border border-line bg-ink-900/90 px-3 py-1.5 backdrop-blur">
              <p className="font-display text-[13px] font-semibold tracking-[0.08em]">
                ЖИТОМИР · РАДНИК
              </p>
              <p className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                дані міста · рішення світу
              </p>
            </div>
          </div>

          <CityPanel />

          {/* Reopen chat (desktop/tablet, when collapsed) */}
          {!chatOpen && (
            <button
              type="button"
              onClick={toggleChat}
              aria-label="Відкрити чат"
              className="absolute top-3 right-3 z-10 rounded-lg border border-amber/50 bg-ink-900/90 px-3 py-2 font-display text-sm font-medium text-amber backdrop-blur transition-colors hover:bg-amber hover:text-ink-950 max-md:hidden"
            >
              « Радник
            </button>
          )}
        </main>

        {/* Chat zone: docked ≥1280, drawer 768–1280, tab <768 */}
        <div
          className={`
            h-full w-[400px] shrink-0 transition-[width] duration-200
            ${chatOpen ? '' : 'lg:w-0 lg:overflow-hidden'}
            max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:z-20 max-lg:shadow-2xl
            ${chatOpen ? '' : 'max-lg:hidden'}
            max-md:static max-md:w-full max-md:shadow-none
            ${mobileView === 'chat' ? 'max-md:block' : 'max-md:hidden'}
          `}
        >
          <ChatPanel />
        </div>
      </div>

      {/* Mobile tab bar */}
      <nav
        aria-label="Розділи"
        className="hidden shrink-0 border-t border-line bg-ink-900 max-md:flex"
      >
        {(
          [
            ['map', 'Мапа'],
            ['chat', 'Радник'],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => setMobileView(view)}
            aria-current={mobileView === view ? 'page' : undefined}
            className={`flex-1 py-3 font-display text-sm font-medium transition-colors ${
              mobileView === view ? 'text-amber' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
