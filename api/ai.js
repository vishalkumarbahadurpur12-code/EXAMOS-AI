export default async function handler(req, res) {
    // केवल POST request स्वीकार करें
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    try {
        const { prompt } = req.body || {};

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({
                error: "Prompt is required"
            });
        }

        // Vercel Environment Variable
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured"
            });
        }

        // Gemini AI
        const response = await fetch(
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
                                    text:
                                        "तुम EXAMOS AI के शिक्षक हो। " +
                                        "छात्र को सरल हिंदी में समझाओ। " +
                                        "जरूरत पड़ने पर उदाहरण और step-by-step समाधान दो।\n\n" +
                                        "छात्र का सवाल:\n" +
                                        prompt
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
                ?.map(part => part.text || "")
                .join("") ||
            "AI ने कोई जवाब नहीं दिया।";

        return res.status(200).json({
            answer: answer
        });

    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: "AI server error: " + error.message
        });
    }
}
