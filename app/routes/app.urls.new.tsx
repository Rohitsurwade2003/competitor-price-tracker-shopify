import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, useNavigate, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { addUrl, getDashboard } from "../api.server";
import { getPlanLimit } from "../billing.server";

// ShopUser type with plan field (populated after `prisma generate`)
type ShopUserRecord = { id: string; shop: string; apiUserId: string; plan: string; createdAt: Date };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = (await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  })) as ShopUserRecord | null;
  const plan = shopUser?.plan ?? "free";
  const planLimit = getPlanLimit(plan);
  const urls = shopUser ? await getDashboard(shopUser.apiUserId) : [];
  return { plan, planLimit, urlCount: urls.length };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = (await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  })) as ShopUserRecord | null;
  if (!shopUser) return { error: "User not found. Please reinstall the app." };

  // Enforce plan URL limit
  const planLimit = getPlanLimit(shopUser.plan);
  const existingUrls = await getDashboard(shopUser.apiUserId);
  if (existingUrls.length >= planLimit) {
    return {
      error: `You've reached your ${shopUser.plan} plan limit of ${planLimit} URLs. Upgrade your plan in Settings to add more.`,
      limitReached: true,
    };
  }

  const formData = await request.formData();
  const url = String(formData.get("url")).trim();
  const productName = String(formData.get("productName")).trim();
  const frequency = String(formData.get("frequency"));

  if (!url || !url.startsWith("http")) {
    return { error: "Please enter a valid URL starting with http:// or https://" };
  }

  try {
    await addUrl({
      url,
      userId: shopUser.apiUserId,
      productName: productName || undefined,
      frequency,
    });
    return { success: true };
  } catch (err) {
    return { error: "Failed to add URL. Please try again." };
  }
};

export default function AddUrl() {
  const { plan, planLimit, urlCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";
  const atLimit = urlCount >= planLimit;

  const shopify = useAppBridge();
  const [url, setUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [frequency, setFrequency] = useState("daily");

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("URL added successfully!");
      navigate("/app");
    }
    if (actionData?.error) {
      console.error("[addUrl action error]", actionData.error);
    }
  }, [actionData, navigate, shopify]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("url", url);
    formData.set("productName", productName);
    formData.set("frequency", frequency);
    submit(formData, { method: "post" });
  }

  return (
    <s-page heading="Track New Competitor URL">
      <s-button slot="primary-action" variant="tertiary" onClick={() => navigate("/app")}>
        Back to Dashboard
      </s-button>

      <s-section heading="Competitor URL Details">
        <div style={{ fontSize: "13px", color: "#6d7175", marginBottom: "12px" }}>
          {urlCount} / {planLimit} URLs used ({plan} plan)
          {atLimit && (
            <span style={{ marginLeft: "8px", color: "#c0392b", fontWeight: 600 }}>
              — Limit reached.{" "}
              <a href="/app/settings" style={{ color: "#2c6ecb" }}>
                Upgrade
              </a>
            </span>
          )}
        </div>

        {actionData?.error && (
          <div
            style={{
              background: "#fff4f4",
              border: "1px solid #ffd2d2",
              borderRadius: "6px",
              padding: "10px 14px",
              marginBottom: "12px",
              fontSize: "14px",
              color: "#c0392b",
            }}
          >
            {actionData.error}
            {actionData.limitReached && (
              <span>
                {" "}
                <a href="/app/settings" style={{ color: "#2c6ecb" }}>
                  Go to Settings →
                </a>
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="tight">
              <s-text>Competitor URL *</s-text>
              <input
                type="url"
                name="url"
                required
                placeholder="https://competitor.com/product"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #8c9196",
                  borderRadius: "4px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </s-stack>

            <s-stack direction="block" gap="tight">
              <s-text>Product Name (optional)</s-text>
              <input
                type="text"
                name="productName"
                placeholder="e.g. Blue Widget 500ml"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #8c9196",
                  borderRadius: "4px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </s-stack>

            <s-stack direction="block" gap="tight">
              <s-text>Check Frequency</s-text>
              <select
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #8c9196",
                  borderRadius: "4px",
                  fontSize: "14px",
                  backgroundColor: "white",
                }}
              >
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </s-stack>

            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
              {...(atLimit ? { disabled: true } : {})}
            >
              {isSubmitting ? "Adding..." : "Add URL"}
            </s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section slot="aside" heading="Supported Sites">
        <s-unordered-list>
          <s-list-item>Amazon (all regions)</s-list-item>
          <s-list-item>Shopify stores</s-list-item>
          <s-list-item>WooCommerce stores</s-list-item>
          <s-list-item>Most e-commerce sites</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
