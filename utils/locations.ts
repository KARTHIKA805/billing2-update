const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SEEDED_CITY_IDS = {
  chennai: '11111111-1111-1111-1111-111111111111',
  coimbatore: '22222222-2222-2222-2222-222222222222',
} as const;

export const SEEDED_BRANCH_IDS = {
  tNagar: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  annaNagar: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  rsPuram: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
} as const;

const CITY_ID_ALIASES: Record<string, string> = {
  'city-chennai': SEEDED_CITY_IDS.chennai,
  chennai: SEEDED_CITY_IDS.chennai,
  'city-coimbatore': SEEDED_CITY_IDS.coimbatore,
  coimbatore: SEEDED_CITY_IDS.coimbatore,
};

const BRANCH_ID_ALIASES: Record<string, string> = {
  'branch-t-nagar': SEEDED_BRANCH_IDS.tNagar,
  't. nagar': SEEDED_BRANCH_IDS.tNagar,
  't nagar': SEEDED_BRANCH_IDS.tNagar,
  'branch-anna-nagar': SEEDED_BRANCH_IDS.annaNagar,
  'anna nagar': SEEDED_BRANCH_IDS.annaNagar,
  'branch-rs-puram': SEEDED_BRANCH_IDS.rsPuram,
  'rs puram': SEEDED_BRANCH_IDS.rsPuram,
};

export const isUuid = (value?: string | null): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

type NamedLocation = { id: string; name?: string };

const resolveLocationId = (
  value?: string | null,
  aliases: Record<string, string> = {},
  locations: Array<string | NamedLocation> = [],
) => {
  if (!value) return null;
  const records = locations.map((item) => (typeof item === 'string' ? { id: item } : item));
  if (records.some((item) => item.id === value) && isUuid(value)) return value;

  const aliased = aliases[value] || aliases[value.trim().toLowerCase()];
  if (aliased && records.some((item) => item.id === aliased)) return aliased;

  const byName = records.find((item) => item.name && item.name.trim().toLowerCase() === value.trim().toLowerCase());
  if (byName && isUuid(byName.id)) return byName.id;

  if (isUuid(value)) return value;
  return aliased && isUuid(aliased) ? aliased : null;
};

export const resolveCityId = (value?: string | null, locations: Array<string | NamedLocation> = []) => (
  resolveLocationId(value, CITY_ID_ALIASES, locations)
);

export const resolveBranchId = (value?: string | null, locations: Array<string | NamedLocation> = []) => (
  resolveLocationId(value, BRANCH_ID_ALIASES, locations)
);
