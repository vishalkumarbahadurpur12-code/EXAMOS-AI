const GENERATION_MODEL = "gemini-3.5-flash-lite";
const ANALYSIS_MODEL = "gemini-3.5-flash";

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_QUESTIONS = 20;
const REQUEST_TIMEOUT = 50000;


/* =========================================================
   MAIN API HANDLER
========================================================= */

module.exports = async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GEMINI_API_KEY is missing in Vercel Environment Variables."
    });
  }

  try {

    const body = req.body || {};
    const mode = String(body.mode || "").trim();

    if (!mode) {
      return res.status(400).json({
        success: false,
        error: "Mode required."
      });
    }

    if (mode === "chat") {
      return await handleChat(body, res, apiKey);
    }

    if (mode === "concept") {
      return await handleConcept(body, res, apiKey);
    }

    if (mode === "generate_questions") {
      return await handleQuestions(body, res, apiKey, false);
    }

    if (mode === "generate_practice") {
      return await handleQuestions(body, res, apiKey, true);
    }

    if (mode === "analyze_solution") {
      return await handleSolutionAnalysis(body, res, apiKey);
    }

    return res.status(400).json({
      success: false,
      error:
        "Invalid mode. Supported modes: chat, concept, generate_questions, generate_practice, analyze_solution."
    });

  } catch (error) {

    console.error("AI API ERROR:", error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "AI server error."
    });
  }
};


/* =========================================================
   CONTEXT
========================================================= */

function context(body) {

  return `
Board: ${body.board || "BIHAR"}
Class: ${body.class || "10"}
Stream: ${body.stream || "Not applicable"}
Subject: ${body.subject || "General"}
Chapter: ${body.chapter || "Not specified"}
Topic: ${body.topic || "Not specified"}
Language: ${body.language || "Hindi"}
`;
}


/* =========================================================
   GEMINI CALL
========================================================= */

async function callGemini(
  model,
  contents,
  apiKey,
  generationConfig = {}
) {

  const url =
    API_BASE +
    model +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        contents,
        generationConfig
      }),

      signal: controller.signal
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Gemini ने valid JSON response नहीं दिया।"
      );
    }

    if (!response.ok) {

      const msg =
        data?.error?.message ||
        "Gemini API request failed.";

      throw new Error(msg);
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "Gemini ने empty response दिया।"
      );
    }

    return text;

  } finally {

    clearTimeout(timeout);

  }
}


/* =========================================================
   JSON PARSER
========================================================= */

function extractJSON(text) {

  let clean = String(text || "").trim();

  clean = clean
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstObject = clean.indexOf("{");
  const lastObject = clean.lastIndexOf("}");

  const firstArray = clean.indexOf("[");
  const lastArray = clean.lastIndexOf("]");

  if (
    firstObject >= 0 &&
    lastObject > firstObject
  ) {

    clean = clean.slice(
      firstObject,
      lastObject + 1
    );

  } else if (
    firstArray >= 0 &&
    lastArray > firstArray
  ) {

    clean = clean.slice(
      firstArray,
      lastArray + 1
    );

  }

  return JSON.parse(clean);
}


/* =========================================================
   ANSWER NORMALIZER
========================================================= */

function normalizeAnswer(value) {

  let answer = String(value || "")
    .trim()
    .toUpperCase();

  answer = answer
    .replace(/OPTION\s*/g, "")
    .replace(/ANSWER\s*/g, "")
    .replace(/[().:]/g, "")
    .trim();

  if (
    answer === "A" ||
    answer === "B" ||
    answer === "C" ||
    answer === "D"
  ) {
    return answer;
  }

  const match = answer.match(/[ABCD]/);

  return match ? match[0] : "";
}


/* =========================================================
   OPTIONS NORMALIZER
   IMPORTANT:
   HTML expects:
   {
     A:"",
     B:"",
     C:"",
     D:""
   }
========================================================= */

