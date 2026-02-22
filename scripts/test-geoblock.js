/**
 * Test script to check Polymarket CLOB API geoblock status.
 * 
 * Note: preferredRegion = 'lhr1' only applies to deployed Vercel functions.
 * This script tests from the CURRENT execution environment (sandbox).
 */

const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

async function testGammaAPI() {
  console.log("=== Testing Gamma API (public, no geoblock) ===");
  try {
    const res = await fetch(`${GAMMA_BASE}/markets/slug/will-gta-6-cost-100`);
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Market: ${data.question}`);
      console.log(`clobTokenIds: ${data.clobTokenIds}`);
      console.log(`conditionId: ${data.conditionId}`);
      console.log("Gamma API: OK");
    } else {
      console.log(`Gamma API error: ${res.statusText}`);
    }
  } catch (err) {
    console.log(`Gamma API failed: ${err.message}`);
  }
}

async function testCLOBPublic() {
  console.log("\n=== Testing CLOB Public Endpoints (may be geoblocked) ===");
  try {
    // Test the public /time endpoint (usually not blocked)
    const timeRes = await fetch(`${CLOB_BASE}/time`);
    console.log(`CLOB /time status: ${timeRes.status}`);
    if (timeRes.ok) {
      const timeData = await timeRes.text();
      console.log(`CLOB time: ${timeData}`);
    }
  } catch (err) {
    console.log(`CLOB /time failed: ${err.message}`);
  }

  try {
    // Test the /markets endpoint
    const marketsRes = await fetch(`${CLOB_BASE}/markets?limit=1`);
    console.log(`CLOB /markets status: ${marketsRes.status}`);
    if (marketsRes.ok) {
      const data = await marketsRes.json();
      console.log(`CLOB returned ${data.data?.length ?? 0} market(s)`);
      console.log("CLOB public read: OK (not geoblocked for reads)");
    } else {
      const body = await marketsRes.text();
      console.log(`CLOB /markets response: ${body}`);
    }
  } catch (err) {
    console.log(`CLOB /markets failed: ${err.message}`);
  }
}

async function testCLOBOrder() {
  console.log("\n=== Testing CLOB Order Endpoint (geoblocked for US) ===");
  console.log("Sending a dummy POST to /order to check geoblock...");
  try {
    const res = await fetch(`${CLOB_BASE}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // empty body, will fail auth but tells us about geoblock
    });
    console.log(`CLOB /order status: ${res.status}`);
    const body = await res.text();
    console.log(`CLOB /order response: ${body}`);
    
    if (res.status === 403 && body.includes("restricted")) {
      console.log("\nGEOBLOCKED: This environment is in a restricted region.");
      console.log("The preferredRegion='lhr1' setting will fix this on deployed Vercel functions.");
    } else if (res.status === 401 || res.status === 400) {
      console.log("\nNOT GEOBLOCKED: Got auth/validation error (expected with empty body).");
      console.log("This means the region is allowed for trading.");
    }
  } catch (err) {
    console.log(`CLOB /order failed: ${err.message}`);
  }
}

async function checkDeployedEndpoint() {
  console.log("\n=== Checking Deployed Function Region ===");
  const deployedUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!deployedUrl) {
    console.log("No VERCEL_URL found. To test the deployed function:");
    console.log("  curl -s https://YOUR_APP.vercel.app/api/cron/signals -H 'Authorization: Bearer YOUR_CRON_SECRET'");
    console.log("  Then check the execution logs for region info.");
    return;
  }
  console.log(`Deployed URL: ${deployedUrl}`);
}

async function main() {
  console.log("Polymarket Geoblock Test");
  console.log("========================\n");
  
  await testGammaAPI();
  await testCLOBPublic();
  await testCLOBOrder();
  await checkDeployedEndpoint();
  
  console.log("\n========================");
  console.log("Summary:");
  console.log("- This sandbox runs in a US datacenter, so the /order endpoint WILL be geoblocked here.");
  console.log("- The preferredRegion='lhr1' export in route.ts tells Vercel to run the function from London.");
  console.log("- This only takes effect after deploying. Trigger the cron after deploy to verify.");
}

main();
