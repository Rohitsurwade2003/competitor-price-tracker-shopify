import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createUser } from "../api.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Find or create the Railway API user for this shop
  let shopUser = await prisma.shopUser.findUnique({ where: { shop } });

  if (!shopUser) {
    try {
      const apiUser = await createUser(shop);
      shopUser = await prisma.shopUser.create({
        data: { shop, apiUserId: apiUser.id },
      });
      console.log(`[app] Created Railway user ${apiUser.id} for shop ${shop}`);
    } catch (err) {
      console.error(`[app] Failed to create Railway user for ${shop}:`, err);
    }
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    userId: shopUser?.apiUserId ?? null,
    shop,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/urls/new">Add URL</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
