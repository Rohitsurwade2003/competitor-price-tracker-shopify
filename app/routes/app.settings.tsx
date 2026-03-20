import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  });
  return { shop: session.shop, userId: shopUser?.apiUserId ?? null };
};

export default function Settings() {
  const { shop, userId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" variant="tertiary" onClick={() => navigate("/app")}>
        Back to Dashboard
      </s-button>

      <s-section heading="Account">
        <s-paragraph>
          <s-text>Store: </s-text>
          <s-text>{shop}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>API User ID: </s-text>
          <s-text>{userId ?? "Not set up"}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Plan: </s-text>
          <s-text>Free (3 URLs, daily checks)</s-text>
        </s-paragraph>
      </s-section>

      <s-section heading="Plans">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-heading>Free</s-heading>
              <s-paragraph>
                <s-text>3 URLs · Daily checks · Email alerts</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text tone="success">Current plan</s-text>
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-heading>Starter — $9.99/mo</s-heading>
              <s-paragraph>
                <s-text>20 URLs · Daily checks · Email alerts</s-text>
              </s-paragraph>
              <s-button variant="primary">Upgrade</s-button>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-heading>Growth — $29.99/mo</s-heading>
              <s-paragraph>
                <s-text>Unlimited URLs · Hourly checks · Email + Slack alerts</s-text>
              </s-paragraph>
              <s-button variant="primary">Upgrade</s-button>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How It Works">
        <s-unordered-list>
          <s-list-item>Add competitor product URLs</s-list-item>
          <s-list-item>Prices are scraped automatically</s-list-item>
          <s-list-item>View price history and trends</s-list-item>
          <s-list-item>Get alerts when prices change</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
