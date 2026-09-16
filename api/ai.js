// ============================================================
// EXAMOS AI - FINAL AI API
// Vercel Serverless Function
// File: api/ai.js
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ------------------------------------------------------------
// Models
// ------------------------------------------------------------
const GENERATION_MODEL = "gemini-3.5-flash-lite";
const VERIFY_MODEL = "gemini-3.5-flash";

const MAX_ATTEMPTS = 4;
const MAX_QUESTIONS = 20;

// ------------------------------------------------------------
// Utility
// ------------------------------------------------------------
function cleanText(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/\s+/g, " ")
    .trim();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeAnswer(value) {
  const s = String(value ?? "")
    .trim()
    .toUpperCase();

  // Accept A / B / C / D
  if (/^[ABCD]$/.test(s)) return s;

  // Accept option formats
  const match = s.match(/\b([ABCD])\b/);
  if (match) return match[1];

  return "";
}

function normalizeQuestion(q, index) {
  return {
    id: cleanText(q?.id, `q${index + 1}`),
    question: cleanText(q?.question),
    options: {
      A: cleanText(q?.options?.A),
      B: cleanText(q?.options?.B),
      C: cleanText(q?.options?.C),
      D: cleanText(q?.options?.D)
    },
    correctAnswer: normalizeAnswer(q?.correctAnswer),
    topic: cleanText(q?.topic),
    explanation: cleanText(q?.explanation),
    difficulty: cleanText(q?.difficulty, "Medium")
  };
}

// ------------------------------------------------------------
// Gemini API
// ------------------------------------------------------------
async function callGemini(model, contents, generationConfig = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents,
    generationConfig: {
      temperature: 0.15,
      topP: 0.8,
      maxOutputTokens: 8192,
      ...generationConfig
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();

  if (!response.ok) {
    let message = text;

    try {
      const errorJson = JSON.parse(text);
      message =
        errorJson?.error?.message ||
        errorJson?.message ||
        text;
    } catch (_) {}

    throw new Error(`Gemini API error: ${message}`);
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error("Gemini returned invalid JSON.");
  }

  const output =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || "")
      .join("")
      .trim();

  if (!output) {
    throw new Error("Gemini returned an empty response.");
  }

  return output;
}

