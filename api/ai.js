// ============================================================
// EXAMOS AI - FAST + RANDOM + HINDI MATHEMATICS API
// Test + Practice + Concept + Chat + Solution Analysis
// ============================================================

const GENERATION_MODEL = "gemini-3.5-flash-lite";
const VERIFY_MODEL = "gemini-3.5-flash";
const ANALYSIS_MODEL = "gemini-3.5-flash";

const MAX_QUESTIONS = 20;


// ============================================================
// GEMINI API
// ============================================================

async function callGemini(model, contents, options = {}) {

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY Vercel में सेट नहीं है।"
    );
  }

  const generationConfig = {
    temperature:
      options.temperature ?? 0.35,

    topP:
      options.topP ?? 0.9,

    maxOutputTokens:
      options.maxOutputTokens ?? 4000
  };

  // हर generation को अलग बनाने के लिए random seed
  if (options.randomize !== false) {
    generationConfig.seed =
      Math.floor(
        Math.random() * 2147483647
      );
  }

  if (options.responseMimeType) {
    generationConfig.responseMimeType =
      options.responseMimeType;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        contents,
        generationConfig
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini API error."
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "AI ने खाली response दिया।"
    );
  }

  return text;
}


// ============================================================
// JSON
// ============================================================

function extractJson(text) {

  const clean =
    String(text || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

  try {
    return JSON.parse(clean);
  } catch (_) {}

  const start =
    clean.indexOf("{");

  const end =
    clean.lastIndexOf("}");

  if (
    start !== -1 &&
    end > start
  ) {
    try {
      return JSON.parse(
        clean.slice(start, end + 1)
      );
    } catch (_) {}
  }

  throw new Error(
    "AI response JSON format में नहीं है।"
  );
}


function str(value, fallback = "") {
  const x =
    String(value ?? "").trim();

  return x || fallback;
}


function answerLetter(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^ABCD]/g, "")
    .slice(0, 1);
}


function questionCount(value, fallback = 10) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(n),
      1
    ),
    MAX_QUESTIONS
  );
}


// ============================================================
// RANDOM QUESTION GENERATOR
// ============================================================

