// ============================================================
// EXAMOS AI - COMPLETE AI API
// Test + Practice + Chat + Concept + Solution Image Analysis
// Vercel CommonJS
// ============================================================

const GENERATION_MODEL = "gemini-3.5-flash-lite";
const VERIFY_MODEL = "gemini-3.5-flash";
const ANALYSIS_MODEL = "gemini-3.5-flash";

const MAX_QUESTIONS = 20;
const MAX_GENERATION_ATTEMPTS = 3;


// ============================================================
// GEMINI CALL
// ============================================================

async function callGemini(model, contents, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY Vercel Environment Variables में नहीं मिला।");
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

        generationConfig: {
          temperature:
            options.temperature !== undefined
              ? options.temperature
              : 0.15,

          topP: 0.9,

          maxOutputTokens:
            options.maxOutputTokens || 5000,

          ...(options.responseMimeType
            ? {
                responseMimeType:
                  options.responseMimeType
              }
            : {})
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini API request failed."
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "AI ने कोई valid response नहीं दिया।"
    );
  }

  return text;
}


// ============================================================
// JSON HELPERS
// ============================================================

function cleanJson(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}


function extractJson(text) {
  const cleaned = cleanJson(text);

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");

  if (
    objectStart !== -1 &&
    objectEnd > objectStart
  ) {
    try {
      return JSON.parse(
        cleaned.slice(objectStart, objectEnd + 1)
      );
    } catch (_) {}
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");

  if (
    arrayStart !== -1 &&
    arrayEnd > arrayStart
  ) {
    try {
      return JSON.parse(
        cleaned.slice(arrayStart, arrayEnd + 1)
      );
    } catch (_) {}
  }

  throw new Error(
    "AI response valid JSON में नहीं आया।"
  );
}


// ============================================================
// COMMON HELPERS
// ============================================================

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^ABCD]/g, "")
    .slice(0, 1);
}


function safeString(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}


function getCount(value, defaultCount = 10) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return defaultCount;
  }

  return Math.min(
    Math.max(Math.floor(n), 1),
    MAX_QUESTIONS
  );
}


// ============================================================
// GENERATE QUESTIONS
// Used for TEST + PRACTICE
// ============================================================

async function generateQuestions(config = {}) {
  const className = safeString(
    config.class,
    "10"
  );

  const chapter = safeString(
    config.chapter,
    "Mathematics"
  );

  const topic = safeString(
    config.topic,
    chapter
  );

  const count = getCount(
    config.count,
    10
  );

  const language = safeString(
    config.language,
    "Hindi"
  );

  const difficulty = safeString(
    config.difficulty,
    "Medium"
  );

  const purpose = safeString(
    config.purpose,
    "test"
  );

  const prompt = `
You are EXAMOS AI Mathematics Question Generator.

Generate EXACTLY ${count} high-quality MCQ Mathematics questions.

STUDENT:
Class: ${className}
Chapter: ${chapter}
Topic: ${topic}
Difficulty: ${difficulty}
Language: ${language}
Purpose: ${purpose}

VERY IMPORTANT MATHEMATICS RULES:

1. Every question must belong to the given chapter/topic.

2. Use clear mathematical language.

3. Mathematical expressions MUST be written clearly.

Examples:
x² + 5x + 6 = 0
2x + 3 = 11
√25 = 5
sin θ = 3/5
(a + b)² = a² + 2ab + b²

4. Do NOT write confusing mathematical language.

Bad:
"x ka square plus 5x..."

Good:
"x² + 5x + 6 = 0"

5. Every question must have EXACTLY four options:
A
B
C
D

6. There must be EXACTLY ONE correct answer.

7. Before returning a question, solve it yourself.

8. Check ALL FOUR options mathematically.

9. If two options are mathematically equivalent, CHANGE the options.

10. Never create a question where two options can be correct.

11. Never create an ambiguous question.

12. Do not duplicate questions.

13. Keep the difficulty appropriate for Class ${className}.

14. Explanation must show the mathematical method clearly.

15. The final answer must match the correct option.

16. Use Hindi for explanation when language is Hindi, but keep equations and mathematical notation correct.

17. Do not put markdown code fences around JSON.

RETURN ONLY JSON.

FORMAT:

{
  "questions": [
    {
      "question": "2x + 5 = 15 का मान क्या है?",
      "options": {
        "A": "3",
        "B": "5",
        "C": "7",
        "D": "10"
      },
      "correctAnswer": "B",
      "explanation": "2x + 5 = 15 ⇒ 2x = 10 ⇒ x = 5",
      "topic": "${topic}",
      "difficulty": "${difficulty}"
    }
  ]
}
`;

  const text = await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    {
      temperature: 0.1,
      maxOutputTokens: 5500,
      responseMimeType: "application/json"
    }
  );

  const result = extractJson(text);

  if (
    !result ||
    !Array.isArray(result.questions)
  ) {
    throw new Error(
      "AI ने questions नहीं भेजे।"
    );
  }

  const questions = result.questions
    .slice(0, count)
    .map((q, index) => ({
      id:
        q.id ||
        `q_${Date.now()}_${index}`,

      question: safeString(
        q.question,
        "Question unavailable"
      ),

      options: {
        A: safeString(q.options?.A),
        B: safeString(q.options?.B),
        C: safeString(q.options?.C),
        D: safeString(q.options?.D)
      },

      correctAnswer:
        normalizeAnswer(
          q.correctAnswer
        ),

      explanation: safeString(
        q.explanation,
        "Solution unavailable."
      ),

      topic: safeString(
        q.topic,
        topic
      ),

      difficulty: safeString(
        q.difficulty,
        difficulty
      )
    }));

  if (questions.length === 0) {
    throw new Error(
      "कोई question generate नहीं हुआ।"
    );
  }

  // Basic local validation before sending to verifier
  for (const q of questions) {
    if (
      !q.question ||
      !q.options.A ||
      !q.options.B ||
      !q.options.C ||
      !q.options.D ||
      !["A", "B", "C", "D"].includes(
        q.correctAnswer
      )
    ) {
      throw new Error(
        "AI ने incomplete Mathematics question बनाया।"
      );
    }
  }

  return questions;
}