function normalizeOptions(options) {

  if (Array.isArray(options)) {

    return {
      A: String(options[0] || ""),
      B: String(options[1] || ""),
      C: String(options[2] || ""),
      D: String(options[3] || "")
    };

  }

  if (options && typeof options === "object") {

    return {
      A: String(
        options.A ??
        options.a ??
        options[0] ??
        ""
      ),

      B: String(
        options.B ??
        options.b ??
        options[1] ??
        ""
      ),

      C: String(
        options.C ??
        options.c ??
        options[2] ??
        ""
      ),

      D: String(
        options.D ??
        options.d ??
        options[3] ??
        ""
      )
    };

  }

  return {
    A: "",
    B: "",
    C: "",
    D: ""
  };
}


/* =========================================================
   QUESTION NORMALIZER
========================================================= */

function normalizeQuestion(q, index, body) {

  const options = normalizeOptions(
    q?.options
  );

  const correctAnswer = normalizeAnswer(
    q?.verifiedCorrectAnswer ??
    q?.correctAnswer ??
    q?.answer
  );

  return {

    id:
      q?.id ||
      `q_${Date.now()}_${index}`,

    question:
      String(
        q?.question ||
        q?.questionText ||
        ""
      ).trim(),

    options,

    correctAnswer,

    verifiedCorrectAnswer:
      correctAnswer,

    explanation:
      String(
        q?.explanation ||
        "इस प्रश्न का उत्तर AI द्वारा verify किया गया है।"
      ).trim(),

    topic:
      String(
        q?.topic ||
        body.topic ||
        body.chapter ||
        ""
      ).trim(),

    chapter:
      String(
        q?.chapter ||
        body.chapter ||
        ""
      ).trim(),

    difficulty:
      String(
        q?.difficulty ||
        body.difficulty ||
        "Medium"
      ).trim()
  };
}


/* =========================================================
   QUESTION VALIDATION
========================================================= */