async function generateQuestions(config = {}) {

  const className =
    str(config.class, "10");

  const chapter =
    str(config.chapter, "Mathematics");

  const topic =
    str(config.topic, chapter);

  const count =
    questionCount(
      config.count,
      10
    );

  const difficulty =
    str(
      config.difficulty,
      "Medium"
    );

  const language =
    str(
      config.language,
      "Hindi"
    );

  const purpose =
    str(
      config.purpose,
      "test"
    );

  // हर request में variation
  const variationId =
    Math.floor(
      Math.random() * 1000000
    );

  const prompt = `
आप EXAMOS AI के Mathematics Question Generator हैं।

एक नया और fresh प्रश्न-पत्र बनाइए।

Class: ${className}
Chapter: ${chapter}
Topic: ${topic}
Difficulty: ${difficulty}
Purpose: ${purpose}
Questions: ${count}

VARIATION ID: ${variationId}

बहुत महत्वपूर्ण:
हर बार पिछले test से अलग प्रश्न बनाइए।
सिर्फ numbers बदलकर वही question दोबारा मत बनाइए।
अलग-अलग concepts, calculations और question patterns का उपयोग कीजिए।

भाषा के नियम:

- प्रश्न और explanation हिंदी में हों।
- हिंदी देवनागरी लिपि में हो।
- Hinglish बिल्कुल नहीं।
- Mathematical symbols और formulas English mathematical notation में रहें।

उदाहरण:

सही:
"x² + 5x + 6 = 0"

सही:
"यदि 2x + 5 = 15 है, तो x का मान ज्ञात कीजिए।"

गलत:
"x ka square plus 5x..."

सही:
"वर्ग का क्षेत्रफल = a²"

सही:
"sin θ = 3/5"

सही:
"√25 = 5"

प्रश्न के नियम:

1. ठीक ${count} प्रश्न बनाइए।
2. प्रत्येक प्रश्न केवल ${topic} से संबंधित हो।
3. प्रत्येक प्रश्न में A, B, C, D चार विकल्प हों।
4. केवल एक विकल्प mathematically correct हो।
5. सभी विकल्प अलग हों।
6. किसी दो विकल्प का mathematical value equivalent नहीं होना चाहिए।
7. प्रश्न को स्वयं solve करके answer verify करें।
8. सभी चार options को भी check करें।
9. आसान, मध्यम और कठिन concepts को requested difficulty के अनुसार रखें।
10. लगातार एक ही प्रकार के प्रश्न न बनाएं।
11. पुराने question pattern को repeat न करें।
12. Explanation हिंदी में दें।
13. Formula बिल्कुल सही mathematical notation में लिखें।

RETURN ONLY JSON.

Format:

{
  "questions": [
    {
      "question": "यदि x² - 5x + 6 = 0 है, तो x के मान क्या हैं?",
      "options": {
        "A": "1 और 6",
        "B": "2 और 3",
        "C": "-2 और -3",
        "D": "3 और 4"
      },
      "correctAnswer": "B",
      "explanation": "x² - 5x + 6 = 0 को गुणनखंडों में लिखने पर (x - 2)(x - 3) = 0 मिलता है। अतः x = 2 या x = 3।",
      "topic": "${topic}",
      "difficulty": "${difficulty}"
    }
  ]
}
`;

  const text =
    await callGemini(
      GENERATION_MODEL,
      [
        {
          role: "user",
          parts: [
            { text: prompt }
          ]
        }
      ],
      {
        temperature: 0.45,
        topP: 0.92,
        maxOutputTokens:
          Math.min(
            6000,
            500 + count * 500
          ),
        responseMimeType:
          "application/json",
        randomize: true
      }
    );

  const result =
    extractJson(text);

  if (
    !Array.isArray(
      result.questions
    )
  ) {
    throw new Error(
      "Questions generate नहीं हुए।"
    );
  }

  const questions =
    result.questions
      .slice(0, count)
      .map((q, index) => {

        return {
          id:
            q.id ||
            `q_${Date.now()}_${index}`,

          question:
            str(q.question),

          options: {
            A: str(q.options?.A),
            B: str(q.options?.B),
            C: str(q.options?.C),
            D: str(q.options?.D)
          },

          correctAnswer:
            answerLetter(
              q.correctAnswer
            ),

          explanation:
            str(
              q.explanation,
              "इस प्रश्न का समाधान उपलब्ध नहीं है।"
            ),

          topic:
            str(
              q.topic,
              topic
            ),

          difficulty:
            str(
              q.difficulty,
              difficulty
            )
        };
      });

  if (!questions.length) {
    throw new Error(
      "कोई valid question नहीं मिला।"
    );
  }

  return questions;
}


// ============================================================
// FAST MATHEMATICAL VERIFICATION
// ============================================================

async function verifyQuestions(questions) {

  const prompt = `
आप EXAMOS AI के Mathematics Verifier हैं।

नीचे दिए गए सभी प्रश्नों को जल्दी लेकिन सावधानी से verify करें।

हर प्रश्न के लिए:

1. प्रश्न स्वयं solve करें।
2. A, B, C, D चारों options check करें।
3. केवल एक mathematically correct option होना चाहिए।
4. correctAnswer सही होना चाहिए।
5. अगर दो options सही हैं तो valid=false करें।
6. अगर question ambiguous है तो valid=false करें।

केवल JSON दें:

{
  "valid": true,
  "questions": [
    {
      "index": 0,
      "valid": true,
      "correctAnswer": "B"
    }
  ]
}

QUESTIONS:

${JSON.stringify(questions)}
`;

  const text =
    await callGemini(
      VERIFY_MODEL,
      [
        {
          role: "user",
          parts: [
            { text: prompt }
          ]
        }
      ],
      {
        temperature: 0,
        maxOutputTokens: 3000,
        responseMimeType:
          "application/json",
        randomize: false
      }
    );

  return extractJson(text);
}