// ------------------------------------------------------------
// Extract JSON safely
// ------------------------------------------------------------
function extractJSON(text) {
  let cleaned = String(text || "").trim();

  // Remove markdown fences
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Find first object
  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");

  if (firstObject !== -1 && lastObject > firstObject) {
    const candidate = cleaned.slice(firstObject, lastObject + 1);

    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  // Find first array
  const firstArray = cleaned.indexOf("[");
  const lastArray = cleaned.lastIndexOf("]");

  if (firstArray !== -1 && lastArray > firstArray) {
    const candidate = cleaned.slice(firstArray, lastArray + 1);

    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  throw new Error("Could not parse Gemini JSON response.");
}

// ------------------------------------------------------------
// Question validation
// ------------------------------------------------------------
function basicValidateQuestions(questions, expected) {
  if (!Array.isArray(questions)) {
    return {
      valid: false,
      reason: "Questions response is not an array."
    };
  }

  if (questions.length !== expected.count) {
    return {
      valid: false,
      reason:
        `Expected ${expected.count} questions but received ${questions.length}.`
    };
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    if (!q.question) {
      return {
        valid: false,
        reason: `Question ${i + 1} has no question text.`
      };
    }

    if (
      !q.options ||
      !q.options.A ||
      !q.options.B ||
      !q.options.C ||
      !q.options.D
    ) {
      return {
        valid: false,
        reason: `Question ${i + 1} does not have four complete options.`
      };
    }

    if (!["A", "B", "C", "D"].includes(q.correctAnswer)) {
      return {
        valid: false,
        reason:
          `Question ${i + 1} has an invalid correctAnswer.`
      };
    }

    if (!q.explanation) {
      return {
        valid: false,
        reason:
          `Question ${i + 1} does not contain an explanation.`
      };
    }
  }

  return {
    valid: true,
    reason: ""
  };
}

// ------------------------------------------------------------
// Generate Questions
// ------------------------------------------------------------
async function generateQuestions(config) {
  const className = cleanText(config.class, "10");
  const board = cleanText(config.board, "Bihar Board");
  const subject = cleanText(config.subject, "Mathematics");
  const chapter = cleanText(config.chapter, "Mathematics");
  const topic = cleanText(config.topic);
  const language = cleanText(config.language, "Hindi");
  const difficulty = cleanText(config.difficulty, "Medium");
  const purpose = cleanText(config.purpose, "diagnostic");

  const count = clampNumber(
    config.count,
    1,
    MAX_QUESTIONS,
    5
  );

  const topicInstruction = topic
    ? `
IMPORTANT SELECTED TOPIC:
"${topic}"

Every question MUST belong specifically to this topic.
Do NOT generate questions from another topic or another chapter.
`
    : `
No specific topic was selected.
Generate questions from the selected chapter only.
`;

  const languageInstruction =
    language.toLowerCase().includes("english")
      ? `
Write the complete question, options and explanation in clear school-level English.
`
      : `
Write the complete question, options and explanation in clear Hindi/Hinglish suitable for a school student.

Use proper mathematical notation.
For example:
x², √x, a/b, sin θ, cos θ, tan θ, π, ∫, ∑, Δ, ≥, ≤

Do NOT write mathematics in confusing chat-style transliteration.

Prefer:
"यदि 2x + 3 = 7 है, तो x का मान क्या होगा?"

Instead of:
"agar 2x plus 3 equals 7 hai x kya hoga"
`;

  const prompt = `
You are EXAMOS AI, a highly accurate school Mathematics question generator.

Generate exactly ${count} multiple-choice questions.

STUDENT DETAILS
Class: ${className}
Board: ${board}
Subject: ${subject}
Chapter: ${chapter}
Difficulty: ${difficulty}
Purpose: ${purpose}

${topicInstruction}

${languageInstruction}

VERY IMPORTANT MATHEMATICAL ACCURACY RULES:

1. Every question must have exactly ONE correct option.

2. Before returning a question, SOLVE THE QUESTION YOURSELF.

3. Independently evaluate ALL FOUR OPTIONS:
   A
   B
   C
   D

4. Never create a question where:
   - two options are mathematically equivalent,
   - two options are correct,
   - no option is correct,
   - the wording is ambiguous,
   - the answer depends on an unstated assumption.

5. If an option is algebraically equivalent to the correct answer,
   treat it as another correct option and REWRITE the question.

6. Do not use confusing negative wording such as
   "Which is NOT incorrect?"
   unless absolutely necessary.

7. Avoid trick questions.

8. Avoid duplicate questions.

9. Make the distractor options plausible but definitely incorrect.

10. The field correctAnswer MUST contain only:
    A, B, C, or D.

11. The explanation must prove why the correct answer is correct.

12. The explanation should use mathematical steps.

13. If a formula is required, write the formula clearly.

14. For numerical questions, calculate the final value carefully.

15. Never invent a mathematical rule or formula.

16. Do not put multiple possible answers into correctAnswer.

17. Do not say:
    "Option B/C"
    or
    "Both B and C".

18. If you cannot create an unambiguous question,
    replace it with another question.

OUTPUT REQUIREMENTS

Return JSON ONLY.

Use exactly this structure:

{
  "questions": [
    {
      "id": "q1",
      "question": "Question text",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correctAnswer": "A",
      "topic": "Exact topic",
      "difficulty": "${difficulty}",
      "explanation": "Clear step-by-step mathematical explanation."
    }
  ]
}

Do not include markdown.
Do not include comments.
Do not include any text outside JSON.
`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const output = await callGemini(
        GENERATION_MODEL,
        [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        {
          temperature: attempt === 1 ? 0.1 : 0.05,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              questions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    question: { type: "STRING" },
                    options: {
                      type: "OBJECT",
                      properties: {
                        A: { type: "STRING" },
                        B: { type: "STRING" },
                        C: { type: "STRING" },
                        D: { type: "STRING" }
                      },
                      required: ["A", "B", "C", "D"]
                    },
                    correctAnswer: { type: "STRING" },
                    topic: { type: "STRING" },
                    difficulty: { type: "STRING" },
                    explanation: { type: "STRING" }
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
            required: ["questions"]
          }
        }
      );

      const parsed = extractJSON(output);

      let questions = parsed?.questions;

      if (!Array.isArray(questions)) {
        throw new Error("Gemini did not return questions.");
      }

      questions = questions.map(normalizeQuestion);

      const basic = basicValidateQuestions(
        questions,
        {
          count,
          chapter,
          topic,
          className,
          board,
          subject
        }
      );

      if (!basic.valid) {
        throw new Error(basic.reason);
      }

      // Independent verification
      const verification = await verifyQuestions(
        questions,
        {
          count,
          chapter,
          topic,
          className,
          board,
          subject,
          difficulty
        }
      );

      if (!verification.valid) {
        throw new Error(
          verification.reason ||
          "Question verification failed."
        );
      }

      // Use independently verified answers if available
      if (Array.isArray(verification.verifiedQuestions)) {
        questions = questions.map((q, index) => {
          const verified = verification.verifiedQuestions[index];

          if (!verified) return q;

          const verifiedAnswer =
            normalizeAnswer(
              verified.verifiedCorrectAnswer ||
              verified.correctAnswer
            );

          return {
            ...q,
            correctAnswer:
              ["A", "B", "C", "D"].includes(verifiedAnswer)
                ? verifiedAnswer
                : q.correctAnswer,
            explanation:
              cleanText(verified.explanation) ||
              q.explanation
          };
        });
      }

      return {
        success: true,
        verified: true,
        model: GENERATION_MODEL,
        questions
      };

    } catch (error) {
      lastError = error;
      console.error(
        `Question generation attempt ${attempt} failed:`,
        error
      );
    }
  }

  throw new Error(
    lastError?.message ||
    "AI could not generate a verified question set."
  );
}

