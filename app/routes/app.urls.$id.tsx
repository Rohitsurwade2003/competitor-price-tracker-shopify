import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPriceHistory, getUrls, triggerScrape, type PricePoint, type TrackedUrl } from "../api.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  });
  if (!shopUser) throw new Response("Not Found", { status: 404 });

  const urlId = params.id!;
  const [history, allUrls] = await Promise.all([
    getPriceHistory(urlId),
    getUrls(shopUser.apiUserId),
  ]);

  const trackedUrl = allUrls.find((u: TrackedUrl) => u.id === urlId) ?? null;
  return { history, trackedUrl, urlId, userId: shopUser.apiUserId };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  });
  if (!shopUser) throw new Error("User not found");

  await triggerScrape(params.id!, shopUser.apiUserId);
  return { ok: true };
};

export default function PriceHistory() {
  const { history, trackedUrl, urlId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Scrape triggered — check back shortly for new data");
    }
  }, [fetcher.data, shopify]);

  const title = trackedUrl?.product_name || trackedUrl?.url || urlId;
  const latestPrice = history.length > 0 ? history[0] : null;
  const lowestPrice = history.length > 0
    ? history.reduce((min: PricePoint, p: PricePoint) => (p.price < min.price ? p : min), history[0])
    : null;
  const highestPrice = history.length > 0
    ? history.reduce((max: PricePoint, p: PricePoint) => (p.price > max.price ? p : max), history[0])
    : null;

  return (
    <s-page heading={`Price History: ${title}`}>
      <s-button slot="primary-action" variant="tertiary" onClick={() => navigate("/app")}>
        Back to Dashboard
      </s-button>

      {trackedUrl && (
        <s-section heading="Summary">
          <s-paragraph>
            <s-text>URL: </s-text>
            <s-link href={trackedUrl.url} target="_blank">{trackedUrl.url}</s-link>
          </s-paragraph>
          <s-paragraph>
            <s-text>Current Price: </s-text>
            <s-text>
              {latestPrice ? `${latestPrice.currency} ${latestPrice.price}` : "—"}
            </s-text>
          </s-paragraph>
          <s-paragraph>
            <s-text>Availability: </s-text>
            <s-text>{latestPrice?.availability ?? "—"}</s-text>
          </s-paragraph>
          {lowestPrice && (
            <s-paragraph>
              <s-text>Lowest Recorded: </s-text>
              <s-text>{lowestPrice.currency} {lowestPrice.price}</s-text>
            </s-paragraph>
          )}
          {highestPrice && (
            <s-paragraph>
              <s-text>Highest Recorded: </s-text>
              <s-text>{highestPrice.currency} {highestPrice.price}</s-text>
            </s-paragraph>
          )}
          <fetcher.Form method="post">
            <s-button
              type="submit"
              variant="secondary"
              {...(fetcher.state !== "idle" ? { loading: true } : {})}
            >
              Scrape Now
            </s-button>
          </fetcher.Form>
        </s-section>
      )}

      <s-section heading={`Price History (${history.length} records)`}>
        {history.length === 0 ? (
          <s-paragraph>
            No price data yet. Click &quot;Scrape Now&quot; to fetch the current price.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="tight">
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: "600" }}>Date</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: "600" }}>Price</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: "600" }}>Availability</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: "600" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((point: PricePoint, index: number) => (
                      <tr
                        key={point.id}
                        style={{
                          borderBottom: "1px solid #f1f2f3",
                          backgroundColor: index % 2 === 0 ? "transparent" : "#fafbfb",
                        }}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          {new Date(point.scraped_at).toLocaleString()}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: "600" }}>
                          {point.success && point.price != null
                            ? `${point.currency} ${point.price}`
                            : "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {point.availability ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: point.success ? "#007f5f" : "#d72c0d" }}>
                            {point.success ? "Success" : "Failed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </s-box>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