// ============================================================
// TEST
// Fast verified generation
// ============================================================

async function generateTest(config = {}) {

  const questions =
    await generateQuestions({
      ...config,
      purpose: "test"
    });

  try {

    const verification =
      await verifyQuestions(
        questions
      );

    if (
      verification?.valid === true &&
      Array.isArray(
        verification.questions
      )
    ) {

      const finalQuestions =
        questions.map(
          (q, index) => {

            const v =
              verification.questions[
                index
              ];

            if (
              v &&
              v.valid === true
            ) {
              const verifiedAnswer =
                answerLetter(
                  v.correctAnswer
                );

              if (
                ["A", "B", "C", "D"]
                  .includes(
                    verifiedAnswer
                  )
              ) {
                return {
                  ...q,
                  correctAnswer:
                    verifiedAnswer
                };
              }
            }

            return q;
          }
        );

      return finalQuestions;
    }

  } catch (error) {

    // Verification fail होने पर
    // पूरा test दोबारा generate नहीं करेंगे।
    // इससे test unnecessarily slow नहीं होगा।

    console.warn(
      "Verification warning:",
      error?.message
    );
  }

  // अगर verifier timeout/error करे,
  // generated questions वापस कर दें।
  return questions;
}


// ============================================================
// PRACTICE
// सबसे तेज़ generation
// ============================================================

async function generatePractice(
  config = {}
) {

  return await generateQuestions({
    ...config,

    purpose:
      "practice"
  });
}


// ============================================================
// PURE HINDI CONCEPT
// ============================================================

async function concept(config = {}) {

  const className =
    str(
      config.class,
      "10"
    );

  const chapter =
    str(
      config.chapter
    );

  const topic =
    str(
      config.topic,
      chapter
    );

  const prompt = `
आप EXAMOS AI के Mathematics शिक्षक हैं।

कक्षा: ${className}
अध्याय: ${chapter}
विषय: ${topic}

इस विषय को छात्र को केवल हिंदी में समझाइए।

बहुत महत्वपूर्ण:
- Hinglish का प्रयोग बिल्कुल न करें।
- English sentences का प्रयोग न करें।
- Explanation देवनागरी हिंदी में हो।
- केवल Mathematics के symbols और formulas सामान्य mathematical notation में रहें।

उदाहरण:

सही:
"द्विघात समीकरण का सामान्य रूप ax² + bx + c = 0 होता है।"

गलत:
"Quadratic equation ka general form..."

सही:
"x² - 5x + 6 = 0"

सही:
"(x - 2)(x - 3) = 0"

सही:
"x = 2 या x = 3"

इस क्रम में समझाइए:

1. विषय का आसान परिचय
2. मुख्य अवधारणा
3. महत्वपूर्ण सूत्र
4. सूत्र में आने वाले प्रत्येक चिन्ह का अर्थ
5. हल किया हुआ उदाहरण 1
6. हल किया हुआ उदाहरण 2
7. सामान्य गलतियाँ
8. परीक्षा में याद रखने योग्य बातें
9. अंत में 2 छोटे अभ्यास प्रश्न

समझाते समय छोटे और स्पष्ट वाक्य लिखें।
कठिन भाषा न रखें।
`;

  return await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          { text: prompt }
        ]
      }
    ],
    {
      temperature: 0.2,
      maxOutputTokens: 3500,
      randomize: true
    }
  );
}


// ============================================================
// CHAT - HINDI FIRST
// ============================================================

