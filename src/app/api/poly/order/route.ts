import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getMarket, type PlaceOrderParams } from "@/lib/polymarket";

/**
 * POST /api/poly/order
 *
 * Places a limit order on Polymarket.
 *
 * Body:
 *  {
 *    "tokenId": "12345...",       // CLOB token ID (YES or NO token)
 *    "price": 0.55,               // Price between 0.01-0.99
 *    "size": 10,                  // Number of shares
 *    "side": "BUY",               // "BUY" or "SELL"
 *    "orderType": "GTC",          // Optional: "GTC" | "FOK" | "GTD"
 *    "conditionId": "0xabc...",   // Optional: if provided, fetches tick size & neg risk
 *  }
 *
 * Authentication: Secured with CRON_SECRET or can be restricted further.
 */
export async function POST(request: NextRequest) {
  // Verify caller is authorized
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tokenId, price, size, side, orderType, conditionId } = body;

    // Validate required fields
    if (!tokenId || price == null || !size || !side) {
      return NextResponse.json(
        {
          error: "Missing required fields: tokenId, price, size, side",
          example: {
            tokenId: "71321045679252212594626385532706912750332728571942532289631379312455583992563",
            price: 0.50,
            size: 10,
            side: "BUY",
            conditionId: "0x...",
          },
        },
        { status: 400 }
      );
    }

    if (price < 0.01 || price > 0.99) {
      return NextResponse.json(
        { error: "Price must be between 0.01 and 0.99" },
        { status: 400 }
      );
    }

    if (!["BUY", "SELL"].includes(side)) {
      return NextResponse.json(
        { error: 'Side must be "BUY" or "SELL"' },
        { status: 400 }
      );
    }

    // Optionally fetch market metadata for tick size and neg risk
    let tickSize = "0.01";
    let negRisk = false;

    if (conditionId) {
      try {
        const market = await getMarket(conditionId);
        tickSize = String(market.minimum_tick_size || "0.01");
        negRisk = Boolean(market.neg_risk);
      } catch {
        // Fall back to defaults if market fetch fails
      }
    }

    const orderParams: PlaceOrderParams = {
      tokenId,
      price: Number(price),
      size: Number(size),
      side,
      orderType: orderType || "GTC",
      tickSize,
      negRisk,
    };

    const response = await placeOrder(orderParams);

    return NextResponse.json({
      status: "order_placed",
      order: response,
      params: {
        tokenId: `${tokenId.slice(0, 10)}...`,
        price,
        size,
        side,
        orderType: orderType || "GTC",
        tickSize,
        negRisk,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
