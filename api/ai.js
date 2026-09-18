const GENERATION_MODEL = "gemini-3.5-flash-lite";
const ANALYSIS_MODEL = "gemini-3.5-flash";
const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_QUESTIONS = 20;
const REQUEST_TIMEOUT = 45000;


// ============================================================
// MAIN VERCEL HANDLER
// ============================================================

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are allowed."
    });
  }

  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error:
        "GEMINI_API_KEY Vercel Environment Variables में नहीं मिला।"
    });
  }

  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const mode =
      String(
        body.mode || ""
      ).trim();

    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

    if (mode === "chat") {
      return await handleChat(
        req,
        res,
        apiKey,
        body
      );
    }

    // --------------------------------------------------------
    // CONCEPT
    // --------------------------------------------------------

    if (mode === "concept") {
      return await handleConcept(
        req,
        res,
        apiKey,
        body
      );
    }

    // --------------------------------------------------------
    // TEST
    // --------------------------------------------------------

    if (
      mode === "generate_questions"
    ) {
      return await handleGenerateQuestions(
        req,
        res,
        apiKey,
        body
      );
    }

    // --------------------------------------------------------
    // PRACTICE
    // --------------------------------------------------------

    if (
      mode === "generate_practice"
    ) {
      return await handleGeneratePractice(
        req,
        res,
        apiKey,
        body
      );
    }

    // --------------------------------------------------------
    // SOLUTION IMAGE ANALYSIS
    // --------------------------------------------------------

    if (
      mode === "analyze_solution"
    ) {
      return await handleAnalyzeSolution(
        req,
        res,
        apiKey,
        body
      );
    }

    return res.status(400).json({
      success: false,
      error:
        "Invalid mode. Supported modes: generate_questions, generate_practice, concept, chat, analyze_solution."
    });

  } catch (error) {

    console.error(
      "EXAMOS AI ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "AI server error."
    });
  }
};


// ============================================================
// CHAT
// ============================================================

async function handleChat(
  req,
  res,
  apiKey,
  body
) {

  // नए frontend का message
  // और पुराने frontend का prompt
  // दोनों support होंगे।

  const message =
    clean(
      body.message ||
      body.prompt
    );

  if (!message) {
    return res.status(400).json({
      success: false,
      error: "Message required."
    });
  }

  const className =
    clean(
      body.class ||
      body.className
    ) || "10";

  const chapter =
    clean(
      body.chapter
    );

  const prompt = `
तुम EXAMOS AI के Mathematics Teacher हो।

छात्र का प्रश्न:
${message}

Student Class:
${className}

Board:
${clean(body.board) || "Bihar Board"}

Chapter:
${chapter || "Not specified"}

बहुत महत्वपूर्ण नियम:

1. उत्तर केवल देवनागरी हिंदी में दो।
2. Hinglish में उत्तर मत दो।
3. English explanation मत दो।
4. Mathematical notation बिल्कुल सही रखो।
5. Formula को सही रूप में लिखो।
6. जरूरत हो तो step-by-step solution दो।
7. Numerical calculation दोबारा check करो।
8. छात्र के स्तर के अनुसार आसान भाषा रखो।
9. बिना जरूरत बहुत लंबा उत्तर मत दो।
10. अगर प्रश्न में गलती है तो पहले सही interpretation बताओ।
11. अंतिम उत्तर स्पष्ट रूप से बताओ।

उदाहरण mathematical notation:

x² + 5x + 6 = 0

2x + 5 = 15

√25 = 5

sin θ = 3/5

x ≤ 5

a² + b² = c²

उत्तर हिंदी में होना चाहिए, लेकिन mathematical symbols वैसे ही रहने चाहिए।
`;

  const answer =
    await geminiText(
      apiKey,
      GENERATION_MODEL,
      prompt,
      {
        maxOutputTokens: 2500
      }
    );

  return res.status(200).json({
    success: true,
    mode: "chat",
    answer
  });
}


// ============================================================
// CONCEPT EXPLANATION
// ============================================================