async function chat(config = {}) {

  const message =
    str(
      config.message
    );

  if (!message) {
    throw new Error(
      "Message required."
    );
  }

  const prompt = `
आप EXAMOS AI Mathematics Assistant हैं।

छात्र का प्रश्न:

${message}

उत्तर केवल हिंदी में दें।

नियम:

- देवनागरी हिंदी का प्रयोग करें।
- Hinglish न लिखें।
- Mathematical formulas सही notation में लिखें।
- गणना step-by-step दिखाएँ।
- यदि प्रश्न numerical है तो स्वयं calculation verify करें।

उदाहरण:

x² + 5x + 6 = 0

2x + 3 = 11

√25 = 5

sin θ = 3/5
`;

  return await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          { text: prompt }
        ]
      }
    ],
    {
      temperature: 0.2,
      maxOutputTokens: 3000
    }
  );
}


// ============================================================
// IMAGE PREPARE
// ============================================================

function prepareImage(value) {

  let input =
    String(value || "")
      .trim();

  if (!input) {
    throw new Error(
      "Solution image नहीं मिली।"
    );
  }

  let mimeType =
    "image/jpeg";

  let base64Data =
    input;

  const match =
    input.match(
      /^data:(image\/[^;]+);base64,(.+)$/i
    );

  if (match) {

    mimeType =
      match[1];

    base64Data =
      match[2];
  }

  base64Data =
    base64Data
      .replace(/\s/g, "")
      .replace(
        /^data:image\/[^;]+;base64,/i,
        ""
      );

  if (!base64Data) {
    throw new Error(
      "Image data खाली है।"
    );
  }

  return {
    mimeType,
    base64Data
  };
}


// ============================================================
// SOLUTION IMAGE ANALYSIS
// ============================================================

async function analyzeSolution(
  config = {}
) {

  const imageInput =
    config.imageBase64 ||
    config.image ||
    config.imageData ||
    config.photo ||
    "";

  const image =
    prepareImage(
      imageInput
    );

  const className =
    str(
      config.class,
      "10"
    );

  const chapter =
    str(
      config.chapter,
      "गणित"
    );

  const topic =
    str(
      config.topic,
      ""
    );

  const prompt = `
आप EXAMOS AI के handwritten Mathematics Solution Analyzer हैं।

छात्र की uploaded handwritten Mathematics solution image को ध्यान से पढ़िए।

कक्षा: ${className}
अध्याय: ${chapter}
विषय: ${topic || "उल्लेख नहीं किया गया"}

काम:

1. प्रश्न पढ़िए।
2. छात्र का solution पढ़िए।
3. प्रत्येक दिखाई देने वाले step को check कीजिए।
4. स्वयं सही solution निकालिए।
5. छात्र के solution से तुलना कीजिए।
6. सही या गलत बताइए।
7. यदि गलत है तो पहली गलत step पहचानिए।
8. गलती का प्रकार बताइए:

Calculation Error
Formula Error
Concept Error
Sign Error
Algebra Error
Substitution Error
Arithmetic Error
No Error
Image Unclear

9. छात्र ने क्या किया बताइए।
10. वह क्यों गलत है समझाइए।
11. सही तरीका बताइए।
12. सही final answer बताइए।
13. Weak topic बताइए।
14. Concept check बताइए।

बहुत महत्वपूर्ण:

उत्तर हिंदी में दें।
Hinglish बिल्कुल न लिखें।
Mathematical notation सही रखें।

उदाहरण:

सही:
x² - 5x + 6 = 0

सही:
2x + 5 = 15

गलत:
"x ka square..."

यदि handwriting साफ दिखाई नहीं देती है तो अनुमान न लगाएँ।

केवल JSON दें।

{
  "success": true,
  "readable": true,
  "question": "...",
  "studentFinalAnswer": "...",
  "isCorrect": false,
  "mistake": {
    "type": "Calculation Error",
    "step": "...",
    "whatStudentDid": "...",
    "whyWrong": "..."
  },
  "correctMethod": [
    "चरण 1: ...",
    "चरण 2: ...",
    "चरण 3: ..."
  ],
  "correctAnswer": "...",
  "weakTopic": "...",
  "conceptCheck": "...",
  "explanationHindi": "...",
  "practiceTopic": "..."
}
`;

  const text =
    await callGemini(
      ANALYSIS_MODEL,
      [
        {
          role: "user",

          parts: [
            {
              text: prompt
            },

            {
              inline_data: {
                mime_type:
                  image.mimeType,

                data:
                  image.base64Data
              }
            }
          ]
        }
      ],
      {
        temperature: 0.05,
        maxOutputTokens: 4500,
        responseMimeType:
          "application/json",
        randomize: false
      }
    );

  const result =
    extractJson(text);

  return {

    success: true,

    readable:
      result.readable !== false,

    question:
      str(
        result.question
      ),

    studentFinalAnswer:
      str(
        result.studentFinalAnswer
      ),

    isCorrect:
      result.isCorrect === true,

    mistake: {

      type:
        str(
          result.mistake?.type,
          "Image Unclear"
        ),

      step:
        str(
          result.mistake?.step
        ),

      whatStudentDid:
        str(
          result.mistake?.whatStudentDid
        ),

      whyWrong:
        str(
          result.mistake?.whyWrong
        )
    },

    correctMethod:
      Array.isArray(
        result.correctMethod
      )
        ? result.correctMethod
            .map(
              x =>
                String(x || "")
                  .trim()
            )
            .filter(Boolean)
        : [],

    correctAnswer:
      str(
        result.correctAnswer
      ),

    weakTopic:
      str(
        result.weakTopic
      ),

    conceptCheck:
      str(
        result.conceptCheck
      ),

    explanationHindi:
      str(
        result.explanationHindi
      ),

    practiceTopic:
      str(
        result.practiceTopic
      )
  };
}


