import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimit } from "../billing.server";

const IS_TEST = process.env.BILLING_TEST_MODE !== "false";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0/mo",
    features: ["3 URLs", "Manual refresh only", "7-day price history"],
  },
  {
    key: "Starter",
    name: "Starter",
    price: "$4.99/mo",
    features: ["10 URLs", "Daily auto-refresh", "30-day price history"],
  },
  {
    key: "Growth",
    name: "Growth",
    price: "$14.99/mo",
    features: ["50 URLs", "Daily auto-refresh", "90-day price history"],
  },
  {
    key: "Pro",
    name: "Pro",
    price: "$54.99/mo",
    features: ["100 URLs", "Daily auto-refresh", "1-year history", "Priority support"],
  },
];

const PLAN_ORDER = ["free", "Starter", "Growth", "Pro"];

// ShopUser type with plan field (populated after `prisma generate`)
type ShopUserRecord = { id: string; shop: string; apiUserId: string; plan: string; createdAt: Date };
// billing cast needed until @shopify/shopify-app-react-router types align with config
type BillingCheck = { appSubscriptions: Array<{ id: string; name: string }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBilling = any;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const bill = billing as AnyBilling;
  const shop = session.shop;

  const shopUser = (await prisma.shopUser.findUnique({ where: { shop } })) as ShopUserRecord | null;

  // Sync plan from Shopify billing
  let currentPlan = shopUser?.plan ?? "free";
  const billingCheck = (await bill.check({
    plans: ["Starter", "Growth", "Pro"],
    isTest: IS_TEST,
  })) as BillingCheck;

  if (billingCheck.appSubscriptions.length > 0) {
    currentPlan = billingCheck.appSubscriptions[0].name;
  } else {
    currentPlan = "free";
  }

  // Sync to DB if changed
  if (shopUser && shopUser.plan !== currentPlan) {
    await prisma.shopUser.update({
      where: { shop },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { plan: currentPlan } as any,
    });
  }

  return {
    shop,
    userId: shopUser?.apiUserId ?? null,
    currentPlan,
    planLimit: getPlanLimit(currentPlan),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const bill = billing as AnyBilling;
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const plan = String(formData.get("plan"));

  if (intent === "upgrade") {
    await bill.request({
      plan,
      isTest: IS_TEST,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/settings`,
    });
    // billing.request() throws a redirect — never reaches here
  }

  if (intent === "cancel") {
    const billingCheck = (await bill.check({
      plans: ["Starter", "Growth", "Pro"],
      isTest: IS_TEST,
    })) as BillingCheck;
    const activeSub = billingCheck.appSubscriptions[0];
    if (activeSub) {
      await bill.cancel({
        subscriptionId: activeSub.id,
        isTest: IS_TEST,
        prorate: true,
      });
    }
    await prisma.shopUser.update({
      where: { shop: session.shop },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { plan: "free" } as any,
    });
    return { cancelled: true };
  }

  return null;
};

export default function Settings() {
  const { shop, userId, currentPlan, planLimit } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" variant="tertiary" onClick={() => navigate("/app")}>
        Back to Dashboard
      </s-button>

      <s-section heading="Account">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "14px" }}>
            <span style={{ color: "#6d7175" }}>Store: </span>
            <span style={{ fontWeight: 500 }}>{shop}</span>
          </div>
          <div style={{ fontSize: "14px" }}>
            <span style={{ color: "#6d7175" }}>Current plan: </span>
            <span style={{ fontWeight: 700, color: "#2c6ecb" }}>
              {PLANS.find((p) => p.key === currentPlan)?.name ?? "Free"}
            </span>
          </div>
          <div style={{ fontSize: "14px" }}>
            <span style={{ color: "#6d7175" }}>URL limit: </span>
            <span style={{ fontWeight: 500 }}>{planLimit} URLs</span>
          </div>
        </div>
      </s-section>

      <s-section heading="Plans">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {PLANS.map((plan, i) => {
            const isCurrent = plan.key === currentPlan;
            const isUpgrade = i > currentPlanIndex;

            return (
              <div
                key={plan.key}
                style={{
                  border: isCurrent ? "2px solid #2c6ecb" : "1px solid #e1e3e5",
                  borderRadius: "8px",
                  padding: "16px 20px",
                  background: isCurrent ? "#f0f5ff" : "white",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: "16px", fontWeight: 700, color: "#202223", marginBottom: "4px" }}
                  >
                    {plan.name} — {plan.price}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6d7175" }}>
                    {plan.features.join(" · ")}
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {isCurrent ? (
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#2c6ecb",
                        fontWeight: 600,
                        background: "#e3ecf9",
                        padding: "5px 12px",
                        borderRadius: "12px",
                      }}
                    >
                      Current plan
                    </span>
                  ) : plan.key === "free" ? (
                    currentPlan !== "free" && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel" />
                        <button
                          type="submit"
                          style={{
                            padding: "7px 16px",
                            borderRadius: "6px",
                            border: "1px solid #c9cccf",
                            background: "white",
                            cursor: "pointer",
                            fontSize: "13px",
                            color: "#202223",
                          }}
                        >
                          Downgrade to Free
                        </button>
                      </Form>
                    )
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="upgrade" />
                      <input type="hidden" name="plan" value={plan.key} />
                      <button
                        type="submit"
                        style={{
                          padding: "7px 16px",
                          borderRadius: "6px",
                          border: isUpgrade ? "none" : "1px solid #c9cccf",
                          background: isUpgrade ? "#2c6ecb" : "white",
                          color: isUpgrade ? "white" : "#202223",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500,
                        }}
                      >
                        {isUpgrade ? "Upgrade" : "Downgrade"}
                      </button>
                    </Form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </s-section>

      <s-section slot="aside" heading="How billing works">
        <s-unordered-list>
          <s-list-item>Billed monthly through Shopify</s-list-item>
          <s-list-item>Cancel anytime from this page</s-list-item>
          <s-list-item>Upgrades take effect immediately</s-list-item>
          <s-list-item>Unused days are prorated on downgrade</s-list-item>
        </s-unordered-list>
      </s-section>

      {userId && (
        <s-section slot="aside" heading="Developer Info">
          <div style={{ fontSize: "12px", color: "#8c9196", wordBreak: "break-all" }}>
            API User ID: {userId}
          </div>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
