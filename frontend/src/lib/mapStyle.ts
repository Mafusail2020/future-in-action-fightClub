import type { StyleSpecification } from 'maplibre-gl'

import { REPLACED_CITY_LABELS } from './cityNamesUk'
import { POI_CLASSES } from './poiIcons'

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
      // Solution cities are excluded: our clickable tags replace their names.
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
        [
          '!',
          [
            'in',
            ['coalesce', ['get', 'name:uk'], ['get', 'name']],
            ['literal', REPLACED_CITY_LABELS],
          ],
        ],
        ['!', ['in', ['get', 'name'], ['literal', REPLACED_CITY_LABELS]]],
      ],
      layout: {
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          4, ['match', ['get', 'class'], 'city', 12, 10],
          10, ['match', ['get', 'class'], 'city', 16, 13],
          14, ['match', ['get', 'class'], 'city', 18, 15],
        ],
        'text-letter-spacing': 0.02,
      },
      paint: {
        'text-color': '#6d81a3', // previous steel tone, a touch lighter
        'text-halo-color': '#0b1220',
        'text-halo-width': 1.6,
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
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-letter-spacing': 0.02,
      },
      paint: {
        'text-color': '#9db1cf',
        'text-halo-color': '#0b1220',
        'text-halo-width': 1.4,
      },
    },
    // --- Google-maps-like detail on zoom-in: streets, house numbers, POIs -----
    {
      id: 'road-shields',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 8,
      filter: ['all', ['has', 'ref'], ['<=', ['length', ['get', 'ref']], 6]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'icon-image': 'road-shield',
        'icon-text-fit': 'both',
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['get', 'ref'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 10.5,
      },
      paint: {
        'text-color': '#ffffff',
      },
    },
    {
      id: 'highway-names',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 11,
      filter: [
        'all',
        ['has', 'name'],
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      ],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 500,
        'icon-image': 'name-plate',
        'icon-text-fit': 'both',
        'icon-rotation-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10.5,
        'text-max-width': 12,
      },
      paint: {
        'text-color': '#c3d0e6',
      },
    },
    {
      id: 'street-names',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 13,
      filter: ['!', ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]],
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 13],
        'symbol-spacing': 350,
      },
      paint: {
        'text-color': '#9db1cf',
        'text-halo-color': '#0b1220',
        'text-halo-width': 1.4,
      },
    },
    {
      id: 'house-numbers',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'housenumber',
      minzoom: 17,
      layout: {
        'text-field': ['get', 'housenumber'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-padding': 4,
      },
      paint: {
        'text-color': '#9db1cf', // matches street-names
        'text-halo-color': '#0b1220',
        'text-halo-width': 1,
      },
    },
    {
      id: 'poi-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 13,
      // Value-tiered reveal: landmark-grade first, the long tail last.
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', POI_CLASSES]],
        [
          'any',
          // z13+: city-scale anchors regardless of rank
          [
            'in',
            ['get', 'class'],
            ['literal', ['hospital', 'stadium', 'attraction', 'town_hall', 'railway']],
          ],
          // z13+: whatever the tiles rank as most prominent (malls etc.)
          ['<=', ['coalesce', ['get', 'rank'], 30], 3],
          // z14.5+: prominent
          ['all', ['>=', ['zoom'], 14.5], ['<=', ['coalesce', ['get', 'rank'], 30], 8]],
          // z15.5+: notable
          ['all', ['>=', ['zoom'], 15.5], ['<=', ['coalesce', ['get', 'rank'], 30], 14]],
          // z16.5+: everything
          ['>=', ['zoom'], 16.5],
        ],
      ],
      layout: {
        'icon-image': ['concat', 'poi-', ['get', 'class']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 1.1],
        'icon-allow-overlap': false,
        'text-field': ['coalesce', ['get', 'name:uk'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 12],
        'text-max-width': 8,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#aebdd6',
        'text-halo-color': '#0b1220',
        'text-halo-width': 1.3,
      },
    },
  ],
}
