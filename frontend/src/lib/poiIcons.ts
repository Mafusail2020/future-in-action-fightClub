/** Google-Maps-style POI badges: colored circle + white glyph, rendered from
 *  lucide path data into map images at runtime (no sprite sheet needed). */

import {
  Banknote,
  BedDouble,
  Bus,
  Camera,
  Church,
  Coffee,
  Cross,
  Fuel,
  GraduationCap,
  Landmark,
  Mail,
  ShieldCheck,
  ShoppingCart,
  Ticket,
  Trees,
  Utensils,
} from 'lucide'
import type { IconNode } from 'lucide'
import type { MapRef } from 'react-map-gl/maplibre'

interface Badge {
  icon: IconNode
  color: string
}

/** POI class -> badge. Keys match OpenMapTiles `poi.class` values. */
export const POI_BADGES: Record<string, Badge> = {
  shop: { icon: ShoppingCart, color: '#4285f4' },
  grocery: { icon: ShoppingCart, color: '#4285f4' },
  clothing_store: { icon: ShoppingCart, color: '#4285f4' },
  restaurant: { icon: Utensils, color: '#f29900' },
  fast_food: { icon: Utensils, color: '#f29900' },
  cafe: { icon: Coffee, color: '#f29900' },
  bar: { icon: Coffee, color: '#f29900' },
  pharmacy: { icon: Cross, color: '#0d9488' },
  hospital: { icon: Cross, color: '#d93025' },
  doctors: { icon: Cross, color: '#0d9488' },
  school: { icon: GraduationCap, color: '#7b61c4' },
  college: { icon: GraduationCap, color: '#7b61c4' },
  library: { icon: GraduationCap, color: '#7b61c4' },
  bank: { icon: Banknote, color: '#607d8b' },
  lodging: { icon: BedDouble, color: '#e91e8c' },
  attraction: { icon: Camera, color: '#12a4af' },
  entertainment: { icon: Ticket, color: '#c26bd1' },
  cinema: { icon: Ticket, color: '#c26bd1' },
  park: { icon: Trees, color: '#188038' },
  stadium: { icon: Trees, color: '#188038' },
  bus: { icon: Bus, color: '#3f6ac4' },
  railway: { icon: Bus, color: '#3f6ac4' },
  fuel: { icon: Fuel, color: '#3f6ac4' },
  post: { icon: Mail, color: '#607d8b' },
  police: { icon: ShieldCheck, color: '#607d8b' },
  town_hall: { icon: Landmark, color: '#607d8b' },
  place_of_worship: { icon: Church, color: '#607d8b' },
}

export const POI_CLASSES = Object.keys(POI_BADGES)

function badgeSvg(badge: Badge, size: number): string {
  const inner = badge.icon
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${attributes}/>`
    })
    .join('')
  // 24x24 glyph viewport centered inside the badge circle
  const glyph = size * 0.54
  const offset = (size - glyph) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${badge.color}" stroke="#ffffff" stroke-width="1.6"/>
    <g transform="translate(${offset},${offset}) scale(${glyph / 24})"
       fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
  </svg>`
}

/** Google-style route shield (М21): blue rounded rect, white rim, stretchable. */
export function loadRoadShield(map: MapRef): void {
  const m = map.getMap()
  if (m.hasImage('road-shield')) return
  const w = 72
  const h = 48
  const r = 5
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, r)
  ctx.fillStyle = '#4576d2'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  m.addImage('road-shield', ctx.getImageData(0, 0, w, h), {
    pixelRatio: 2,
    // stretch the middle, keep corners crisp; content = where text may sit
    stretchX: [[12, 60]],
    stretchY: [[12, 36]],
    content: [10, 8, 62, 40],
  })
}

/** Dark plate behind highway NAMES (Google boxes those too), stretchable. */
export function loadNamePlate(map: MapRef): void {
  const m = map.getMap()
  if (m.hasImage('name-plate')) return
  const w = 72
  const h = 44
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, 4)
  ctx.fillStyle = '#223652'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(157, 177, 207, 0.45)'
  ctx.stroke()
  m.addImage('name-plate', ctx.getImageData(0, 0, w, h), {
    pixelRatio: 2,
    stretchX: [[12, 60]],
    stretchY: [[12, 32]],
    content: [10, 7, 62, 37],
  })
}

/** Register every badge as `poi-<class>` on the map (idempotent). */
export function loadPoiIcons(map: MapRef): void {
  const size = 42 // rendered @2x -> crisp 21px badge
  for (const [cls, badge] of Object.entries(POI_BADGES)) {
    const name = `poi-${cls}`
    if (map.getMap().hasImage(name)) continue
    const image = new Image(size, size)
    image.onload = () => {
      if (!map.getMap().hasImage(name)) {
        map.getMap().addImage(name, image, { pixelRatio: 2 })
      }
    }
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(badge, size))}`
  }
}
