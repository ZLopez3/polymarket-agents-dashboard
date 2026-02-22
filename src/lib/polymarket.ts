import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

/**
 * Derives L2 API credentials from the private key and returns an
 * authenticated ClobClient ready to place orders.
 *
 * Authentication flow:
 *  1. L1 auth: The Ethereum private key signs an EIP-712 typed message
 *     which Polymarket uses to derive API credentials (apiKey, secret, passphrase).
 *  2. L2 auth: Every HTTP request is signed with HMAC-SHA256 using the
 *     derived `secret`. The SDK handles this automatically.
 *  3. Order signing: Each order struct is signed with EIP-712 using the
 *     private key, proving the maker authorized the trade without exposing the key.
 */
export async function createPolyClient(): Promise<ClobClient> {
  const privateKey = process.env.POLY_PRIVATE_KEY;
  const publicKey = process.env.POLY_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    throw new Error(
      "Missing POLY_PRIVATE_KEY or POLY_PUBLIC_KEY environment variables"
    );
  }

  const signer = new Wallet(privateKey);

  // Derive L2 API credentials from the private key (uses existing keys, does not create new ones)
  const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
  let creds;
  try {
    creds = await tempClient.deriveApiKey();
  } catch {
    // Fall back to creating new keys if none exist yet
    creds = await tempClient.createApiKey();
  }

  // Initialize the fully-authenticated trading client
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

  return client;
}

export interface PlaceOrderParams {
  /** The CLOB token ID (YES or NO token) from the market */
  tokenId: string;
  /** Price between 0.01 and 0.99 */
  price: number;
  /** Size in shares */
  size: number;
  /** BUY or SELL */
  side: "BUY" | "SELL";
  /** Order type: GTC (good-til-cancelled), FOK (fill-or-kill), GTD (good-til-date) */
  orderType?: "GTC" | "FOK" | "GTD";
  /** Minimum tick size for this market (e.g. "0.01" or "0.001") */
  tickSize?: string;
  /** Whether this market uses neg risk (from market metadata) */
  negRisk?: boolean;
}

/**
 * Places a limit order on Polymarket.
 *
 * @returns The API response with order ID and status
 */
export async function placeOrder(params: PlaceOrderParams) {
  const {
    tokenId,
    price,
    size,
    side,
    orderType = "GTC",
    tickSize = "0.01",
    negRisk = false,
  } = params;

  const client = await createPolyClient();

  // Build the signed order using the SDK (handles EIP-712 signing internally)
  // tickSize and negRisk are passed as CreateOrderOptions (second arg)
  const validTickSizes = ["0.1", "0.01", "0.001", "0.0001"] as const;
  type TickSize = (typeof validTickSizes)[number];
  const resolvedTickSize: TickSize = validTickSizes.includes(tickSize as TickSize)
    ? (tickSize as TickSize)
    : "0.01";

  const order = await client.createOrder(
    {
      tokenID: tokenId,
      price,
      size,
      side: side === "BUY" ? Side.BUY : Side.SELL,
      feeRateBps: 0,
      nonce: 0,
    },
    { tickSize: resolvedTickSize, negRisk },
  );

  // Map to SDK OrderType enum
  const orderTypeMap: Record<string, OrderType> = {
    GTC: OrderType.GTC,
    FOK: OrderType.FOK,
    GTD: OrderType.GTD,
  };

  // Post the signed order to the CLOB
  const response = await client.postOrder(order, orderTypeMap[orderType]);

  return response;
}

/**
 * Fetches market details including token IDs and tick size from the CLOB.
 */
export async function getMarket(conditionId: string) {
  const client = await createPolyClient();
  return client.getMarket(conditionId);
}

const GAMMA_API = "https://gamma-api.polymarket.com";

/**
 * Resolves a Polymarket slug to token IDs (YES and NO) via the Gamma API.
 *
 * @returns { yesTokenId, noTokenId, conditionId, negRisk, tickSize } or null if not found
 */
export async function resolveTokenIds(slug: string): Promise<{
  yesTokenId: string;
  noTokenId: string;
  conditionId: string;
  negRisk: boolean;
  tickSize: string;
} | null> {
  try {
    const res = await fetch(`${GAMMA_API}/markets/slug/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();

    // Skip resolved, closed, or archived markets early
    // Gamma uses: closed, active, archived, umaResolutionStatus, resolvedBy, endDate
    const isClosed = data.closed === true;
    const isInactive = data.active === false;
    const isArchived = data.archived === true;
    const isResolved = data.resolved === true
      || data.umaResolutionStatus === "resolved"
      || !!data.resolvedBy;
    const isPastEnd = data.endDate && new Date(data.endDate).getTime() < Date.now();
    if (isClosed || isInactive || isArchived || isResolved || isPastEnd) {
      return null;
    }

    // clobTokenIds is a JSON string like '["yesTokenId","noTokenId"]'
    let tokenIds: string[] = [];
    if (typeof data.clobTokenIds === "string") {
      try {
        tokenIds = JSON.parse(data.clobTokenIds);
      } catch {
        return null;
      }
    } else if (Array.isArray(data.clobTokenIds)) {
      tokenIds = data.clobTokenIds;
    }

    if (tokenIds.length < 2) return null;

    // Validate that the orderbook actually exists on the CLOB before returning
    try {
      const bookRes = await fetch(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenIds[0])}`);
      if (!bookRes.ok) return null; // orderbook doesn't exist
    } catch {
      // If we can't verify, still return the tokens and let the order attempt handle the error
    }

    return {
      yesTokenId: tokenIds[0],
      noTokenId: tokenIds[1],
      conditionId: data.conditionId ?? "",
      negRisk: data.negRisk === true,
      tickSize: String(data.orderPriceMinTickSize ?? "0.01"),
    };
  } catch {
    return null;
  }
}

/**
 * Checks basic API connectivity (unauthenticated ping).
 */
export async function testConnection() {
  const tempClient = new ClobClient(HOST, CHAIN_ID);
  const ok = await tempClient.getOk();
  return { ok, host: HOST, chainId: CHAIN_ID };
}

/**
 * Derives API keys and verifies full authenticated access.
 */
export async function testAuth() {
  const client = await createPolyClient();
  const keys = await client.getApiKeys();
  return { authenticated: true, keyCount: keys?.apiKeys?.length ?? 0 };
}

export { Side, OrderType };