async function handleConcept(
  req,
  res,
  apiKey,
  body
) {

  const className =
    clean(
      body.class ||
      body.className
    ) || "10";

  const chapter =
    clean(
      body.chapter
    );

  const topic =
    clean(
      body.topic
    ) || chapter;

  const message =
    clean(
      body.message ||
      body.prompt
    );

  if (
    !topic &&
    !message
  ) {
    return res.status(400).json({
      success: false,
      error:
        "Message required."
    });
  }

  const request =
    message ||
    `
कक्षा ${className} के गणित में
अध्याय "${chapter}"
और विषय "${topic}" समझाओ।
`;

  const prompt = `
तुम EXAMOS AI के Mathematics Teacher हो।

${request}

सिर्फ देवनागरी हिंदी में समझाओ।

Hinglish बिल्कुल नहीं।

इस structure में उत्तर दो:

1. अवधारणा क्या है?
2. आसान भाषा में समझाओ।
3. मुख्य सूत्र लिखो।
4. सूत्र का अर्थ समझाओ।
5. एक छोटा solved example दो।
6. दूसरा example दो यदि आवश्यक हो।
7. Question solve करते समय होने वाली सामान्य गलतियाँ बताओ।
8. अंत में "याद रखने योग्य बातें" में 3 points दो।

Mathematical notation बिल्कुल सही रखो।

उदाहरण:

a = bq + r

0 ≤ r < b

x²

√a

sin θ

cos θ

tan θ

सभी formulas को mathematical form में ही रखो।

Class:
${className}

Chapter:
${chapter}

Topic:
${topic}
`;

  const answer =
    await geminiText(
      apiKey,
      GENERATION_MODEL,
      prompt,
      {
        maxOutputTokens: 3000
      }
    );

  return res.status(200).json({
    success: true,
    mode: "concept",
    answer
  });
}


// ============================================================
// TEST GENERATION
// ============================================================

async function handleGenerateQuestions(
  req,
  res,
  apiKey,
  body
) {

  const result =
    await generateQuestionSet(
      apiKey,
      body,
      "diagnostic"
    );

  return res.status(200).json({
    success: true,
    verified: true,
    mode: "generate_questions",
    questions:
      result.questions,
    requestId:
      result.requestId
  });
}


// ============================================================
// PRACTICE GENERATION
// ============================================================

async function handleGeneratePractice(
  req,
  res,
  apiKey,
  body
) {

  const result =
    await generateQuestionSet(
      apiKey,
      body,
      "practice"
    );

  return res.status(200).json({
    success: true,
    verified: true,
    mode: "generate_practice",
    questions:
      result.questions,
    requestId:
      result.requestId
  });
}


// ============================================================
// COMMON QUESTION GENERATOR
// ============================================================

