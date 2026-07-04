import type { StyleSpecification } from 'maplibre-gl'

/**
 * Minimal cadastral-blueprint style over OpenFreeMap vector tiles (free, keyless).
 * Night ocean + dim land keeps the amber/cyan overlays readable.
 * The globe projection makes MapLibre render a 3D globe at low zoom and
 * auto-morph to a flat map as you zoom in — no custom transition code.
 */
export const mapStyle: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#122b45' } },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': '#071c36' },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 8,
      paint: { 'line-color': '#0d2440', 'line-width': 1.1 },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest', 'grass', 'park']]],
      paint: { 'fill-color': '#14304a', 'fill-opacity': 0.55 },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: {
        'line-color': '#2a3b57',
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 7, 1.4],
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 7,
      filter: [
        'in',
        ['get', 'class'],
        ['literal', ['motorway', 'trunk', 'primary', 'secondary']],
      ],
      paint: {
        'line-color': '#1e3a5c',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 13, 2.2],
      },
    },
    {
      id: 'roads-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'minor', 'service']]],
      paint: { 'line-color': '#17304e', 'line-width': 1 },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': '#182f4d', 'fill-opacity': 0.6 },
    },
    {
      id: 'place-city-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 4,
      maxzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 13],
      },
      paint: {
        'text-color': '#5c6f8f',
        'text-halo-color': '#060d1a',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'place-suburb-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#8da2c0',
        'text-halo-color': '#060d1a',
        'text-halo-width': 1.2,
      },
    },
  ],
}
