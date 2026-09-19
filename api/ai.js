const GENERATION_MODEL = "gemini-3.5-flash-lite";
const ANALYSIS_MODEL = "gemini-3.5-flash";

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_QUESTIONS = 20;
const REQUEST_TIMEOUT = 45000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success:false,
      error:"Method not allowed"
    });
  }

  try {
    const body = req.body || {};
    const mode = body.mode;

    if (!mode) {
      return res.status(400).json({
        success:false,
        error:"Mode required"
      });
    }

    switch (mode) {
      case "chat":
        return await handleChat(req, res, body);

      case "concept":
        return await handleConcept(req, res, body);

      case "generate_questions":
        return await handleGenerateQuestions(req, res, body);

      case "generate_practice":
        return await handleGeneratePractice(req, res, body);

      case "analyze_solution":
        return await handleAnalyzeSolution(req, res, body);

      default:
        return res.status(400).json({
          success:false,
          error:
            "Invalid mode. Supported modes: chat, concept, generate_questions, generate_practice, analyze_solution"
        });
    }

  } catch (error) {
    console.error("AI API ERROR:", error);

    return res.status(500).json({
      success:false,
      error:error?.message || "AI server error"
    });
  }
};

/* =========================================================
   COMMON
========================================================= */

function clean(value, fallback="") {
  return String(value ?? fallback).trim();
}

function getKey() {
  return process.env.GEMINI_API_KEY || "";
}

function context(body) {
  return `
Board: ${clean(body.board,"CBSE")}
Class: ${clean(body.class)}
Stream: ${clean(body.stream,"Not applicable")}
Subject: ${clean(body.subject,"Not specified")}
Chapter: ${clean(body.chapter,"Not specified")}
Topic: ${clean(body.topic,"Not specified")}
`;
}

