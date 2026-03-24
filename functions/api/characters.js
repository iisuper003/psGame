export async function onRequest(context) {
    const { request, env } = context;
    const kv = env.KV;
    
    if (!kv) {
        return new Response(JSON.stringify({ error: "KV binding 'KV' is not configured. Please bind it in your Cloudflare dashboard." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    const key = "characters_list";

    try {
        if (request.method === "GET") {
            const data = await kv.get(key, { type: "json" });
            return new Response(JSON.stringify(data || []), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "POST") {
            const rawChar = await request.json();
            const data = (await kv.get(key, { type: "json" })) || [];
            
            const newChar = {
                id: rawChar.id || Date.now().toString() + Math.random().toString(36).substring(2),
                name: rawChar.name,
                category: rawChar.category,
                photoUrl: rawChar.photoUrl,
                labels: Array.isArray(rawChar.labels) ? rawChar.labels : []
            };

            data.push(newChar);
            await kv.put(key, JSON.stringify(data));

            return new Response(JSON.stringify({ message: "Character added successfully", character: newChar }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "DELETE") {
            // Check query params first
            const url = new URL(request.url);
            let id = url.searchParams.get("id");

            // Fallback to body if not in query params
            if (!id) {
                try {
                    const body = await request.json();
                    id = body.id;
                } catch (e) {
                    // Ignore JSON parsing errors for body-less requests
                }
            }

            if (!id) {
                return new Response(JSON.stringify({ error: "Missing character ID" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const data = (await kv.get(key, { type: "json" })) || [];
            const initialLength = data.length;
            const updatedData = data.filter(c => c.id !== id);

            if (updatedData.length === initialLength) {
                return new Response(JSON.stringify({ error: "Character not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" }
                });
            }

            await kv.put(key, JSON.stringify(updatedData));

            return new Response(JSON.stringify({ message: "Character deleted successfully" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        
        if (request.method === "PUT") {
            const updateData = await request.json();
            if (!updateData.id) {
                return new Response(JSON.stringify({ error: "Missing character ID for update" }), { status: 400 });
            }
            
            const data = (await kv.get(key, { type: "json" })) || [];
            const charIndex = data.findIndex(c => c.id === updateData.id);
            
            if (charIndex === -1) {
                return new Response(JSON.stringify({ error: "Character not found" }), { status: 404 });
            }
            
            // Extract explicitly to ensure labels is always properly formatted as an array
            const updatedChar = { ...data[charIndex], ...updateData };
            if (!Array.isArray(updatedChar.labels)) {
                updatedChar.labels = [];
            }
            
            data[charIndex] = updatedChar;
            await kv.put(key, JSON.stringify(data));
            
            return new Response(JSON.stringify({ message: "Character updated successfully", character: data[charIndex] }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Method Not Allowed
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