// ============================================================
// VERIFY QUESTIONS
// ============================================================

async function verifyQuestions(questions) {
  const prompt = `
You are EXAMOS AI's strict Mathematics Answer Verifier.

Independently solve EVERY question.

For each question:

1. Solve the question yourself.
2. Check option A.
3. Check option B.
4. Check option C.
5. Check option D.
6. Identify ALL mathematically correct options.
7. There MUST be exactly ONE correct option.
8. Check the supplied correctAnswer.
9. Check equivalent mathematical forms.
10. Reject ambiguous questions.
11. Reject questions where two or more options are correct.
12. Reject questions where the supplied answer is wrong.

Return ONLY JSON:

{
  "valid": true,
  "questions": [
    {
      "index": 0,
      "valid": true,
      "correctAnswer": "A",
      "reason": "Only option A is mathematically correct."
    }
  ]
}

QUESTIONS:

${JSON.stringify(questions)}
`;

  const text = await callGemini(
    VERIFY_MODEL,
    [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    {
      temperature: 0,
      maxOutputTokens: 4500,
      responseMimeType: "application/json"
    }
  );

  return extractJson(text);
}


// ============================================================
// VERIFIED QUESTIONS
// ============================================================

async function generateVerifiedQuestions(config = {}) {
  let lastError =
    "Verified questions generate नहीं हो पाए।";

  for (
    let attempt = 1;
    attempt <= MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    try {
      const questions =
        await generateQuestions(config);

      const verification =
        await verifyQuestions(
          questions
        );

      if (
        !verification ||
        verification.valid !== true
      ) {
        lastError =
          verification?.reason ||
          "Mathematical verification failed.";

        continue;
      }

      if (
        !Array.isArray(
          verification.questions
        )
      ) {
        lastError =
          "Verification response incomplete.";

        continue;
      }

      if (
        verification.questions.length !==
        questions.length
      ) {
        lastError =
          "Verification में सभी questions check नहीं हुए।";

        continue;
      }

      const finalQuestions =
        questions.map((question, index) => {
          const verified =
            verification.questions[index];

          if (
            !verified ||
            verified.valid !== true
          ) {
            throw new Error(
              `Question ${index + 1} verification failed.`
            );
          }

          const answer =
            normalizeAnswer(
              verified.correctAnswer
            );

          if (
            !["A", "B", "C", "D"].includes(
              answer
            )
          ) {
            throw new Error(
              `Question ${index + 1} का verified answer invalid है।`
            );
          }

          return {
            ...question,
            correctAnswer: answer
          };
        });

      return finalQuestions;

    } catch (error) {
      lastError =
        error?.message ||
        lastError;
    }
  }

  throw new Error(
    lastError
  );
}


// ============================================================
// PRACTICE QUESTIONS
// Fast but still mathematically checked
// ============================================================

async function generatePractice(config = {}) {
  const practiceConfig = {
    ...config,
    purpose: "practice",
    count: getCount(
      config.count,
      5
    )
  };

  return await generateVerifiedQuestions(
    practiceConfig
  );
}


// ============================================================
// CHAT
// ============================================================

async function chat(config = {}) {
  const message =
    safeString(
      config.message
    );

  if (!message) {
    throw new Error(
      "Message required."
    );
  }

  const prompt = `
You are EXAMOS AI Mathematics Assistant.

Student asks:

${message}

Answer in simple Hindi/Hinglish.

RULES:

1. Explain clearly.
2. Use proper mathematical notation.
3. Never write confusing mathematical expressions.
4. Show calculation step-by-step when needed.
5. Use equations such as:

x² + 5x + 6 = 0

2x + 3 = 11

√25 = 5

sin θ = 3/5

6. Do not invent formulas.
7. If solving a numerical question, calculate carefully.
8. If the student asks for an exam answer, keep it concise but complete.
`;

  return await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    {
      temperature: 0.15,
      maxOutputTokens: 3000
    }
  );
}