// ------------------------------------------------------------
// Independent Question Verification
// ------------------------------------------------------------
async function verifyQuestions(questions, expected) {
  const compactQuestions = questions.map((q, index) => ({
    index: index + 1,
    question: q.question,
    options: q.options,
    generatedCorrectAnswer: q.correctAnswer,
    topic: q.topic,
    explanation: q.explanation
  }));

  const prompt = `
You are the INDEPENDENT MATHEMATICS QUALITY-CONTROL EXAMINER for EXAMOS AI.

You must verify the following generated MCQ questions.

Student:
Class: ${expected.className}
Board: ${expected.board}
Subject: ${expected.subject}
Chapter: ${expected.chapter}
Selected Topic: ${expected.topic || "Not specified"}
Difficulty: ${expected.difficulty}

QUESTIONS:
${JSON.stringify(compactQuestions, null, 2)}

For EVERY question perform an independent mathematical solution.

CHECK ALL OF THESE:

1. Solve the question yourself.

2. Evaluate option A independently.

3. Evaluate option B independently.

4. Evaluate option C independently.

5. Evaluate option D independently.

6. Confirm EXACTLY ONE option is correct.

7. Check whether any two options are:
   - numerically equal,
   - algebraically equivalent,
   - mathematically equivalent,
   - different forms of the same answer.

8. Check the generated correctAnswer.

9. Check the explanation.

10. Check that the question belongs to the selected chapter/topic.

11. Check that the wording is unambiguous.

12. Check signs, powers, roots, fractions, units and calculations.

CRITICAL RULE:

If TWO OR MORE options are mathematically correct,
the question is INVALID.

If NO option is correct,
the question is INVALID.

If the generated correctAnswer is wrong,
the question is INVALID.

Do NOT approve a question just because the generated answer says it is correct.

For every valid question, return the independently verified answer.

Return JSON ONLY:

{
  "valid": true,
  "reason": "",
  "verifiedQuestions": [
    {
      "index": 1,
      "valid": true,
      "verifiedCorrectAnswer": "A",
      "explanation": "Short mathematically correct explanation."
    }
  ]
}

If ANY question is invalid:

{
  "valid": false,
  "reason": "Question 2 has two mathematically correct options: B and C.",
  "verifiedQuestions": []
}

Do not return markdown.
`;

  const output = await callGemini(
    VERIFY_MODEL,
    [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    {
      temperature: 0.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          valid: { type: "BOOLEAN" },
          reason: { type: "STRING" },
          verifiedQuestions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                index: { type: "INTEGER" },
                valid: { type: "BOOLEAN" },
                verifiedCorrectAnswer: { type: "STRING" },
                explanation: { type: "STRING" }
              },
              required: [
                "index",
                "valid",
                "verifiedCorrectAnswer",
                "explanation"
              ]
            }
          }
        },
        required: [
          "valid",
          "reason",
          "verifiedQuestions"
        ]
      }
    }
  );

  const result = extractJSON(output);

  return {
    valid: result?.valid === true,
    reason: cleanText(result?.reason),
    verifiedQuestions:
      Array.isArray(result?.verifiedQuestions)
        ? result.verifiedQuestions
        : []
  };
}