async function generateQuestionSet(
  apiKey,
  body,
  purpose
) {

  const className =
    clean(
      body.class ||
      body.className
    ) || "10";

  const chapter =
    clean(
      body.chapter
    );

  const topic =
    clean(
      body.topic
    );

  const difficulty =
    normalizeDifficulty(
      body.difficulty
    );

  let count =
    Number(
      body.count ||
      body.questionCount ||
      10
    );

  if (
    !Number.isInteger(count)
  ) {
    count = 10;
  }

  count =
    Math.max(
      1,
      Math.min(
        MAX_QUESTIONS,
        count
      )
    );

  if (!chapter) {
    throw new Error(
      "Chapter required."
    );
  }

  const requestId =
    clean(
      body.requestId
    ) ||
    (
      Date.now() +
      "-" +
      Math.random()
        .toString(36)
        .slice(2, 10)
    );

  const previousQuestions =
    Array.isArray(
      body.previousQuestions
    )
      ? body.previousQuestions
          .slice(-20)
          .map(
            x =>
              String(x || "")
                .slice(0, 500)
          )
      : [];

  const previousText =
    previousQuestions.length
      ? `
इन recent questions को repeat मत करो:

${previousQuestions
  .map(
    (q, i) =>
      `${i + 1}. ${q}`
  )
  .join("\n")}
`
      : "";

  const prompt = `
तुम EXAMOS AI के Mathematics Question Generator हो।

एक बिल्कुल नया ${purpose === "practice"
    ? "practice"
    : "diagnostic test"} question set बनाओ।

Class:
${className}

Board:
${clean(body.board) || "Bihar Board"}

Subject:
Mathematics

Chapter:
${chapter}

Topic:
${topic || "Chapter के किसी relevant topic से"}

Difficulty:
${difficulty}

Question Count:
${count}

Request ID:
${requestId}

${previousText}

===============================
IMPORTANT QUESTION RULES
===============================

1. Exactly ${count} questions बनाओ।

2. हर question Mathematics का होना चाहिए।

3. हर question इसी Class के स्तर का होना चाहिए।

4. Chapter से बाहर का question मत बनाओ।

5. Topic दिया गया है तो उसी topic से question बनाओ।

6. हर question के exactly 4 options हों:
A
B
C
D

7. केवल ONE option mathematically correct होना चाहिए।

8. सभी चार options को खुद solve करके check करो।

9. दो options equivalent नहीं होने चाहिए।

10. correctAnswer केवल A/B/C/D हो।

11. Question repeat मत करो।

12. पुराने questions को सिर्फ numbers बदलकर repeat मत करो।

13. अलग-अलग question patterns इस्तेमाल करो।

14. Calculations दोबारा check करो।

15. Algebraic expressions सही रखो।

16. Mathematical notation सही रखो।

17. Hindi explanation देवनागरी में हो।

18. Hinglish बिल्कुल नहीं।

19. English sentences मत लिखो।

20. Formula को plain गलत text में मत लिखो।

सही examples:

x² + 5x + 6 = 0

√25 = 5

a² + b² = c²

sin θ = 3/5

a = bq + r

0 ≤ r < b

===============================
SELF CHECK
===============================

Question बनाने के बाद:

- Question solve करो।
- A solve करो।
- B solve करो।
- C solve करो।
- D solve करो।
- केवल एक correct option confirm करो।
- अगर दो correct options मिलें तो question बदल दो।
- अगर कोई ambiguity हो तो question बदल दो।
- फिर final JSON दो।

===============================
LANGUAGE
===============================

Question:
देवनागरी हिंदी

Options:
देवनागरी हिंदी + mathematical notation

Explanation:
देवनागरी हिंदी

===============================
JSON ONLY
===============================

{
  "questions": [
    {
      "id": "unique-id",
      "question": "प्रश्न",
      "options": {
        "A": "विकल्प",
        "B": "विकल्प",
        "C": "विकल्प",
        "D": "विकल्प"
      },
      "correctAnswer": "A",
      "topic": "विषय",
      "difficulty": "medium",
      "explanation": "संक्षिप्त समाधान"
    }
  ]
}
`;

  const schema = {
    type: "object",

    properties: {

      questions: {
        type: "array",

        items: {

          type: "object",

          properties: {

            id: {
              type: "string"
            },

            question: {
              type: "string"
            },

            options: {
              type: "object",

              properties: {

                A: {
                  type: "string"
                },

                B: {
                  type: "string"
                },

                C: {
                  type: "string"
                },

                D: {
                  type: "string"
                }

              },

              required: [
                "A",
                "B",
                "C",
                "D"
              ]
            },

            correctAnswer: {
              type: "string",
              enum: [
                "A",
                "B",
                "C",
                "D"
              ]
            },

            topic: {
              type: "string"
            },

            difficulty: {
              type: "string"
            },

            explanation: {
              type: "string"
            }

          },

          required: [
            "id",
            "question",
            "options",
            "correctAnswer",
            "topic",
            "difficulty",
            "explanation"
          ]
        }
      }

    },

    required: [
      "questions"
    ]
  };

  let questions =
    await geminiJSON(
      apiKey,
      GENERATION_MODEL,
      prompt,
      schema,
      {
        maxOutputTokens:
          Math.min(
            7000,
            900 +
            count * 420
          )
      }
    );

  questions =
    normalizeQuestions(
      questions.questions,
      count,
      topic,
      difficulty
    );

  let validation =
    validateQuestions(
      questions,
      count,
      topic,
      difficulty
    );

  // एक ही fast retry
  // लगातार multiple verification calls नहीं।
  if (!validation.valid) {

    const retryPrompt =
      prompt +
      `

IMPORTANT RETRY:
पहले generated questions में समस्या मिली थी:

${validation.errors.join("\n")}

इस बार सभी questions नए बनाओ।
हर option को solve करके exactly ONE correct option रखो।
`;

    const retry =
      await geminiJSON(
        apiKey,
        GENERATION_MODEL,
        retryPrompt,
        schema,
        {
          maxOutputTokens:
            Math.min(
              7000,
              900 +
              count * 420
            )
        }
      );

    questions =
      normalizeQuestions(
        retry.questions,
        count,
        topic,
        difficulty
      );

    validation =
      validateQuestions(
        questions,
        count,
        topic,
        difficulty
      );
  }

  if (!validation.valid) {
    throw new Error(
      "AI ने valid Mathematics question set generate नहीं किया। कृपया फिर से try करें।"
    );
  }

  return {
    questions,
    requestId
  };
}


