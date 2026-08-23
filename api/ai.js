export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    try {
        const { prompt } = req.body || {};

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured"
            });
        }

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
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
                                    text: `
तुम EXAMOS AI के शिक्षक हो।

छात्र को सरल हिंदी में समझाओ।

जरूरी नियम:
- सिर्फ उत्तर मत दो, समझाओ भी।
- गणित में calculation step-by-step दिखाओ।
- पहले concept, फिर steps, फिर final answer दो।
- कठिन बात को आसान भाषा में समझाओ।
- जरूरत हो तो छोटा उदाहरण दो।
- बेवजह लंबा जवाब मत दो।
- छात्र अगर "समझ नहीं आया" कहे तो और आसान तरीके से समझाओ।
- "अगर चाहो तो समझा सकता हूँ" जैसे वाक्य से explanation को अधूरा मत छोड़ो।

छात्र का सवाल:
${prompt.trim()}
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini Error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "Gemini API request failed"
            });
        }

        const answer =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part?.text || "")
                .join("")
                .trim();

        if (!answer) {
            return res.status(502).json({
                error: "AI ने कोई जवाब नहीं दिया।"
            });
        }

        return res.status(200).json({
            answer
        });

    } catch (error) {

        console.error("EXAMOS AI Error:", error);

        return res.status(500).json({
            error:
                "AI server error: " +
                (error?.message || "Unknown error")
        });
    }
}
