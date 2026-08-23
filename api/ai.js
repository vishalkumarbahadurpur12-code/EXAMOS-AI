export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing"
      });
    }

    const {
      prompt,
      imageBase64,
      mimeType
    } = req.body || {};

    if (!prompt && !imageBase64) {
      return res.status(400).json({
        error: "Prompt or image is required"
      });
    }

    const parts = [];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imageBase64
        }
      });
    }

    parts.push({
      text: prompt || "Analyze this image for a student."
    });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: parts
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2500
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed"
      });
    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") ||
      "AI ने कोई उत्तर नहीं दिया।";

    return res.status(200).json({
      success: true,
      answer: answer
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
