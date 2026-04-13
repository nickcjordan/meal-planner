import { createHash } from "node:crypto";

// --- GraphQL query (proven via spike) ---

const PRODUCT_SEARCH_QUERY = `query productSearchItems(
  $params: SearchPageParamsV2!
  $searchMode: SearchMode
  $searchContextToken: String
  $searchPageLayout: SearchPageLayout!
) {
  productSearchItems(
    params: $params
    searchMode: $searchMode
    searchContextToken: $searchContextToken
    searchPageLayout: $searchPageLayout
  ) {
    ... on ProductSearchItemsResult {
      searchGrid {
        items {
          __typename
          ... on Product {
            id
            displayName
            decodedDisplayName
            inventory {
              inventoryState
            }
            brand {
              name
              isOwnBrand
            }
            SKUs {
              id
              customerFriendlySize
              contextPrices {
                context
                isOnSale
                isPriceCut
                salePrice {
                  formattedAmount
                  amount
                }
              }
            }
          }
        }
      }
    }
    ... on SearchPageError {
      code
      message
    }
  }
}`;

const QUERY_HASH = createHash("sha256")
  .update(PRODUCT_SEARCH_QUERY)
  .digest("hex");

// --- Types ---

export interface HebRawProduct {
  __typename: string;
  id: string;
  displayName: string;
  decodedDisplayName: string;
  inventory: { inventoryState: string };
  brand: { name: string; isOwnBrand: boolean };
  SKUs: Array<{
    id: string;
    customerFriendlySize: string;
    contextPrices: Array<{
      context: string;
      isOnSale: boolean;
      isPriceCut: boolean;
      salePrice: { formattedAmount: string; amount: number };
    }>;
  }>;
}

// --- Search function ---

export async function searchProducts(
  cookieHeader: string,
  query: string,
  storeId: number,
  pageSize = 5,
): Promise<HebRawProduct[]> {
  const response = await fetch("https://www.heb.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify({
      operationName: "productSearchItems",
      query: PRODUCT_SEARCH_QUERY,
      variables: {
        params: {
          query,
          storeId,
          shoppingContext: "CURBSIDE_PICKUP",
          pageIndex: 0,
          pageSize,
        },
        searchPageLayout: "WEB_SEARCH_PAGE_LAYOUT",
      },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: QUERY_HASH },
      },
    }),
  });

  const text = await response.text();

  if (!text.startsWith("{")) {
    throw new Error(`HEB returned non-JSON (session expired?): HTTP ${response.status}`);
  }

  const json = JSON.parse(text);

  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors[0]?.message ?? "unknown"}`);
  }

  const data = json.data?.productSearchItems;
  if (!data) return [];

  if ("code" in data) {
    throw new Error(`Search error: ${data.code} - ${data.message}`);
  }

  return data.searchGrid.items;
}
