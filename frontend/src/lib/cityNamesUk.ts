/** Ukrainian exonyms for the seeded solution cities (DB stores English names). */

export const CITY_NAMES_UK: Record<string, string> = {
  Amsterdam: 'Амстердам',
  Barcelona: 'Барселона',
  Bilbao: 'Більбао',
  Bogota: 'Богота',
  Copenhagen: 'Копенгаген',
  Freiburg: 'Фрайбург',
  Frome: 'Фром',
  Ghent: 'Гент',
  Hamburg: 'Гамбург',
  Helsinki: 'Гельсінкі',
  Ljubljana: 'Любляна',
  London: 'Лондон',
  Medellin: 'Медельїн',
  Milan: 'Мілан',
  Oslo: 'Осло',
  Paris: 'Париж',
  Pontevedra: 'Понтеведра',
  Preston: 'Престон',
  Reykjavik: 'Рейк’явік',
  Rotterdam: 'Роттердам',
  Santander: 'Сантандер',
  Seoul: 'Сеул',
  Singapore: 'Сінгапур',
  Stuttgart: 'Штутгарт',
  Tallinn: 'Таллінн',
  Vienna: 'Відень',
  'Vitoria-Gasteiz': 'Віторія-Гастейс',
  Zurich: 'Цюрих',
}

export function ukCityName(name: string): string {
  return CITY_NAMES_UK[name] ?? name
}

/** Local endonyms the tiles use where they differ from our English seed names. */
const LOCAL_VARIANTS = [
  'Reykjavík',
  'Zürich',
  'Bogotá',
  'Medellín',
  'Milano',
  'Wien',
  'København',
  'Gent',
  'Freiburg im Breisgau',
  '서울', // Seoul
  'Singapura',
]

/** The same name with every apostrophe codepoint OSM editors actually use. */
function apostropheVariants(name: string): string[] {
  if (!/['’ʼ]/.test(name)) return [name]
  return ["'", '’', 'ʼ'].map((a) => name.replace(/['’ʼ]/g, a))
}

/** Every alias (en + uk + local + apostrophe variants) — the base map hides
 *  these labels so our clickable solution-tags REPLACE the plain city names. */
export const REPLACED_CITY_LABELS: string[] = [
  ...new Set([
    ...Object.keys(CITY_NAMES_UK),
    ...Object.values(CITY_NAMES_UK).flatMap(apostropheVariants),
    ...LOCAL_VARIANTS,
  ]),
]