// ============================================================
// NORMALIZE QUESTIONS
// ============================================================

function normalizeQuestions(
  input,
  count,
  requestedTopic,
  requestedDifficulty
) {

  if (
    !Array.isArray(input)
  ) {
    return [];
  }

  return input
    .slice(0, count)
    .map(
      (q, index) => {

        const options =
          q?.options || {};

        return {

          id:
            clean(
              q?.id
            ) ||
            `q-${Date.now()}-${index}`,

          question:
            clean(
              q?.question
            ),

          options: {

            A:
              clean(
                options.A
              ),

            B:
              clean(
                options.B
              ),

            C:
              clean(
                options.C
              ),

            D:
              clean(
                options.D
              )
          },

          correctAnswer:
            normalizeAnswer(
              q?.correctAnswer
            ),

          topic:
            clean(
              q?.topic
            ) ||
            requestedTopic ||
            "General",

          difficulty:
            normalizeDifficulty(
              q?.difficulty
            ) === "mixed"
              ? (
                  requestedDifficulty === "mixed"
                    ? "medium"
                    : requestedDifficulty
                )
              : normalizeDifficulty(
                  q?.difficulty
                ),

          explanation:
            clean(
              q?.explanation
            )
        };
      }
    );
}


// ============================================================
// QUESTION VALIDATION
// ============================================================

function validateQuestions(
  questions,
  count,
  topic,
  difficulty
) {

  const errors = [];

  if (
    !Array.isArray(
      questions
    )
  ) {
    return {
      valid: false,
      errors: [
        "Questions array missing."
      ]
    };
  }

  if (
    questions.length !== count
  ) {
    errors.push(
      `Expected ${count} questions but got ${questions.length}.`
    );
  }

  const seen =
    new Set();

  questions.forEach(
    (q, index) => {

      const number =
        index + 1;

      if (
        !q.question
      ) {
        errors.push(
          `Question ${number}: missing question.`
        );
      }

      const letters = [
        "A",
        "B",
        "C",
        "D"
      ];

      for (
        const letter of letters
      ) {

        if (
          !q.options?.[letter]
        ) {
          errors.push(
            `Question ${number}: option ${letter} missing.`
          );
        }
      }

      const optionValues =
        letters.map(
          letter =>
            normalizeText(
              q.options?.[letter]
            )
        );

      if (
        new Set(
          optionValues
        ).size !== 4
      ) {
        errors.push(
          `Question ${number}: duplicate options.`
        );
      }

      if (
        !letters.includes(
          q.correctAnswer
        )
      ) {
        errors.push(
          `Question ${number}: invalid correctAnswer.`
        );
      }

      if (
        !q.explanation
      ) {
        errors.push(
          `Question ${number}: explanation missing.`
        );
      }

      if (
        !q.topic
      ) {
        errors.push(
          `Question ${number}: topic missing.`
        );
      }

      const questionKey =
        normalizeText(
          q.question
        );

      if (
        seen.has(
          questionKey
        )
      ) {
        errors.push(
          `Question ${number}: duplicate question.`
        );
      }

      seen.add(
        questionKey
      );

      if (
        difficulty !== "mixed" &&
        q.difficulty !== difficulty
      ) {
        errors.push(
          `Question ${number}: difficulty mismatch.`
        );
      }

      if (
        topic &&
        normalizeText(q.topic) !==
        normalizeText(topic)
      ) {
        errors.push(
          `Question ${number}: topic mismatch.`
        );
      }
    }
  );

  return {
    valid:
      errors.length === 0,

    errors
  };
}


