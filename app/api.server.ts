const API_URL = process.env.PRICE_TRACKER_API_URL!;

export interface TrackedUrl {
  id: string;
  url: string;
  product_name: string | null;
  check_frequency: string;
  last_checked_at: string | null;
  created_at: string;
  latestPrice?: number | null;
  currency?: string | null;
  availability?: string | null;
}

export interface PricePoint {
  id: string;
  price: number;
  currency: string;
  availability: string;
  scraped_at: string;
  success: boolean;
}

export async function createUser(shop: string) {
  const res = await fetch(`${API_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `store@${shop}`, platform: "shopify", tier: "free" }),
  });
  const data = await res.json().catch(() => ({}));
  // If duplicate email, Railway returns the existing user or an error with the id
  if (data?.id) return data as { id: string; email: string; tier: string };
  if (!res.ok) throw new Error(`createUser failed: ${res.status} — ${JSON.stringify(data)}`);
  return data as { id: string; email: string; tier: string };
}

export async function getDashboard(userId: string): Promise<TrackedUrl[]> {
  const res = await fetch(`${API_URL}/api/dashboard?userId=${userId}`);
  if (!res.ok) throw new Error(`getDashboard failed: ${res.status}`);
  return res.json();
}

export async function getUrls(userId: string): Promise<TrackedUrl[]> {
  const res = await fetch(`${API_URL}/api/urls?userId=${userId}`);
  if (!res.ok) throw new Error(`getUrls failed: ${res.status}`);
  return res.json();
}

export async function addUrl(data: {
  url: string;
  userId: string;
  productName?: string;
  frequency?: string;
}) {
  const res = await fetch(`${API_URL}/api/urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: data.url,
      userId: data.userId,
      productName: data.productName,
      frequency: data.frequency ?? "daily",
    }),
  });
  if (!res.ok) throw new Error(`addUrl failed: ${res.status}`);
  return res.json();
}

export async function getPriceHistory(urlId: string): Promise<PricePoint[]> {
  const res = await fetch(`${API_URL}/api/urls/${urlId}/history`);
  if (!res.ok) throw new Error(`getPriceHistory failed: ${res.status}`);
  return res.json();
}

export async function triggerScrape(competitorUrlId: string, userId: string) {
  const res = await fetch(`${API_URL}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ competitorUrlId, userId }),
  });
  if (!res.ok) throw new Error(`triggerScrape failed: ${res.status}`);
  return res.json();
}
