import { Home, PanelLeft } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useChatStore } from '../../stores/chatStore'
import { useMapStore } from '../../stores/mapStore'
import { ProblemsDropdown } from '../catalog/ProblemsDropdown'
import { ChatCanvas } from '../chat/ChatCanvas'
import { Sidebar } from '../chat/Sidebar'
import { CityPanel } from '../city/CityPanel'
import { DossierPanel } from '../city/DossierPanel'
import { MapModeControls } from '../map/MapModeControls'
import { WorldMap } from '../map/WorldMap'

/**
 * The map is a FIXED full-viewport canvas layer — sidebar, chat and panels
 * float above it and only cover parts of it. Collapsing the sidebar or
 * dragging the chat divider never resizes (and never re-lays-out) the map.
 */
export function AppShell() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const toggleSidebar = useChatStore((s) => s.toggleSidebar)
  const chatWidth = useChatStore((s) => s.chatWidth)
  const setChatWidth = useChatStore((s) => s.setChatWidth)
  const [mobileView, setMobileView] = useState<'chat' | 'map'>('chat')
  const [dragging, setDragging] = useState(false)

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setDragging(true)
      const onMove = (ev: PointerEvent) => {
        const width = window.innerWidth - ev.clientX
        setChatWidth(Math.min(Math.max(width, 360), Math.round(window.innerWidth * 0.65)))
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [setChatWidth],
  )

  return (
    <div
      className={`flex h-dvh flex-col overflow-hidden bg-bg-main ${
        dragging ? 'cursor-col-resize select-none' : ''
      }`}
    >
      <div className="relative min-h-0 flex-1">
        {/* Fixed map canvas — never moves, never resizes. `isolate` traps the
            z-indexes of map markers inside this layer so they can never paint
            over the sidebar/chat that overlay it. */}
        <div
          className={`absolute inset-0 isolate ${mobileView === 'chat' ? 'max-md:invisible' : ''}`}
          aria-label="Мапа міст і рішень"
        >
          <WorldMap />
        </div>

        {/* Overlay row: transparent to the map except its own children */}
        <div className="pointer-events-none relative flex h-full">
          {/* Sidebar */}
          <div
            className={`pointer-events-auto h-full transition-[margin] duration-200 ease-out max-md:absolute max-md:top-0 max-md:left-0 max-md:z-30 max-md:shadow-2xl ${
              sidebarOpen ? '' : 'max-md:-translate-x-full md:-ml-[288px]'
            } max-md:transition-transform`}
          >
            <Sidebar />
          </div>
          {/* Drawer backdrop (mobile only) */}
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Закрити меню"
              onClick={toggleSidebar}
              className="pointer-events-auto absolute inset-0 z-20 hidden bg-ink-950/60 max-md:block"
            />
          )}

          {/* Map window: uncovered area between sidebar and chat; panels float here */}
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-auto contents">
              <CityPanel />
              <DossierPanel />
              {/* Corner stack: dropdown trigger with the home button right under it */}
              <div className="absolute top-4 left-4 z-10 flex w-fit flex-col gap-2">
                <ProblemsDropdown />
                <HomeButton />
              </div>
              <MapModeControls />
            </div>
          </div>

          {/* Draggable divider */}
          <div
            role="separator"
            aria-label="Змінити ширину чату"
            aria-orientation="vertical"
            onPointerDown={startDrag}
            className={`pointer-events-auto relative z-10 h-full w-1 shrink-0 cursor-col-resize transition-colors max-md:hidden ${
              dragging ? 'bg-accent/40' : 'bg-transparent hover:bg-accent/25'
            }`}
          >
            {/* widened invisible grab area */}
            <span className="absolute inset-y-0 -right-1.5 -left-1.5" />
          </div>

          {/* Chat column (right): ~1/3 of the screen by default, draggable */}
          <main
            aria-label="Чат із радником"
            style={{ width: chatWidth }}
            className={`pointer-events-auto relative shrink-0 bg-bg-main max-md:!w-full max-md:flex-1 ${
              mobileView === 'map' ? 'max-md:hidden' : ''
            }`}
          >
            {/* Reopen sidebar — floating chrome (hamburger < 768px, panel icon otherwise) */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Відкрити бокову панель"
                className="chrome-btn absolute top-4 left-4 z-10"
              >
                <PanelLeft size={18} strokeWidth={1.5} />
              </button>
            )}
            <ChatCanvas />
          </main>
        </div>
      </div>

      <MobileTabBarSpacer mobileView={mobileView} setMobileView={setMobileView} />
    </div>
  )
}

/** Flies the map back to the user's home city. */
function HomeButton() {
  const homeCity = useChatStore((s) => s.homeCity)
  const requestFlyTo = useMapStore((s) => s.requestFlyTo)
  const hasCoords = homeCity.lat != null && homeCity.lng != null

  return (
    <button
      type="button"
      disabled={!hasCoords}
      onClick={() => hasCoords && requestFlyTo([homeCity.lng!, homeCity.lat!], 10.5)}
      aria-label={`До мого міста: ${homeCity.city}`}
      title={hasCoords ? `До ${homeCity.city}` : 'Місто без координат — оберіть із підказок'}
      className="flex size-[38px] items-center justify-center rounded-[10px] border border-border-subtle bg-bg-elevated/80 text-text-secondary backdrop-blur transition-colors hover:border-text-tertiary hover:text-text-primary disabled:opacity-40"
    >
      <Home size={20} strokeWidth={1.5} />
    </button>
  )
}

function MobileTabBarSpacer({
  mobileView,
  setMobileView,
}: {
  mobileView: 'chat' | 'map'
  setMobileView: (v: 'chat' | 'map') => void
}) {
  return (
    <>
      {/* Mobile tab bar */}
      <nav
        aria-label="Розділи"
        className="hidden shrink-0 border-t border-border-subtle bg-bg-sidebar max-md:flex"
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
              mobileView === view ? 'text-accent' : 'text-text-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
