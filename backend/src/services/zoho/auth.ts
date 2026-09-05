import { ENV } from "../../constants/env.js";

type ZohoTokenResponse = {
    access_token: string;
    /** Lifetime in seconds — callers decide how to cache against it. */
    expires_in: number;
};

/**
 * Exchanges the long-lived refresh token for a fresh access token. Holds no
 * state of its own: the refreshZohoToken middleware caches the result for the
 * life of the token, and anything else calling this gets a brand-new one.
 */
export async function mintZohoAccessToken(): Promise<ZohoTokenResponse> {
    const params = new URLSearchParams({
        client_id: ENV.CLIENT_ID!,
        client_secret: ENV.CLIENT_SECRET!,
        refresh_token: ENV.ZOHO_REFRESH_TOKEN!,
        redirect_uri: ENV.REDIRECT_URI!,
        grant_type: "refresh_token",
    });

    const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: "POST" });
    const data = await response.json();

    if (data.hasOwnProperty("error")) {
        console.error("Error refreshing Zoho token:", data);
        throw new Error(data.error_description || "Failed to refresh Zoho token");
    }

    return { access_token: data.access_token, expires_in: data.expires_in };
}
