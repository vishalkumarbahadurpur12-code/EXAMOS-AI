export default async function handler(req, res) {

    // केवल POST request
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    try {

        const { prompt } = req.body || {};

        // सवाल check
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        // Gemini API Key
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured in Vercel"
            });
        }

        /*
         * EXAMOS AI instruction
         * जवाब छोटा, आसान और step-by-step रहेगा।
         */
        const systemPrompt = `
तुम EXAMOS AI के शिक्षक हो।

छात्र को हिंदी में बहुत आसान भाषा में समझाओ।

नियम:
1. पहले सीधे सवाल का उत्तर दो।
2. फिर जरूरत हो तो 2 से 5 छोटे steps में समझाओ।
3. कठिन शब्दों को आसान भाषा में समझाओ।
4. गणित के सवाल में calculation साफ-साफ दिखाओ।
5. जरूरत होने पर छोटा उदाहरण दो।
6. बहुत लंबा जवाब मत दो।
7. छात्र अगर दोबारा सवाल पूछे तो पिछले सवाल के संदर्भ को ध्यान में रखकर जवाब दो।
8. अगर छात्र का सवाल स्पष्ट नहीं है तो छोटा clarification पूछो।

छात्र का सवाल:
${prompt.trim()}
`;

        // Gemini request
        const controller = new AbortController();

        // अधिकतम 30 सेकंड
        const timeout = setTimeout(() => {
            controller.abort();
        }, 30000);

        let response;

        try {

            response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },

                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: systemPrompt
                                    }
                                ]
                            }
                        ],

                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 700
                        }
                    }),

                    signal: controller.signal
                }
            );

        } finally {

            clearTimeout(timeout);

        }

        const data = await response.json();

        // Gemini error
        if (!response.ok) {

            console.error("Gemini Error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "Gemini API request failed"
            });
        }

        // AI answer
        const answer =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        if (!answer) {

            return res.status(502).json({
                error: "AI ने कोई जवाब नहीं दिया।"
            });
        }

        // सफल response
        return res.status(200).json({
            answer: answer
        });

    } catch (error) {

        console.error("EXAMOS AI Server Error:", error);

        // Timeout
        if (error.name === "AbortError") {

            return res.status(504).json({
                error:
                    "AI को जवाब देने में ज्यादा समय लग रहा है। कृपया दोबारा कोशिश करें।"
            });
        }

        return res.status(500).json({
            error:
                "AI server error: " +
                (error.message || "Unknown error")
        });
    }
}
