import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getDashboard, triggerScrape, deleteUrl, type TrackedUrl } from "../api.server";
import { getPlanLimit } from "../billing.server";

// ShopUser type with plan field (populated after `prisma generate`)
type ShopUserRecord = { id: string; shop: string; apiUserId: string; plan: string; createdAt: Date };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = (await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  })) as ShopUserRecord | null;
  if (!shopUser) return { urls: [] as TrackedUrl[], userId: null, plan: "free", planLimit: 3 };
  const urls = await getDashboard(shopUser.apiUserId);
  const plan = shopUser.plan ?? "free";
  return { urls, userId: shopUser.apiUserId, plan, planLimit: getPlanLimit(plan) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  });
  if (!shopUser) throw new Error("User not found");
  const formData = await request.formData();
  const urlId = String(formData.get("urlId"));
  const intent = String(formData.get("intent"));
  if (intent === "delete") {
    await deleteUrl(urlId);
  } else {
    await triggerScrape(urlId, shopUser.apiUserId);
  }
  return { ok: true, intent };
};

function PriceBadge({ price, currency }: { price?: number | null; currency?: string | null }) {
  if (price == null) {
    return (
      <span style={{
        display: "inline-block", padding: "2px 10px", borderRadius: "12px",
        background: "#f1f2f3", color: "#6d7175", fontSize: "13px", fontWeight: 500,
      }}>
        Not scraped yet
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      background: "#e3f1df", color: "#1a6b3c", fontSize: "15px", fontWeight: 700,
    }}>
      {currency} {price}
    </span>
  );
}

function AvailabilityBadge({ availability }: { availability?: string | null }) {
  if (!availability || availability === "—") return <span style={{ color: "#6d7175" }}>—</span>;
  const isIn = availability.toLowerCase().includes("in stock") || availability.toLowerCase().includes("available");
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      background: isIn ? "#e3f1df" : "#ffd2d2",
      color: isIn ? "#1a6b3c" : "#c0392b",
      fontSize: "13px", fontWeight: 500,
    }}>
      {availability}
    </span>
  );
}

export default function Dashboard() {
  const { urls, plan, planLimit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const atLimit = urls.length >= planLimit;

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Scrape triggered — results will update shortly");
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="RivalSense">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/urls/new")}
      >
        + Track New URL
      </s-button>

      <div slot="subtitle" style={{ fontSize: "13px", color: "#6d7175" }}>
        {urls.length} / {planLimit} URLs tracked · {plan} plan
        {atLimit && (
          <a href="/app/settings" style={{ marginLeft: "8px", color: "#2c6ecb", fontWeight: 600 }}>
            Upgrade →
          </a>
        )}
      </div>

      {urls.length === 0 ? (
        <s-section>
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <img src="/logo.svg" alt="RivalSense" style={{ width: "80px", height: "80px", marginBottom: "12px", borderRadius: "16px" }} />
            <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#202223" }}>
              No competitor URLs tracked yet
            </div>
            <div style={{ fontSize: "14px", color: "#6d7175", marginBottom: "24px" }}>
              Start monitoring competitor prices by adding a product URL.
            </div>
            <s-button variant="primary" onClick={() => navigate("/app/urls/new")}>
              Track your first URL
            </s-button>
          </div>
        </s-section>
      ) : (
        urls.map((item: TrackedUrl) => (
          <s-section key={item.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              {/* Left: product info */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#202223", marginBottom: "4px" }}>
                  {item.product_name || "Unnamed Product"}
                </div>
                <div style={{ fontSize: "13px", color: "#6d7175", marginBottom: "12px", wordBreak: "break-all" }}>
                  <a href={item.url} target="_blank" rel="noreferrer" style={{ color: "#2c6ecb", textDecoration: "none" }}>
                    {item.url}
                  </a>
                </div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                  <PriceBadge price={item.latestPrice} currency={item.currency} />
                  <AvailabilityBadge availability={item.availability} />
                </div>
              </div>

              {/* Right: meta + actions */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "#8c9196" }}>
                  {item.last_checked_at
                    ? `Last checked: ${new Date(item.last_checked_at).toLocaleString()}`
                    : "Never checked"}
                </div>
                <div style={{ fontSize: "12px", color: "#8c9196" }}>
                  Frequency: {item.check_frequency}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <fetcher.Form method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="urlId" value={item.id} />
                    <input type="hidden" name="intent" value="scrape" />
                    <button
                      type="submit"
                      style={{
                        padding: "6px 14px", borderRadius: "6px", border: "1px solid #c9cccf",
                        background: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                        color: "#202223",
                      }}
                    >
                      {fetcher.state !== "idle" ? "Scraping..." : "Scrape Now"}
                    </button>
                  </fetcher.Form>
                  <button
                    onClick={() => navigate(`/app/urls/${item.id}`)}
                    style={{
                      padding: "6px 14px", borderRadius: "6px", border: "1px solid #2c6ecb",
                      background: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                      color: "#2c6ecb",
                    }}
                  >
                    View History
                  </button>
                  <fetcher.Form method="post" style={{ display: "inline" }} onSubmit={(e) => { if (!confirm("Remove this URL from tracking?")) e.preventDefault(); }}>
                    <input type="hidden" name="urlId" value={item.id} />
                    <input type="hidden" name="intent" value="delete" />
                    <button
                      type="submit"
                      style={{
                        padding: "6px 14px", borderRadius: "6px", border: "1px solid #d72c0d",
                        background: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                        color: "#d72c0d",
                      }}
                    >
                      Remove
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            </div>
          </s-section>
        ))
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
