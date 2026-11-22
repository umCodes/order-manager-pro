import { createApp } from "./app.js";
import { connectRedis } from "./config/redis.js";
import { ENV } from "./constants/env.js";
import { generateTestDraftInvoicePdf } from "./dev/testDraftInvoicePdf.js";

connectRedis().catch((error) => console.error('Failed to connect to Redis', error));

// Development aid, unchanged from before: renders the first draft invoice to
// ./test.pdf on boot. See the note in dev/testDraftInvoicePdf.ts.
generateTestDraftInvoicePdf().catch((error) => console.error("Failed to create test.pdf from draft", error));

const app = createApp();

app.listen(ENV.PORT, () => {
  console.log(`Server listening on port ${ENV.PORT}`);
});