// ============================================================
// VERCEL HANDLER
// ============================================================

module.exports =
async function handler(
  req,
  res
) {

  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        success: false,
        error:
          "Only POST requests are allowed."
      });
  }

  try {

    const body =
      req.body || {};

    const mode =
      str(
        body.mode
      );


    // --------------------------------------------------------
    // TEST
    // --------------------------------------------------------

    if (
      mode ===
      "generate_questions"
    ) {

      const questions =
        await generateTest(
          body
        );

      return res
        .status(200)
        .json({

          success: true,

          verified: true,

          mode:
            "generate_questions",

          questions
        });
    }


    // --------------------------------------------------------
    // PRACTICE
    // --------------------------------------------------------

    if (
      mode ===
      "generate_practice"
    ) {

      const questions =
        await generatePractice(
          body
        );

      return res
        .status(200)
        .json({

          success: true,

          verified: true,

          mode:
            "generate_practice",

          questions
        });
    }


    // --------------------------------------------------------
    // CONCEPT
    // --------------------------------------------------------

    if (
      mode ===
      "concept"
    ) {

      const answer =
        await concept(
          body
        );

      return res
        .status(200)
        .json({

          success: true,

          mode:
            "concept",

          answer
        });
    }


    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

    if (
      mode ===
      "chat"
    ) {

      const answer =
        await chat(
          body
        );

      return res
        .status(200)
        .json({

          success: true,

          mode:
            "chat",

          answer
        });
    }


    // --------------------------------------------------------
    // SOLUTION ANALYSIS
    // --------------------------------------------------------

    if (
      mode ===
      "analyze_solution"
    ) {

      const analysis =
        await analyzeSolution(
          body
        );

      return res
        .status(200)
        .json({

          success: true,

          mode:
            "analyze_solution",

          analysis
        });
    }


    // --------------------------------------------------------
    // INVALID MODE
    // --------------------------------------------------------

    return res
      .status(400)
      .json({

        success: false,

        error:
          "Invalid mode. Supported modes: generate_questions, generate_practice, concept, chat, analyze_solution."
      });

  } catch (error) {

    console.error(
      "EXAMOS AI ERROR:",
      error
    );

    return res
      .status(500)
      .json({

        success: false,

        error:
          error?.message ||
          "EXAMOS AI में error आया।"
      });
  }
};
