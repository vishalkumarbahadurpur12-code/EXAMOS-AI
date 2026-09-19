const GENERATION_MODEL = "gemini-3.5-flash-lite";
const ANALYSIS_MODEL = "gemini-3.5-flash";

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_QUESTIONS = 20;
const REQUEST_TIMEOUT = 50000;

module.exports = async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      success:false,
      error:"Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success:false,
      error:"GEMINI_API_KEY is missing in Vercel Environment Variables."
    });
  }

  try {

    const body = req.body || {};
    const mode = String(body.mode || "").trim();

    if (!mode) {
      return res.status(400).json({
        success:false,
        error:"Mode required."
      });
    }

    if (mode === "chat") {
      return await handleChat(body,res,apiKey);
    }

    if (mode === "concept") {
      return await handleConcept(body,res,apiKey);
    }

    if (mode === "generate_questions") {
      return await handleQuestions(body,res,apiKey,false);
    }

    if (mode === "generate_practice") {
      return await handleQuestions(body,res,apiKey,true);
    }

    if (mode === "analyze_solution") {
      return await handleSolutionAnalysis(body,res,apiKey);
    }

    return res.status(400).json({
      success:false,
      error:
        "Invalid mode. Supported modes: chat, concept, generate_questions, generate_practice, analyze_solution."
    });

  } catch (error) {

    console.error("AI API ERROR:",error);

    return res.status(500).json({
      success:false,
      error:
        error?.message ||
        "AI server error."
    });
  }
};


/* =========================================================
   COMMON HELPERS
========================================================= */

function context(body) {

  return `
Board: ${body.board || "CBSE"}
Class: ${body.class || "10"}
Stream: ${body.stream || "Not applicable"}
Subject: ${body.subject || "General"}
Chapter: ${body.chapter || "Not specified"}
Topic: ${body.topic || "Not specified"}
`;
}


