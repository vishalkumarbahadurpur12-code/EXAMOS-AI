export default async function handler(req, res) {
    // केवल POST request
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    try {
        const { prompt } = req.body || {};

        // सवाल की जाँच
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        // Gemini API Key
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured"
            });
        }

        /*
         * EXAMOS AI Teacher Prompt
         */
        const instruction = `
तुम EXAMOS AI के शिक्षक हो।

छात्र के सवाल का जवाब सरल हिंदी में दो।

बहुत जरूरी नियम:

1. केवल अंतिम उत्तर देकर मत छोड़ो।
2. छात्र को समझाओ कि उत्तर कैसे आया।
3. गणित के सवाल में:
   - पहले छोटा Concept बताओ
   - फिर Step 1
   - फिर Step 2
   - जरूरत हो तो Step 3
   - अंत में साफ Final Answer दो
4. कठिन शब्दों को आसान हिंदी में समझाओ।
5. जरूरत होने पर छोटा उदाहरण दो।
6. बहुत लंबी भूमिका मत लिखो।
7. सवाल छोटा हो तो जवाब भी छोटा रखो।
8. लेकिन उत्तर समझने के लिए जरूरी steps कभी मत छोड़ो।
9. छात्र अगर "समझ नहीं आया" कहे तो उसी चीज को और आसान तरीके से समझाओ।
10. सीधे जवाब देना शुरू करो। "अगर चाहो तो..." कहकर explanation को मत छोड़ो।

जवाब का अच्छा format:

उत्तर:
[सीधा उत्तर]

समझें:
[आसान explanation]

Step 1:
[पहला जरूरी step]

Step 2:
[दूसरा जरूरी step]

Final Answer:
[अंतिम उत्तर]

छात्र का सवाल:
${prompt.trim()}
`;

        /*
         * Gemini API
         */
        const controller = new AbortController();

        // अधिकतम 25 सेकंड
        const timeout = setTimeout(() => {
            controller.abort();
        }, 25000);

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
                                        text: instruction
                                    }
                                ]
                            }
                        ],

                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 500
                        }
                    }),

                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json();

        /*
         * Gemini error
         */
        if (!response.ok) {
            console.error("Gemini API Error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "Gemini API request failed"
            });
        }

        /*
         * AI response निकालना
         */
        const parts =
            data?.candidates?.[0]?.content?.parts || [];

        const answer = parts
            .map(part => part?.text || "")
            .join("")
            .trim();

        if (!answer) {
            return res.status(502).json({
                error: "AI ने कोई जवाब नहीं दिया।"
            });
        }

        /*
         * Frontend को जवाब
         */
        return res.status(200).json({
            answer: answer
        });

    } catch (error) {

        console.error("EXAMOS AI Error:", error);

        if (error?.name === "AbortError") {
            return res.status(504).json({
                error:
                    "AI को जवाब देने में बहुत समय लग रहा है। कृपया दोबारा कोशिश करें।"
            });
        }

        return res.status(500).json({
            error:
                "AI server error: " +
                (error?.message || "Unknown error")
        });
    }
}
