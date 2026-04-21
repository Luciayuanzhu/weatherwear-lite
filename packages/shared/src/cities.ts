export type SeedCity = {
  slug: string;
  name: string;
  country: string;
  admin1: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export const defaultCities: SeedCity[] = [
  {
    slug: "chicago-us",
    name: "Chicago",
    country: "United States",
    admin1: "Illinois",
    latitude: 41.8781,
    longitude: -87.6298,
    timezone: "America/Chicago"
  },
  {
    slug: "new-york-us",
    name: "New York",
    country: "United States",
    admin1: "New York",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York"
  },
  {
    slug: "san-francisco-us",
    name: "San Francisco",
    country: "United States",
    admin1: "California",
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: "America/Los_Angeles"
  },
  {
    slug: "seattle-us",
    name: "Seattle",
    country: "United States",
    admin1: "Washington",
    latitude: 47.6062,
    longitude: -122.3321,
    timezone: "America/Los_Angeles"
  },
  {
    slug: "austin-us",
    name: "Austin",
    country: "United States",
    admin1: "Texas",
    latitude: 30.2672,
    longitude: -97.7431,
    timezone: "America/Chicago"
  },
  {
    slug: "london-gb",
    name: "London",
    country: "United Kingdom",
    admin1: "England",
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: "Europe/London"
  },
  {
    slug: "tokyo-jp",
    name: "Tokyo",
    country: "Japan",
    admin1: "Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: "Asia/Tokyo"
  }
];

export function citySlug(name: string, countryCode?: string | null): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = countryCode ? `-${countryCode.toLowerCase()}` : "";
  return `${base}${suffix}`;
}