// ============================================================
// CONCEPT TEACHER
// ============================================================

async function concept(config = {}) {
  const className =
    safeString(config.class, "10");

  const chapter =
    safeString(config.chapter);

  const topic =
    safeString(
      config.topic,
      chapter
    );

  const prompt = `
You are EXAMOS AI Mathematics Teacher.

Teach:

Class: ${className}
Chapter: ${chapter}
Topic: ${topic}

Use this structure:

1. Concept
Explain in very simple Hindi/Hinglish.

2. Important Formula
Write formulas using correct mathematical notation.

3. Solved Example 1
Step-by-step.

4. Solved Example 2
Step-by-step.

5. Common Mistakes
Give 3 common mistakes.

6. Quick Check
Give 2 short questions.

IMPORTANT:

Do NOT write:
"x ka square"

Prefer:
"x²"

Do NOT write confusing equations in words.

Use proper notation:
√x
x²
x³
sin θ
cos θ
tan θ
(a+b)²
`;

  return await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    {
      temperature: 0.15,
      maxOutputTokens: 4000
    }
  );
}


// ============================================================
// IMAGE DATA PREPARATION
// ============================================================

function prepareImage(imageInput) {
  let value =
    String(imageInput || "").trim();

  if (!value) {
    throw new Error(
      "Solution image नहीं मिली।"
    );
  }

  let mimeType =
    "image/jpeg";

  let base64Data =
    value;

  const dataUrlMatch =
    value.match(
      /^data:(image\/[^;]+);base64,(.+)$/i
    );

  if (dataUrlMatch) {
    mimeType =
      dataUrlMatch[1];

    base64Data =
      dataUrlMatch[2];
  }

  base64Data =
    base64Data
      .replace(/\s/g, "");

  // Remove accidental data URL prefix
  base64Data =
    base64Data.replace(
      /^data:image\/[^;]+;base64,/i,
      ""
    );

  if (!base64Data) {
    throw new Error(
      "Image data empty है।"
    );
  }

  // Gemini inline image request size safety.
  // Do not allow very large payloads.
  if (base64Data.length > 18_000_000) {
    throw new Error(
      "Image बहुत बड़ी है। कृपया छोटी/compressed image upload करें।"
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

async function analyzeSolution(config = {}) {
  const imageInput =
    config.imageBase64 ||
    config.image ||
    config.imageData ||
    config.photo ||
    "";

  const image =
    prepareImage(imageInput);

  const className =
    safeString(
      config.class,
      "10"
    );

  const chapter =
    safeString(
      config.chapter,
      ""
    );

  const topic =
    safeString(
      config.topic,
      ""
    );

  const prompt = `
You are EXAMOS AI's expert handwritten Mathematics Solution Analyzer.

Analyze the uploaded student solution image.

STUDENT:
Class: ${className}
Chapter: ${chapter || "Not specified"}
Topic: ${topic || "Not specified"}

YOUR JOB:

1. Read the Mathematics question if visible.
2. Read the student's handwritten solution carefully.
3. Understand every visible step.
4. Independently solve the problem.
5. Compare the student's work with the correct mathematics.
6. Determine whether the student's solution is correct.
7. If wrong, find the FIRST incorrect mathematical step.
8. Identify the mistake type.

Allowed mistake types:

Calculation Error
Formula Error
Concept Error
Sign Error
Algebra Error
Substitution Error
Arithmetic Error
No Error
Image Unclear

IMPORTANT:
Do NOT invent handwriting that is not visible.

If something is unclear, say:
"यह हिस्सा image में साफ दिखाई नहीं दे रहा है।"

MATHEMATICAL LANGUAGE:

Use proper notation.

Correct:
x² - 5x + 6 = 0

Correct:
2x + 5 = 15

Correct:
√25 = 5

Correct:
sin θ = 3/5

Avoid:
"x ka square minus..."

ANALYSIS MUST INCLUDE:

- Question
- Student final answer
- Correct/Incorrect
- Mistake type
- Exact wrong step
- What student did
- Why it is wrong
- Correct method
- Correct answer
- Weak topic
- Concept check
- Hindi explanation
- Practice topic

If student's solution is correct:
mistake.type = "No Error"

Return ONLY valid JSON.

FORMAT:

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
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
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
        maxOutputTokens: 5000,
        responseMimeType:
          "application/json"
      }
    );

  const result =
    extractJson(text);

  return {
    success: true,

    readable:
      result.readable !== false,

    question:
      safeString(
        result.question
      ),

    studentFinalAnswer:
      safeString(
        result.studentFinalAnswer
      ),

    isCorrect:
      result.isCorrect === true,

    mistake: {
      type:
        safeString(
          result.mistake?.type,
          "Image Unclear"
        ),

      step:
        safeString(
          result.mistake?.step
        ),

      whatStudentDid:
        safeString(
          result.mistake?.whatStudentDid
        ),

      whyWrong:
        safeString(
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
                String(x || "").trim()
            )
            .filter(Boolean)
        : [],

    correctAnswer:
      safeString(
        result.correctAnswer
      ),

    weakTopic:
      safeString(
        result.weakTopic
      ),

    conceptCheck:
      safeString(
        result.conceptCheck
      ),

    explanationHindi:
      safeString(
        result.explanationHindi
      ),

    practiceTopic:
      safeString(
        result.practiceTopic
      )
  };
}


// ============================================================
// MAIN VERCEL HANDLER
// ============================================================

module.exports = async function handler(
  req,
  res
) {
  // ----------------------------------------------------------
  // Method
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error:
        "Only POST requests are allowed."
    });
  }

  try {
    const body =
      req.body || {};

    const mode =
      safeString(
        body.mode
      );

    // ========================================================
    // TEST
    // ========================================================

    if (
      mode ===
      "generate_questions"
    ) {
      const questions =
        await generateVerifiedQuestions(
          body
        );

      return res.status(200).json({
        success: true,
        verified: true,

        mode:
          "generate_questions",

        model:
          GENERATION_MODEL,

        questions
      });
    }


    // ========================================================
    // PRACTICE
    // ========================================================

    if (
      mode ===
      "generate_practice"
    ) {
      const questions =
        await generatePractice(
          body
        );

      return res.status(200).json({
        success: true,
        verified: true,

        mode:
          "generate_practice",

        model:
          GENERATION_MODEL,

        questions
      });
    }


    // ========================================================
    // CHAT
    // ========================================================

    if (
      mode ===
      "chat"
    ) {
      const answer =
        await chat(
          body
        );

      return res.status(200).json({
        success: true,

        mode:
          "chat",

        answer
      });
    }


    // ========================================================
    // CONCEPT
    // ========================================================

    if (
      mode ===
      "concept"
    ) {
      const answer =
        await concept(
          body
        );

      return res.status(200).json({
        success: true,

        mode:
          "concept",

        answer
      });
    }


    // ========================================================
    // SOLUTION ANALYSIS
    // ========================================================

    if (
      mode ===
      "analyze_solution"
    ) {
      const analysis =
        await analyzeSolution(
          body
        );

      return res.status(200).json({
        success: true,

        mode:
          "analyze_solution",

        analysis
      });
    }


    // ========================================================
    // INVALID MODE
    // ========================================================

    return res.status(400).json({
      success: false,

      error:
        "Invalid mode. Supported modes: generate_questions, generate_practice, chat, concept, analyze_solution."
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
        "EXAMOS AI में error आया।"
    });
  }
};
