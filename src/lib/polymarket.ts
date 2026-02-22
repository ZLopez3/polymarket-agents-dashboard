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

  // Derive (or create) L2 API credentials from the private key
  const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
  const creds = await tempClient.createOrDeriveApiCreds();

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
  const order = await client.createOrder({
    tokenID: tokenId,
    price,
    size,
    side: side === "BUY" ? Side.BUY : Side.SELL,
    feeRateBps: 0,
    nonce: 0,
    expiration: 0,
    taker: "0x0000000000000000000000000000000000000000",
  });

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
 * Fetches market details including token IDs and tick size.
 */
export async function getMarket(conditionId: string) {
  const client = await createPolyClient();
  return client.getMarket(conditionId);
}

/**
 * Checks if the API connection and credentials are valid.
 */
export async function testConnection() {
  const client = await createPolyClient();
  const ok = await client.getOk();
  return { ok, host: HOST, chainId: CHAIN_ID };
}

export { Side, OrderType };
