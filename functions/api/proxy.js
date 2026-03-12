export async function onRequest(context) {
    const { request } = context;
    const urlString = new URL(request.url).searchParams.get("url");

    if (!urlString) {
        return new Response("Missing 'url' parameter", { status: 400 });
    }

    try {
        const targetUrl = new URL(urlString);
        
        // Fetch the image from the origin server
        // Cloudflare Edge will make this request, bypassing local ISP blocks
        const response = await fetch(targetUrl.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
            }
        });

        // Copy the response to modify headers without mutating original
        const newResponse = new Response(response.body, response);
        
        // Add CORS so the browser accepts it, and Cache-Control to speed up future loads
        newResponse.headers.set("Access-Control-Allow-Origin", "*");
        if (response.status === 200) {
            newResponse.headers.set("Cache-Control", "public, max-age=86400");
        }

        return newResponse;
    } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to proxy image: " + err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
