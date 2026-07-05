import { useEffect, useRef, useState } from 'react'

interface Place {
  name: string
  country: string
  admin1?: string
  latitude?: number
  longitude?: number
}

/**
 * One input for "City, Country" with live suggestions from the Open-Meteo
 * geocoding API (free, keyless). Picking a suggestion fills both fields;
 * plain typing still works offline — "Львів, Україна" splits on the comma.
 */
export function CityAutocomplete({
  initialCity,
  initialCountry,
  onSubmit,
  onCancel,
}: {
  initialCity: string
  initialCountry: string
  onSubmit: (city: string, country: string, lat?: number, lng?: number) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(`${initialCity}, ${initialCountry}`)
  const [options, setOptions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const debounceRef = useRef<number>(0)
  const abortRef = useRef<AbortController | null>(null)
  const doneRef = useRef(false)

  useEffect(() => () => window.clearTimeout(debounceRef.current), [])

  const search = (query: string) => {
    window.clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const name = query.split(',')[0]?.trim()
    if (!name || name.length < 2) {
      setOptions([])
      setOpen(false)
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=uk&format=json`,
          { signal: controller.signal },
        )
        const data = (await response.json()) as { results?: Place[] }
        setOptions(data.results ?? [])
        setOpen((data.results ?? []).length > 0)
        setHighlighted(0)
      } catch {
        /* offline / rate-limited — manual entry still works */
      }
    }, 300)
  }

  const pick = (place: Place) => {
    doneRef.current = true
    setText(`${place.name}, ${place.country}`)
    setOpen(false)
    onSubmit(place.name, place.country, place.latitude, place.longitude)
  }

  const submitFreeText = async () => {
    doneRef.current = true
    const [city, ...rest] = text.split(',')
    const country = rest.join(',').trim() || initialCountry
    if (!city.trim()) {
      onCancel()
      return
    }
    // Best-effort geocode so the home marker gets coordinates; plain text still works.
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=uk&format=json`,
      )
      const data = (await response.json()) as { results?: Place[] }
      const hit = data.results?.[0]
      onSubmit(city.trim(), country, hit?.latitude, hit?.longitude)
    } catch {
      onSubmit(city.trim(), country)
    }
  }

  return (
    <div className="relative px-2 py-1">
      <input
        autoFocus
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Ваше місто та країна"
        value={text}
        placeholder="Місто, країна"
        onChange={(e) => {
          setText(e.target.value)
          search(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (open) setOpen(false)
            else onCancel()
          } else if (e.key === 'ArrowDown' && open) {
            e.preventDefault()
            setHighlighted((h) => Math.min(h + 1, options.length - 1))
          } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault()
            setHighlighted((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && options[highlighted]) pick(options[highlighted])
            else void submitFreeText()
          }
        }}
        onBlur={() =>
          // Delay lets an option's mousedown fire first; then leave edit mode
          // entirely — the field must not stay stuck in its editing look.
          window.setTimeout(() => {
            setOpen(false)
            if (!doneRef.current) onCancel()
          }, 150)
        }
        className="w-full rounded-lg border border-accent/50 bg-bg-elevated px-2.5 py-1.5 text-[15px] outline-none placeholder:text-text-tertiary"
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Запропоновані міста"
          className="absolute right-2 left-2 z-30 mt-1 overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated shadow-xl"
        >
          {options.map((place, i) => (
            <li key={`${place.name}-${place.country}-${i}`} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(place)
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-baseline gap-1.5 px-2.5 py-1.5 text-left text-sm ${
                  i === highlighted ? 'bg-bg-main text-text-primary' : 'text-text-secondary'
                }`}
              >
                {place.name}
                <span className="truncate text-xs text-text-tertiary">
                  {place.admin1 ? `${place.admin1}, ` : ''}
                  {place.country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
