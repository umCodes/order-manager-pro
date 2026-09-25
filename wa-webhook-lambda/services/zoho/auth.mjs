let cachedToken;
let cachedExpiryMs = 0;

async function mintZohoAccessToken() {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        redirect_uri: process.env.REDIRECT_URI,
        grant_type: "refresh_token",
    });

    const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: "POST" });
    const data = await response.json();

    if (data.error) {
        console.error("Error refreshing Zoho token:", data);
        throw new Error(data.error_description || "Failed to refresh Zoho token");
    }

    return { access_token: data.access_token, expires_in: data.expires_in };
}

/** Returns a cached Zoho access token, minting a new one once the cached one is close to expiry. */
export async function getZohoAccessToken() {
    if (cachedToken && Date.now() < cachedExpiryMs) return cachedToken;

    const { access_token, expires_in } = await mintZohoAccessToken();
    cachedToken = access_token;
    cachedExpiryMs = Date.now() + (expires_in - 60) * 1000;
    return cachedToken;
}