// ============================================================
// SOLUTION IMAGE ANALYSIS
// ============================================================

async function handleAnalyzeSolution(
  req,
  res,
  apiKey,
  body
) {

  let imageData =
    clean(
      body.imageBase64 ||
      body.image ||
      body.imageData ||
      body.photo
    );

  if (!imageData) {
    return res.status(400).json({
      success: false,
      error:
        "Solution image required."
    });
  }

  let mimeType =
    "image/jpeg";

  // data:image/jpeg;base64,...
  const match =
    imageData.match(
      /^data:(image\/[^;]+);base64,(.+)$/i
    );

  if (match) {

    mimeType =
      match[1];

    imageData =
      match[2];
  }

  imageData =
    imageData.replace(
     (/\s/g),
      ""
    );

  const className =
    clean(
      body.class ||
      body.className
    ) || "10";

  const chapter =
    clean(
      body.chapter
    );

  const topic =
    clean(
      body.topic
    );

  const prompt = `
तुम EXAMOS AI के Mathematics Handwritten Solution Analyzer हो।

Student Class:
${className}

Board:
${clean(body.board) || "Bihar Board"}

Chapter:
${chapter || "Not specified"}

Topic:
${topic || "Not specified"}

इस image में छात्र का handwritten Mathematics solution है।

इसे ध्यान से पढ़ो और analyze करो।

तुम्हें:

1. प्रश्न पहचानना है।
2. Student का solution पढ़ना है।
3. हर दिखाई देने वाले step को check करना है।
4. स्वयं सही solution निकालना है।
5. Student के answer से compare करना है।
6. बताना है कि solution सही है या गलत।
7. अगर गलत है तो पहली गलत step पहचाननी है।
8. गलती का प्रकार बताना है।
9. सही method बताना है।
10. सही final answer बताना है।
11. Weak topic बताना है।
12. Concept check बताना है।

Mistake types:

- Calculation Error
- Formula Error
- Concept Error
- Sign Error
- Algebra Error
- Arithmetic Error
- Substitution Error
- No Error
- Image Unclear

IMPORTANT:

- उत्तर केवल देवनागरी हिंदी में।
- Hinglish बिल्कुल नहीं।
- Mathematical formulas सही notation में।
- Image में जो साफ दिखाई नहीं दे रहा उसका अनुमान मत लगाओ।
- अगर image unclear है तो readable=false करो।
- अगर solution सही है तो कोई fake mistake मत बनाओ।

JSON में उत्तर दो।
`;

  const schema = {

    type: "object",

    properties: {

      readable: {
        type: "boolean"
      },

      question: {
        type: "string"
      },

      studentFinalAnswer: {
        type: "string"
      },

      isCorrect: {
        type: "boolean"
      },

      mistake: {

        type: "object",

        properties: {

          type: {
            type: "string"
          },

          step: {
            type: "string"
          },

          whatStudentDid: {
            type: "string"
          },

          whyWrong: {
            type: "string"
          }

        },

        required: [
          "type",
          "step",
          "whatStudentDid",
          "whyWrong"
        ]
      },

      correctMethod: {

        type: "array",

        items: {
          type: "string"
        }
      },

      correctAnswer: {
        type: "string"
      },

      weakTopic: {
        type: "string"
      },

      conceptCheck: {
        type: "string"
      },

      explanationHindi: {
        type: "string"
      },

      practiceTopic: {
        type: "string"
      }

    },

    required: [
      "readable",
      "question",
      "studentFinalAnswer",
      "isCorrect",
      "mistake",
      "correctMethod",
      "correctAnswer",
      "weakTopic",
      "conceptCheck",
      "explanationHindi",
      "practiceTopic"
    ]
  };

  const analysis =
    await geminiJSON(
      apiKey,
      ANALYSIS_MODEL,
      prompt,
      schema,
      {
        maxOutputTokens: 4500,

        image: {
          mimeType,
          data:
            imageData
        }
      }
    );

  return res.status(200).json({
    success: true,
    mode:
      "analyze_solution",
    analysis
  });
}