// ------------------------------------------------------------
// AI Chat / Ask AI
// ------------------------------------------------------------
async function chat(config) {
  const prompt = cleanText(config.prompt);

  if (!prompt) {
    throw new Error("Please enter a question.");
  }

  const className = cleanText(config.class, "");
  const board = cleanText(config.board, "");

  const systemPrompt = `
You are EXAMOS AI, a Mathematics learning assistant for school students.

STUDENT CLASS:
${className || "Not specified"}

BOARD:
${board || "Not specified"}

Your job is to teach, not just give an answer.

LANGUAGE:
- Respond primarily in clear Hindi/Hinglish.
- Use simple school-level language.
- Do not use unnecessarily difficult English.
- Mathematical terms may remain in standard English where useful.

MATHEMATICAL LANGUAGE:
Always use proper mathematical notation.

Examples:
x²
x³
√x
a/b
sin θ
cos θ
tan θ
π
Δ
∠
≥
≤
∫
d/dx

Use clear equations such as:

2x + 3 = 7
2x = 4
x = 2

Do NOT write mathematics in confusing phonetic chat language.

For example, avoid:
"x square plus 2x plus 1"

Prefer:
"x² + 2x + 1"

TEACHING STYLE:

1. First understand the student's question.

2. Give the concept in simple language.

3. Write the relevant formula when needed.

4. Solve step-by-step.

5. Show intermediate calculations.

6. Clearly identify the final answer.

7. If the student has made a mistake, politely identify:
   - where the mistake happened,
   - why it is wrong,
   - how to correct it.

8. Never invent formulas.

9. Verify calculations before responding.

10. If there are multiple possible interpretations,
    ask a short clarification rather than guessing.

For numerical Mathematics problems:
- calculate carefully,
- check the result again,
- make sure signs and units are correct.

For formulas:
- write the formula first,
- substitute values clearly,
- simplify step-by-step.

For MCQs:
- identify the correct option,
- explain why,
- briefly explain why the important distractors are wrong when useful.

Do not over-explain a very simple question.

The response should look like a good Mathematics teacher's explanation.
`;

  const output = await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [
          {
            text:
              systemPrompt +
              "\n\nSTUDENT QUESTION:\n" +
              prompt
          }
        ]
      }
    ],
    {
      temperature: 0.15,
      maxOutputTokens: 4096
    }
  );

  return {
    success: true,
    answer: output
  };
}

// ------------------------------------------------------------
// Concept Explanation
// ------------------------------------------------------------
async function concept(config) {
  const chapter = cleanText(config.chapter);
  const topic = cleanText(config.topic);
  const className = cleanText(config.class, "");
  const board = cleanText(config.board, "");

  if (!chapter || !topic) {
    throw new Error(
      "Chapter and topic are required for concept explanation."
    );
  }

  const prompt = `
You are EXAMOS AI Mathematics teacher.

Class: ${className}
Board: ${board}
Chapter: ${chapter}
Topic: ${topic}

Teach this topic before practice questions.

Use clear Hindi/Hinglish.

Structure:

1. Topic ka simple meaning
2. Main concept
3. Important formula/rule
4. Step-by-step explanation
5. Example 1 - solved
6. Example 2 - solved
7. Common mistake
8. Practice ke liye short tip

Use proper mathematical notation.

For example:
x², √x, sin θ, cos θ, tan θ, ∫, ∑, Δ

Do not use confusing phonetic mathematical language.

Make the explanation understandable to a Class ${className || "school"} student.

Do not generate practice questions yet.
`;

  const output = await callGemini(
    GENERATION_MODEL,
    [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    {
      temperature: 0.15,
      maxOutputTokens: 5000
    }
  );

  return {
    success: true,
    answer: output
  };
}

// ------------------------------------------------------------
// Request Handler
// ------------------------------------------------------------
async function handler(req, res) {
  // CORS
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error:
          "GEMINI_API_KEY is missing in Vercel Environment Variables."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const mode = cleanText(body.mode).toLowerCase();

    // --------------------------------------------------------
    // Generate Questions
    // --------------------------------------------------------
    if (
      mode === "generate_questions" ||
      mode === "generate" ||
      mode === "test"
    ) {
      const result = await generateQuestions(body);

      return res.status(200).json(result);
    }

    // --------------------------------------------------------
    // Chat
    // --------------------------------------------------------
    if (
      mode === "chat" ||
      mode === "ask_ai"
    ) {
      const result = await chat(body);

      return res.status(200).json(result);
    }

    // --------------------------------------------------------
    // Concept
    // --------------------------------------------------------
    if (mode === "concept") {
      const result = await concept(body);

      return res.status(200).json(result);
    }

    return res.status(400).json({
      success: false,
      error:
        "Invalid mode. Supported modes: generate_questions, chat, concept."
    });

  } catch (error) {
    console.error("EXAMOS AI API ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "EXAMOS AI server error. Please try again."
    });
  }
}

// ------------------------------------------------------------
// Vercel CommonJS export
// ------------------------------------------------------------
module.exports = handler;