async function gemini(model, contents, config={}) {
  const key = getKey();

  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured in Vercel");
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(
      `${API_BASE}${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          contents,
          ...config
        }),
        signal:controller.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini:",data);
      throw new Error(
        data?.error?.message ||
        "Gemini API request failed"
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") || "";

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    return text;

  } finally {
    clearTimeout(timer);
  }
}

function jsonConfig(schema) {
  return {
    generationConfig:{
      responseMimeType:"application/json",
      responseSchema:schema
    }
  };
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);

  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  throw new Error("AI returned invalid JSON");
}

/* =========================================================
   CHAT
========================================================= */

async function handleChat(req,res,body) {

  const message =
    clean(body.message) ||
    clean(body.prompt);

  if (!message && !body.imageBase64) {
    return res.status(400).json({
      success:false,
      error:"Message or image required"
    });
  }

  const imagePart = makeImagePart(body.imageBase64);

  const prompt = `
You are EXAMOS AI, a friendly personal study assistant for school students.

${context(body)}

Student language preference:
${clean(body.language,"Match the student's language")}

Rules:
1. Answer according to the selected class, board and subject.
2. Never randomly switch the subject.
3. Explain difficult concepts simply.
4. For Mathematics/Physics/Chemistry, keep formulas mathematically correct.
5. For numerical problems, show steps.
6. For Biology/Social Science/languages, explain according to school level.
7. If the student's question is unclear, ask one short clarification.
8. Match the student's language: Hindi, English or Hinglish.
9. Do not pretend a syllabus fact is certain when it depends on a board.
10. Be concise but useful.

Student question:
${message || "Analyze the attached study photo."}
`;

  const parts = [
    {text:prompt}
  ];

  if (imagePart) {
    parts.push(imagePart);
  }

  const answer = await gemini(
    GENERATION_MODEL,
    [{
      role:"user",
      parts
    }]
  );

  return res.status(200).json({
    success:true,
    mode:"chat",
    answer
  });
}

/* =========================================================
   CONCEPT
========================================================= */

async function handleConcept(req,res,body) {

  const prompt = `
You are EXAMOS AI concept teacher.

${context(body)}

Teach the selected school topic in a simple student-friendly way.

Return JSON.

The explanation should:
- start from the basic idea
- use simple language
- use correct definitions
- use formulas where necessary
- give 1 or 2 solved examples when useful
- mention common mistakes
- end with short revision points

Use Hindi + English terminology naturally.

Topic:
${clean(body.topic) || clean(body.chapter)}
`;

  const schema = {
    type:"object",
    properties:{
      title:{type:"string"},
      explanation:{type:"string"},
      examples:{type:"string"},
      commonMistakes:{type:"string"},
      revisionPoints:{type:"string"}
    },
    required:[
      "title",
      "explanation",
      "examples",
      "commonMistakes",
      "revisionPoints"
    ]
  };

  const text = await gemini(
    GENERATION_MODEL,
    [{role:"user",parts:[{text:prompt}]}],
    jsonConfig(schema)
  );

  const result = parseJSON(text);

  return res.status(200).json({
    success:true,
    mode:"concept",
    ...result
  });
}

/* =========================================================
   QUESTION SCHEMA
========================================================= */

const questionSchema = {
  type:"object",
  properties:{
    question:{type:"string"},
    options:{
      type:"array",
      items:{type:"string"}
    },
    correctAnswer:{type:"string"},
    explanation:{type:"string"},
    topic:{type:"string"},
    difficulty:{type:"string"}
  },
  required:[
    "question",
    "options",
    "correctAnswer",
    "explanation",
    "topic",
    "difficulty"
  ]
};

const questionsSchema = {
  type:"object",
  properties:{
    questions:{
      type:"array",
      items:questionSchema
    }
  },
  required:["questions"]
};

/* =========================================================
   GENERATE QUESTIONS
========================================================= */

async function handleGenerateQuestions(req,res,body) {

  let count = Number(body.count || 10);

  count = Math.max(
    1,
    Math.min(MAX_QUESTIONS,count)
  );

  const previous =
    Array.isArray(body.previousQuestions)
      ? body.previousQuestions.slice(0,30)
      : [];

  const prompt = `
You are EXAMOS AI's question generator.

${context(body)}

Generate exactly ${count} fresh multiple-choice questions.

Difficulty:
${clean(body.difficulty,"Mixed")}

Language:
${clean(body.language,"Hindi + English")}

Important:
- Questions must match the selected class.
- Questions must match the selected subject.
- Questions must match the chapter when provided.
- Do not generate questions from another class.
- Do not use college-level content.
- Do not repeat previous questions.
- Every question must have exactly 4 options.
- correctAnswer must be exactly A, B, C or D.
- explanation must explain why the answer is correct.
- topic must identify the exact concept.
- Avoid ambiguous questions.
- Do not include markdown outside the JSON.

Previous questions:
${JSON.stringify(previous)}

Return JSON only.
`;

  const text = await gemini(
    GENERATION_MODEL,
    [{role:"user",parts:[{text:prompt}]}],
    jsonConfig(questionsSchema)
  );

  let result = parseJSON(text);

  let questions = validateQuestions(
    result.questions,
    count
  );

  if (questions.length < count) {
    const retryPrompt = `
Generate ${count} completely fresh MCQs.

${context(body)}

Return only valid JSON.

Requirements:
4 options per question.
correctAnswer must be A/B/C/D.
No duplicates.
School level only.
`;

    const retryText = await gemini(
      GENERATION_MODEL,
      [{role:"user",parts:[{text:retryPrompt}]}],
      jsonConfig(questionsSchema)
    );

    const retry = parseJSON(retryText);

    questions = validateQuestions(
      retry.questions,
      count
    );
  }

  if (!questions.length) {
    throw new Error("Valid AI questions could not be generated");
  }

  return res.status(200).json({
    success:true,
    mode:"generate_questions",
    verified:true,
    requestId:body.requestId || "",
    questions
  });
}

/* =========================================================
   GENERATE PRACTICE
========================================================= */

async function handleGeneratePractice(req,res,body) {

  let count = Number(body.count || 10);

  count = Math.max(
    1,
    Math.min(MAX_QUESTIONS,count)
  );

  const prompt = `
You are EXAMOS AI personalized practice generator.

${context(body)}

Generate exactly ${count} MCQ practice questions.

Difficulty:
${clean(body.difficulty,"Medium")}

Topic:
${clean(body.topic,body.chapter)}

Rules:
- Questions must target the selected topic.
- Match class and board level.
- Four options exactly.
- correctAnswer = A/B/C/D.
- Include explanation.
- Include topic.
- Avoid duplicate wording.
- Do not generate unrelated content.
- Return JSON only.
`;

  const text = await gemini(
    GENERATION_MODEL,
    [{role:"user",parts:[{text:prompt}]}],
    jsonConfig(questionsSchema)
  );

  const result = parseJSON(text);

  const questions = validateQuestions(
    result.questions,
    count
  );

  if (!questions.length) {
    throw new Error("Valid practice questions could not be generated");
  }

  return res.status(200).json({
    success:true,
    mode:"generate_practice",
    verified:true,
    requestId:body.requestId || "",
    questions
  });
}

/* =========================================================
   VALIDATE QUESTIONS
========================================================= */

function validateQuestions(list,count) {

  if (!Array.isArray(list)) {
    return [];
  }

  const seen = new Set();
  const output=[];

  for (const q of list) {

    if (!q || typeof q !== "object") continue;

    const question =
      clean(q.question);

    const options =
      Array.isArray(q.options)
        ? q.options.map(x=>clean(x)).filter(Boolean)
        : [];

    const correct =
      clean(q.correctAnswer).toUpperCase();

    if (!question) continue;
    if (options.length !== 4) continue;
    if (!["A","B","C","D"].includes(correct)) continue;

    const key =
      question.toLowerCase()
        .replace(/\s+/g," ");

    if (seen.has(key)) continue;

    seen.add(key);

    output.push({
      question,
      options,
      correctAnswer:correct,
      explanation:clean(
        q.explanation,
        "Correct answer selected based on the concept."
      ),
      topic:clean(q.topic,"General"),
      difficulty:clean(q.difficulty,"Medium")
    });

    if (output.length >= count) break;
  }

  return output;
}

/* =========================================================
   SOLUTION ANALYSIS
========================================================= */

async function handleAnalyzeSolution(req,res,body) {

  const image =
    body.imageBase64 ||
    body.image ||
    body.imageData ||
    body.photo;

  if (!image) {
    return res.status(400).json({
      success:false,
      error:"Solution image required"
    });
  }

  const imagePart = makeImagePart(image);

  if (!imagePart) {
    return res.status(400).json({
      success:false,
      error:"Invalid image format"
    });
  }

  const prompt = `
You are EXAMOS AI's handwritten solution analyzer.

${context(body)}

Analyze the student's handwritten solution image.

Your job:
1. Read the question if visible.
2. Read the student's work.
3. Decide whether the final answer is correct.
4. If wrong, identify where the mistake happened.
5. Classify the mistake as:
   - calculation
   - formula
   - concept
   - step
   - reading/question understanding
   - unknown
6. Explain the correct method.
7. Give the correct answer when possible.
8. Identify the weak topic.
9. Give a short concept check.
10. Suggest a practice topic.

Important:
- Do not invent handwriting that cannot be read.
- If image is unclear, say so.
- Do not claim certainty when the image does not allow it.
- Use student-friendly Hindi/Hinglish.
- Preserve mathematical notation correctly.

Return JSON only.
`;

  const schema = {
    type:"object",
    properties:{
      readable:{type:"boolean"},
      question:{type:"string"},
      studentFinalAnswer:{type:"string"},
      isCorrect:{type:"boolean"},
      mistake:{type:"string"},
      mistakeType:{type:"string"},
      correctMethod:{type:"string"},
      correctAnswer:{type:"string"},
      weakTopic:{type:"string"},
      conceptCheck:{type:"string"},
      explanationHindi:{type:"string"},
      practiceTopic:{type:"string"}
    },
    required:[
      "readable",
      "question",
      "studentFinalAnswer",
      "isCorrect",
      "mistake",
      "mistakeType",
      "correctMethod",
      "correctAnswer",
      "weakTopic",
      "conceptCheck",
      "explanationHindi",
      "practiceTopic"
    ]
  };

  const text = await gemini(
    ANALYSIS_MODEL,
    [{
      role:"user",
      parts:[
        {text:prompt},
        imagePart
      ]
    }],
    jsonConfig(schema)
  );

  const result=parseJSON(text);

  return res.status(200).json({
    success:true,
    mode:"analyze_solution",
    ...result
  });
}

/* =========================================================
   IMAGE HELPER
========================================================= */

function makeImagePart(value) {

  if (!value) return null;

  let mimeType="image/jpeg";
  let data=String(value);

  if (data.startsWith("data:")) {

    const match =
      data.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) return null;

    mimeType=match[1];
    data=match[2];
  }

  if (!data) return null;

  return {
    inlineData:{
      mimeType,
      data
    }
  };
}