// ============================================================
// GEMINI TEXT REQUEST
// ============================================================

async function geminiText(
  apiKey,
  model,
  prompt,
  options = {}
) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT
    );

  try {

    const response =
      await fetch(
        API_BASE +
          model +
          ":generateContent",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify({

            contents: [
              {
                role: "user",

                parts: [
                  {
                    text:
                      prompt
                  }
                ]
              }
            ],

            generationConfig: {

              maxOutputTokens:
                options.maxOutputTokens ||
                2500
            }

          }),

          signal:
            controller.signal
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data?.error?.message ||
        "Gemini API request failed."
      );
    }

    const text =
      data
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part?.text || ""
        )
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "AI ने कोई response नहीं दिया।"
      );
    }

    return text;

  } finally {

    clearTimeout(
      timeout
    );
  }
}


// ============================================================
// GEMINI STRUCTURED JSON REQUEST
// ============================================================

async function geminiJSON(
  apiKey,
  model,
  prompt,
  schema,
  options = {}
) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT
    );

  try {

    const parts = [
      {
        text:
          prompt
      }
    ];

    if (
      options.image
    ) {

      parts.push({
        inlineData: {

          mimeType:
            options.image.mimeType,

          data:
            options.image.data
        }
      });
    }

    const response =
      await fetch(
        API_BASE +
          model +
          ":generateContent",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify({

            contents: [
              {
                role: "user",
                parts
              }
            ],

            generationConfig: {

              responseMimeType:
                "application/json",

              responseSchema:
                schema,

              maxOutputTokens:
                options.maxOutputTokens ||
                4000
            }

          }),

          signal:
            controller.signal
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data?.error?.message ||
        "Gemini structured API request failed."
      );
    }

    const text =
      data
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part?.text || ""
        )
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "AI ने structured response नहीं दिया।"
      );
    }

    try {

      return JSON.parse(
        text
      );

    } catch (error) {

      console.error(
        "Invalid AI JSON:",
        text
      );

      throw new Error(
        "AI response valid JSON में नहीं है।"
      );
    }

  } finally {

    clearTimeout(
      timeout
    );
  }
}


// ============================================================
// HELPERS
// ============================================================

function clean(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(
    value
  )
    .trim()
    .slice(
      0,
      20000
    );
}


function normalizeText(
  value
) {

  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function normalizeAnswer(
  value
) {

  const answer =
    String(
      value || ""
    )
      .trim()
      .toUpperCase();

  if (
    ["A", "B", "C", "D"]
      .includes(answer)
  ) {
    return answer;
  }

  const match =
    answer.match(
      /[ABCD]/
    );

  return match
    ? match[0]
    : "";
}


function normalizeDifficulty(
  value
) {

  const v =
    String(
      value || "medium"
    )
      .trim()
      .toLowerCase();

  if (
    v === "easy"
  ) {
    return "easy";
  }

  if (
    v === "hard"
  ) {
    return "hard";
  }

  if (
    v === "mixed"
  ) {
    return "mixed";
  }

  return "medium";
}
