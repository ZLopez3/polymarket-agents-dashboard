/**
 * trade-example.js
 *
 * Standalone Node.js example for placing orders on Polymarket.
 * Uses @polymarket/clob-client + ethers v5.
 *
 * Required environment variables:
 *   POLY_PRIVATE_KEY  -- Your Ethereum private key (never displayed)
 *   POLY_PUBLIC_KEY   -- Your Polygon wallet address
 *
 * Usage:
 *   POLY_PRIVATE_KEY=0x... POLY_PUBLIC_KEY=0x... node scripts/trade-example.js
 *
 * ---------------------------------------------------------------
 * HOW POLYMARKET AUTHENTICATION WORKS:
 *
 * 1. L1 Auth (EIP-712 Signing):
 *    Your private key signs a typed EIP-712 message which Polymarket
 *    uses to derive API credentials (apiKey, secret, passphrase).
 *    This only needs to happen once -- credentials are deterministic
 *    from the same key.
 *
 * 2. L2 Auth (HMAC-SHA256):
 *    Every HTTP request to the CLOB API includes 5 headers:
 *      - POLY_ADDRESS:    your wallet address
 *      - POLY_API_KEY:    your derived apiKey
 *      - POLY_PASSPHRASE: your derived passphrase
 *      - POLY_TIMESTAMP:  current UNIX timestamp (seconds)
 *      - POLY_SIGNATURE:  HMAC-SHA256(secret, timestamp+method+path+body)
 *    The SDK generates these automatically on every request.
 *
 * 3. Order Signing (EIP-712):
 *    Each order is a typed struct signed with your private key.
 *    The signature proves you authorized the trade without ever
 *    sending your key to Polymarket. The signed order includes:
 *    maker, taker, tokenId, makerAmount, takerAmount, side,
 *    expiration, nonce, feeRateBps, salt, and signatureType.
 *
 * A simple cURL cannot do this because:
 *  - Orders must be cryptographically signed structs (EIP-712)
 *  - HTTP requests need HMAC-signed auth headers
 *  - The SDK handles amount conversion (6-decimal fixed math)
 * ---------------------------------------------------------------
 */

import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

async function main() {
  const privateKey = process.env.POLY_PRIVATE_KEY;
  const publicKey = process.env.POLY_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    console.error("ERROR: Set POLY_PRIVATE_KEY and POLY_PUBLIC_KEY env vars");
    process.exit(1);
  }

  console.log(`Wallet: ${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`);

  // -- Step 1: Create signer and derive API credentials --
  const signer = new Wallet(privateKey);
  const tempClient = new ClobClient(HOST, CHAIN_ID, signer);

  console.log("Deriving API credentials...");
  const creds = await tempClient.createOrDeriveApiCreds();
  console.log(`API Key: ${creds.apiKey.slice(0, 8)}...`);

  // -- Step 2: Initialize authenticated client --
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

  // -- Step 3: Test connectivity --
  const ok = await client.getOk();
  console.log(`API status: ${ok}`);

  // -- Step 4: Fetch a sample market --
  console.log("\nFetching a sample market...");
  const markets = await client.getMarkets({ next_cursor: "MA==" });
  const market = markets.data?.[0];

  if (!market) {
    console.log("No markets found.");
    return;
  }

  console.log(`Market: ${market.question}`);
  console.log(`Condition ID: ${market.condition_id}`);
  console.log(`Tick size: ${market.minimum_tick_size}`);
  console.log(
    `Tokens: ${market.tokens?.map((t) => `${t.outcome}=${t.token_id.slice(0, 16)}...`).join(", ")}`
  );

  // -- Step 5: Build and place a test order --
  // IMPORTANT: Uncomment and modify the block below to actually place an order.
  // This is commented out to prevent accidental trades.
  /*
  const yesToken = market.tokens[0]; // First token is YES
  const tickSize = String(market.minimum_tick_size || "0.01");

  console.log("\nBuilding order...");
  const order = await client.createOrder({
    tokenID: yesToken.token_id,
    price: 0.50,
    size: 10,
    side: Side.BUY,
    feeRateBps: 0,
    nonce: 0,
    expiration: 0,
    taker: "0x0000000000000000000000000000000000000000",
  });

  console.log("Posting order...");
  const response = await client.postOrder(order, OrderType.GTC);
  console.log("Order response:", JSON.stringify(response, null, 2));
  */

  console.log("\nTest complete. Uncomment the order block above to place a real trade.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