async function callGemini(
  model,
  contents,
  apiKey,
  generationConfig={}
) {

  const url =
    API_BASE +
    model +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const controller = new AbortController();

  const timeout=setTimeout(
    ()=>controller.abort(),
    REQUEST_TIMEOUT
  );

  try {

    const response=await fetch(url,{
      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify({

        contents,

        generationConfig

      }),

      signal:controller.signal

    });

    const data=await response.json();

    if(!response.ok){

      const msg =
        data?.error?.message ||
        "Gemini API request failed.";

      throw new Error(msg);
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(x=>x.text || "")
        .join("")
        .trim();

    if(!text){

      throw new Error(
        "Gemini returned an empty response."
      );
    }

    return text;

  } finally {

    clearTimeout(timeout);

  }
}


function extractJSON(text){

  let clean=String(text||"").trim();

  clean=clean
    .replace(/^```json/i,"")
    .replace(/^```/i,"")
    .replace(/```$/,"")
    .trim();

  const first=clean.indexOf("{");
  const last=clean.lastIndexOf("}");

  if(first>=0 && last>first){

    clean=clean.slice(
      first,
      last+1
    );
  }

  return JSON.parse(clean);
}


function normalizeQuestion(q,index){

  const options=Array.isArray(q.options)
    ? q.options.slice(0,4).map(String)
    : [];

  let answer=String(
    q.correctAnswer ||
    q.answer ||
    ""
  ).trim().toUpperCase();

  answer=answer
    .replace(/[^ABCD]/g,"")
    .slice(0,1);

  return {

    id:q.id || `q_${Date.now()}_${index}`,

    question:String(
      q.question ||
      q.questionText ||
      ""
    ).trim(),

    options,

    correctAnswer:answer,

    explanation:String(
      q.explanation || ""
    ).trim(),

    topic:String(
      q.topic || ""
    ).trim(),

    chapter:String(
      q.chapter || ""
    ).trim(),

    difficulty:String(
      q.difficulty || ""
    ).trim()

  };
}


function validateQuestions(questions,count){

  if(!Array.isArray(questions))
    return false;

  if(questions.length<Math.min(3,count))
    return false;

  for(const q of questions){

    if(!q.question)
      return false;

    if(!Array.isArray(q.options))
      return false;

    if(q.options.length!==4)
      return false;

    if(!["A","B","C","D"].includes(q.correctAnswer))
      return false;
  }

  return true;
}


/* =========================================================
   CHAT
========================================================= */

async function handleChat(body,res,apiKey){

  const message=
    String(
      body.message ||
      body.prompt ||
      ""
    ).trim();

  if(!message){

    return res.status(400).json({
      success:false,
      error:"Message required."
    });
  }

  const prompt=`

You are EXAMOS AI, an Indian student learning assistant.

Student context:
${context(body)}

Student question:
${message}

Rules:

1. Answer according to the student's selected board, class,
   stream, subject and chapter whenever relevant.

2. If the subject is Mathematics, use correct mathematical notation.

3. If the subject is Science, explain concepts scientifically.

4. For Social Science, answer according to the academic context.

5. For Hindi/English/Sanskrit, answer in the relevant language
   and explain difficult concepts simply.

6. Prefer simple Hindi/Hinglish unless the student asks for English.

7. Do not invent facts.

8. For exam questions, give an exam-ready answer after explaining it.

9. If the student asks for a calculation, show steps.

10. Keep the answer student-friendly.

Return only the answer.
`;

  let answer=await callGemini(
    GENERATION_MODEL,
    [
      {
        role:"user",
        parts:[
          {text:prompt}
        ]
      }
    ],
    apiKey,
    {
      maxOutputTokens:1400
    }
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

async function handleConcept(body,res,apiKey){

  const prompt=`

You are the concept-teaching engine of EXAMOS AI.

Student context:
${context(body)}

Teach the selected concept in simple student-friendly Hindi.

Include:

1. Concept / definition
2. Important points
3. Formula or rules if applicable
4. One or two solved examples
5. Common mistakes
6. Quick revision points
7. Three things to remember for exams

Use correct academic terminology.

Do not make the explanation unnecessarily advanced.

Return clean educational text.
`;

  const answer=await callGemini(
    GENERATION_MODEL,
    [
      {
        role:"user",
        parts:[
          {text:prompt}
        ]
      }
    ],
    apiKey,
    {
      maxOutputTokens:1800
    }
  );

  return res.status(200).json({
    success:true,
    mode:"concept",
    answer
  });
}


/* =========================================================
   QUESTION GENERATION
========================================================= */

async function handleQuestions(
  body,
  res,
  apiKey,
  practice
){

  let count=Number(body.count || 10);

  if(!Number.isFinite(count))
    count=10;

  count=Math.max(
    3,
    Math.min(MAX_QUESTIONS,count)
  );

  const difficulty=
    String(body.difficulty || "Mixed");

  const chapter=
    String(body.chapter || "All Chapters");

  const topic=
    String(body.topic || "");

  const previous=
    Array.isArray(body.previousQuestions)
      ? body.previousQuestions
          .slice(-15)
          .map(x=>String(x).slice(0,200))
      : [];

  const prompt=`

You are the question generation engine for EXAMOS AI.

Student context:
${context(body)}

Task:
Generate ${count} high-quality multiple-choice questions.

Chapter:
${chapter}

Topic:
${topic || "Use important topics from the chapter"}

Difficulty:
${difficulty}

Mode:
${practice ? "Targeted Practice" : "Diagnostic Test"}

Requirements:

1. Questions must be appropriate for the selected class.

2. Questions must match the selected subject.

3. Respect the selected board when possible.

4. For Class 11/12 respect the selected stream.

5. Do not generate questions from unrelated subjects.

6. Every question must have exactly four options.

7. Exactly one option must be correct.

8. Correct answer must be A, B, C or D.

9. Questions must not repeat previous questions.

10. Include a useful topic for every question.

11. Include a short explanation.

12. Mix conceptual and application-based questions.

13. Avoid ambiguous questions.

14. For numerical questions, verify calculations.

15. For Hindi-medium students, question text may be Hindi
    while formulas and technical notation remain correct.

Previous questions to avoid:
${JSON.stringify(previous)}

Return ONLY valid JSON.

Format:

{
  "questions":[
    {
      "question":"...",
      "options":["...","...","...","..."],
      "correctAnswer":"A",
      "explanation":"...",
      "topic":"...",
      "chapter":"...",
      "difficulty":"Easy"
    }
  ]
}
`;

  let parsed;

  for(let attempt=1;attempt<=2;attempt++){

    try{

      const raw=await callGemini(
        GENERATION_MODEL,
        [
          {
            role:"user",
            parts:[
              {text:prompt}
            ]
          }
        ],
        apiKey,
        {
          maxOutputTokens:
            Math.min(
              7000,
              320*count
            ),
          responseMimeType:"application/json"
        }
      );

      parsed=extractJSON(raw);

      if(
        validateQuestions(
          parsed.questions,
          count
        )
      ){
        break;
      }

    }catch(error){

      if(attempt===2)
        throw error;
    }
  }

  if(!parsed?.questions){

    throw new Error(
      "AI could not generate verified questions."
    );
  }

  const questions=
    parsed.questions
      .slice(0,count)
      .map(normalizeQuestion)
      .filter(q=>
        q.question &&
        q.options.length===4 &&
        ["A","B","C","D"].includes(
          q.correctAnswer
        )
      );

  if(questions.length<Math.min(3,count)){

    throw new Error(
      "Generated questions failed validation."
    );
  }

  return res.status(200).json({
    success:true,
    mode:
      practice
        ? "generate_practice"
        : "generate_questions",
    verified:true,
    requestId:body.requestId || "",
    questions
  });
}


/* =========================================================
   SOLUTION PHOTO ANALYSIS
========================================================= */

async function handleSolutionAnalysis(
  body,
  res,
  apiKey
){

  let image=
    body.imageBase64 ||
    body.image ||
    body.imageData ||
    body.photo;

  if(!image){

    return res.status(400).json({
      success:false,
      error:"Image required."
    });
  }

  let mimeType="image/jpeg";
  let base64=String(image);

  if(base64.startsWith("data:")){

    const match=
      base64.match(
        /^data:([^;]+);base64,(.*)$/s
      );

    if(!match){

      return res.status(400).json({
        success:false,
        error:"Invalid image data."
      });
    }

    mimeType=match[1];
    base64=match[2];
  }

  const prompt=`

You are EXAMOS AI's handwritten solution analysis engine.

Student context:
${context(body)}

Analyze the uploaded handwritten solution carefully.

You must determine:

1. What question is being solved.
2. What the student's final answer is.
3. Whether the answer appears correct.
4. Where the first meaningful mistake occurs.
5. Whether the mistake is:
   - calculation
   - formula
   - concept
   - method
   - sign
   - unit
   - incomplete solution
   - unclear handwriting
6. Correct method.
7. Correct answer if determinable.
8. Weak topic.
9. Concept check.
10. Hindi explanation.
11. Practice topic.

Important:

- Do not invent unreadable handwriting.
- If something cannot be read, clearly say so.
- Check calculations carefully.
- Follow the selected board/class/subject.
- Use simple Hindi.
- Mathematical formulas must remain correct.

Return ONLY valid JSON.

Format:

{
  "readable":true,
  "question":"...",
  "studentFinalAnswer":"...",
  "isCorrect":false,
  "mistake":"...",
  "correctMethod":"...",
  "correctAnswer":"...",
  "weakTopic":"...",
  "conceptCheck":"...",
  "explanationHindi":"...",
  "practiceTopic":"..."
}
`;

  const raw=await callGemini(
    ANALYSIS_MODEL,
    [
      {
        role:"user",
        parts:[
          {
            inlineData:{
              mimeType,
              data:base64
            }
          },
          {
            text:prompt
          }
        ]
      }
    ],
    apiKey,
    {
      maxOutputTokens:2200,
      responseMimeType:"application/json"
    }
  );

  let result;

  try{
    result=extractJSON(raw);
  }catch{

    return res.status(500).json({
      success:false,
      error:"AI returned invalid analysis JSON."
    });
  }

  return res.status(200).json({
    success:true,
    mode:"analyze_solution",

    readable:Boolean(
      result.readable
    ),

    question:String(
      result.question || ""
    ),

    studentFinalAnswer:String(
      result.studentFinalAnswer || ""
    ),

    isCorrect:Boolean(
      result.isCorrect
    ),

    mistake:String(
      result.mistake || ""
    ),

    correctMethod:String(
      result.correctMethod || ""
    ),

    correctAnswer:String(
      result.correctAnswer || ""
    ),

    weakTopic:String(
      result.weakTopic || ""
    ),

    conceptCheck:String(
      result.conceptCheck || ""
    ),

    explanationHindi:String(
      result.explanationHindi || ""
    ),

    practiceTopic:String(
      result.practiceTopic ||
      result.weakTopic ||
      ""
    )
  });
};