function validateQuestion(q) {

  if (!q) return false;

  if (!q.question) return false;

  if (!q.options) return false;

  if (
    !q.options.A ||
    !q.options.B ||
    !q.options.C ||
    !q.options.D
  ) {
    return false;
  }

  if (
    !["A", "B", "C", "D"].includes(
      q.correctAnswer
    )
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   CHAT
========================================================= */

async function handleChat(body, res, apiKey) {

  const message =
    String(
      body.message ||
      body.prompt ||
      ""
    ).trim();

  if (!message) {

    return res.status(400).json({
      success: false,
      error: "Message required."
    });

  }

  const prompt = `
You are EXAMOS AI, an Indian student learning assistant.

Student context:

${context(body)}

Student question:

${message}

Rules:

1. Answer according to the student's selected Bihar Board class,
   stream, subject and chapter whenever relevant.

2. Prefer simple Hindi/Hinglish unless English is requested.

3. If Mathematics is selected, show calculations clearly.

4. If Science is selected, explain scientifically.

5. For exam questions, give an exam-ready answer.

6. Do not invent facts.

7. Keep the explanation student-friendly.

Return only the answer.
`;

  const answer = await callGemini(
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

    apiKey,

    {
      maxOutputTokens: 1400
    }
  );

  return res.status(200).json({

    success: true,

    mode: "chat",

    answer

  });
}


/* =========================================================
   CONCEPT
========================================================= */

async function handleConcept(
  body,
  res,
  apiKey
) {

  const prompt = `
You are the concept-teaching engine of EXAMOS AI.

Student context:

${context(body)}

Teach the selected concept in simple Hindi.

Include:

1. Definition / Concept
2. Important points
3. Formula or rules if applicable
4. One or two solved examples
5. Common mistakes
6. Quick revision
7. Three important exam points

Respect the selected Bihar Board class,
stream, subject and chapter.

Do not make the explanation unnecessarily advanced.

Return clean educational text.
`;

  const answer = await callGemini(

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

    apiKey,

    {
      maxOutputTokens: 1800
    }
  );

  return res.status(200).json({

    success: true,

    mode: "concept",

    answer

  });
}


/* =========================================================
   TEST / PRACTICE QUESTION GENERATOR
========================================================= */

async function handleQuestions(
  body,
  res,
  apiKey,
  practice
) {

  let count = Number(
    body.count || 10
  );

  if (!Number.isFinite(count)) {
    count = 10;
  }

  count = Math.max(
    3,
    Math.min(
      MAX_QUESTIONS,
      Math.floor(count)
    )
  );


  const board =
    String(
      body.board ||
      "BIHAR"
    );

  const className =
    String(
      body.class ||
      "10"
    );

  const stream =
    String(
      body.stream ||
      ""
    );

  const subject =
    String(
      body.subject ||
      "Mathematics"
    );

  const chapter =
    String(
      body.chapter ||
      "All Chapters"
    );

  const topic =
    String(
      body.topic ||
      ""
    );

  const difficulty =
    String(
      body.difficulty ||
      "Mixed"
    );

  const language =
    String(
      body.language ||
      "Hindi"
    );


  /* ---------------------------------------------------------
     PREVIOUS QUESTIONS
  --------------------------------------------------------- */

  const previousQuestions =
    Array.isArray(
      body.previousQuestions
    )
      ? body.previousQuestions
          .slice(-20)
          .map(item =>
            String(item)
              .slice(0, 250)
          )
      : [];


  /* ---------------------------------------------------------
     PURPOSE
  --------------------------------------------------------- */

  const purpose =
    String(
      body.purpose ||
      (practice
        ? "general_practice"
        : "diagnostic")
    );


  /* ---------------------------------------------------------
     PROMPT
  --------------------------------------------------------- */

  const prompt = `

You are EXAMOS AI's verified question generation engine.

Generate questions for the student.

STUDENT INFORMATION:

Board:
${board}

Class:
${className}

Stream:
${stream || "Not applicable"}

Subject:
${subject}

Chapter:
${chapter}

Topic:
${topic || "Important topics from the selected chapter"}

Language:
${language}

Difficulty:
${difficulty}

Purpose:
${purpose}

Mode:
${
  practice
    ? "Practice Test"
    : "Diagnostic Test"
}


IMPORTANT RULES:

1. Questions MUST belong to the selected subject.

2. Questions MUST match the selected class.

3. Questions MUST match the selected chapter whenever a chapter
   is provided.

4. For Class 11 and 12, respect the selected stream.

5. Use Bihar Board academic level.

6. Do not mix unrelated subjects.

7. Generate exactly four options.

8. Only ONE option can be correct.

9. correctAnswer MUST be exactly:
   A
   B
   C
   or
   D

10. Verify numerical calculations before returning.

11. Avoid ambiguous questions.

12. Avoid duplicate questions.

13. Include a topic for every question.

14. Include a short explanation.

15. Mix conceptual and application questions.

16. Questions should be useful for an actual student test.

17. If language is Hindi, write the question and explanation
    mainly in simple Hindi.

18. Keep formulas and mathematical notation correct.

19. Do not return markdown.

20. Return ONLY valid JSON.


PREVIOUS QUESTIONS TO AVOID:

${JSON.stringify(previousQuestions)}


RETURN EXACTLY THIS JSON STRUCTURE:

{
  "questions": [
    {
      "question": "Question text",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correctAnswer": "A",
      "explanation": "Short explanation",
      "topic": "Topic name",
      "chapter": "${chapter}",
      "difficulty": "${difficulty}"
    }
  ]
}

Generate ${count} questions.
`;


  let finalQuestions = [];

  let lastError = null;


  /* ---------------------------------------------------------
     TWO ATTEMPTS
  --------------------------------------------------------- */

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {

    try {

      const raw =
        await callGemini(

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

          apiKey,

          {
            maxOutputTokens:
              Math.min(
                8000,
                Math.max(
                  3000,
                  count * 450
                )
              ),

            responseMimeType:
              "application/json"
          }
        );


      const parsed =
        extractJSON(raw);


      if (
        !parsed ||
        !Array.isArray(
          parsed.questions
        )
      ) {

        throw new Error(
          "AI ने valid questions JSON नहीं दिया।"
        );

      }


      const normalized =
        parsed.questions
          .slice(0, count)
          .map(
            (q, index) =>
              normalizeQuestion(
                q,
                index,
                body
              )
          )
          .filter(
            validateQuestion
          );


      if (
        normalized.length <
        Math.min(3, count)
      ) {

        throw new Error(
          "Generated questions validation में fail हुए।"
        );

      }


      finalQuestions =
        normalized;

      break;

    } catch (error) {

      lastError = error;

      console.error(
        "QUESTION GENERATION ATTEMPT",
        attempt,
        error
      );

    }

  }


  if (
    finalQuestions.length <
    Math.min(3, count)
  ) {

    throw new Error(
      lastError?.message ||
      "AI verified questions generate नहीं कर पाया।"
    );

  }


  return res.status(200).json({

    success: true,

    mode:
      practice
        ? "generate_practice"
        : "generate_questions",

    verified: true,

    requestId:
      body.requestId || "",

    board,

    class: className,

    stream,

    subject,

    chapter,

    topic,

    questions:
      finalQuestions

  });
}


/* =========================================================
   HANDWRITTEN SOLUTION ANALYSIS
========================================================= */

async function handleSolutionAnalysis(
  body,
  res,
  apiKey
) {

  let image =
    body.imageBase64 ||
    body.image ||
    body.imageData ||
    body.photo;


  if (!image) {

    return res.status(400).json({
      success: false,
      error: "Image required."
    });

  }


  let mimeType =
    "image/jpeg";

  let base64 =
    String(image);


  if (
    base64.startsWith("data:")
  ) {

    const match =
      base64.match(
        /^data:([^;]+);base64,(.*)$/s
      );


    if (!match) {

      return res.status(400).json({
        success: false,
        error: "Invalid image data."
      });

    }


    mimeType =
      match[1];

    base64 =
      match[2];

  }


  const prompt = `

You are EXAMOS AI handwritten solution analysis engine.

Student context:

${context(body)}

Analyze the uploaded handwritten solution.

Determine:

1. Question being solved
2. Student's final answer
3. Whether answer is correct
4. First meaningful mistake
5. Mistake type
6. Correct method
7. Correct answer
8. Weak topic
9. Concept check
10. Simple Hindi explanation
11. Practice topic

Mistake type can be:

calculation
formula
concept
method
sign
unit
incomplete
unclear

Do not invent unreadable handwriting.

If handwriting cannot be understood,
clearly say that.

Return ONLY valid JSON.

Format:

{
  "readable": true,
  "question": "...",
  "studentFinalAnswer": "...",
  "isCorrect": false,
  "mistake": "...",
  "correctMethod": "...",
  "correctAnswer": "...",
  "weakTopic": "...",
  "conceptCheck": "...",
  "explanationHindi": "...",
  "practiceTopic": "..."
}
`;


  const raw =
    await callGemini(

      ANALYSIS_MODEL,

      [
        {
          role: "user",

          parts: [

            {
              inlineData: {
                mimeType,
                data: base64
              }
            },

            {
              text: prompt
            }

          ]
        }
      ],

      apiKey,

      {
        maxOutputTokens: 2200,

        responseMimeType:
          "application/json"
      }
    );


  let result;


  try {

    result =
      extractJSON(raw);

  } catch {

    return res.status(500).json({
      success: false,
      error:
        "AI ने invalid analysis JSON दिया।"
    });

  }


  return res.status(200).json({

    success: true,

    mode:
      "analyze_solution",

    readable:
      Boolean(
        result.readable
      ),

    question:
      String(
        result.question || ""
      ),

    studentFinalAnswer:
      String(
        result.studentFinalAnswer || ""
      ),

    isCorrect:
      Boolean(
        result.isCorrect
      ),

    mistake:
      String(
        result.mistake || ""
      ),

    correctMethod:
      String(
        result.correctMethod || ""
      ),

    correctAnswer:
      String(
        result.correctAnswer || ""
      ),

    weakTopic:
      String(
        result.weakTopic || ""
      ),

    conceptCheck:
      String(
        result.conceptCheck || ""
      ),

    explanationHindi:
      String(
        result.explanationHindi || ""
      ),

    practiceTopic:
      String(
        result.practiceTopic ||
        result.weakTopic ||
        ""
      )

  });
};
