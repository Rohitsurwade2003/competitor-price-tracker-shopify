import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useNavigation, useNavigate, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { addUrl } from "../api.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopUser = await prisma.shopUser.findUnique({
    where: { shop: session.shop },
  });
  if (!shopUser) return { error: "User not found. Please reinstall the app." };

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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

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
        {actionData?.error && (
          <s-paragraph>
            <s-text tone="critical">{actionData.error}</s-text>
          </s-paragraph>
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
