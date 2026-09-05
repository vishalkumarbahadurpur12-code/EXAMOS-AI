export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Only POST requests are allowed"
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            error: "GEMINI_API_KEY is not configured"
        });
    }

    try {

        const body = req.body || {};
        const mode = String(body.mode || "ask").trim();

        const allowedModes = [
            "ask",
            "explain",
            "test",
            "practice",
            "targeted_practice"
        ];

        if (!allowedModes.includes(mode)) {
            return res.status(400).json({
                error: "Invalid AI mode"
            });
        }

        /*
        ============================================================
        ASK / EXPLAIN
        ============================================================
        */

        if (mode === "ask" || mode === "explain") {

            const prompt = clean(body.prompt, 5000);

            if (!prompt) {
                return res.status(400).json({
                    error: "Prompt is required"
                });
            }

            const result = await callGemini({
                apiKey,
                prompt: `
तुम EXAMOS AI के Mathematics Teacher हो।

छात्र को सरल Hindi/Hinglish में पढ़ाओ।

नियम:

- गणितीय उत्तर सही होना चाहिए।
- पहले concept समझाओ।
- फिर step-by-step solution दो।
- calculation को दोबारा check करो।
- अंत में final answer स्पष्ट रूप से दो।
- अगर छात्र की गलती हो तो गलती बताओ।
- अगर प्रश्न अधूरा है तो अनुमान लगाकर गलत उत्तर मत दो।
- छात्र "समझ नहीं आया" कहे तो और आसान भाषा इस्तेमाल करो।
- अनावश्यक रूप से बहुत लंबा उत्तर मत दो।

छात्र का सवाल:

${prompt}
`,
                schema: answerSchema()
            });

            return res.status(200).json({
                success: true,
                mode,
                answer: result.answer || "",
                explanation: result.explanation || ""
            });
        }


        /*
        ============================================================
        EDUCATIONAL PARAMETERS
        ============================================================
        */

        const className = clean(body.class, 50);
        const board = clean(body.board, 100);
        const subject = clean(body.subject, 100);
        const chapter = clean(body.chapter, 200);
        const topic = clean(body.topic, 200);

        const count = clamp(
            body.count,
            1,
            50,
            10
        );

        const difficulty = clean(
            body.difficulty || "medium",
            30
        );

        const language = clean(
            body.language || "Hindi",
            30
        );


        /*
        ============================================================
        REQUIRED FIELDS
        ============================================================
        */

        if (!className) {
            return res.status(400).json({
                error: "Class is required"
            });
        }

        if (!board) {
            return res.status(400).json({
                error: "Board is required"
            });
        }

        if (!chapter) {
            return res.status(400).json({
                error: "Chapter is required"
            });
        }


        /*
        ============================================================
        MATHEMATICS ONLY
        ============================================================
        */

        if (
            subject &&
            ![
                "mathematics",
                "math",
                "गणित"
            ].includes(subject.toLowerCase())
        ) {

            return res.status(400).json({
                error:
                    "EXAMOS currently supports Mathematics only."
            });
        }


        /*
        ============================================================
        TARGETED PRACTICE
        ============================================================
        */

        if (
            mode === "targeted_practice" &&
            !topic
        ) {

            return res.status(400).json({
                error:
                    "Topic is required for targeted practice"
            });
        }


        /*
        ============================================================
        GENERATE + VERIFY
        ============================================================
        */

        const generationConfig = {
            mode,
            className,
            board,
            chapter,
            topic,
            count,
            difficulty,
            language
        };

        let verifiedQuestions = null;
        let lastError = null;

        /*
        We allow up to 3 complete generation/verification rounds.
        */

        for (
            let round = 1;
            round <= 3;
            round++
        ) {

            try {

                console.log(
                    `EXAMOS generation round ${round}`
                );


                /*
                ----------------------------------------------------
                STEP 1: GENERATE
                ----------------------------------------------------
                */

                const generated =
                    await generateQuestions({
                        apiKey,
                        ...generationConfig
                    });


                /*
                ----------------------------------------------------
                STEP 2: BASIC VALIDATION
                ----------------------------------------------------
                */

                validateQuestions(
                    generated.questions,
                    generationConfig
                );


                /*
                ----------------------------------------------------
                STEP 3: INDEPENDENT ANSWER VERIFICATION
                ----------------------------------------------------
                */

                const verification =
                    await verifyQuestions({
                        apiKey,
                        questions:
                            generated.questions,
                        className,
                        board,
                        chapter,
                        topic,
                        language
                    });


                /*
                ----------------------------------------------------
                STEP 4: CHECK VERIFIER RESULT
                ----------------------------------------------------
                */

                const verificationResult =
                    validateVerification(
                        generated.questions,
                        verification
                    );


                if (
                    verificationResult.invalidQuestions
                        .length === 0
                ) {

                    /*
                    EVERYTHING PASSED
                    */

                    verifiedQuestions =
                        generated.questions.map(
                            (question, index) => ({
                                ...question,

                                verified: true,

                                verification:
                                    verificationResult
                                        .results[index]
                            })
                        );

                    break;
                }


                /*
                ----------------------------------------------------
                SOME ANSWERS FAILED
                ----------------------------------------------------
                */

                lastError = new Error(
                    "Answer verification failed for " +
                    verificationResult
                        .invalidQuestions.length +
                    " question(s)."
                );

                console.warn(
                    "Verification failed:",
                    verificationResult
                        .invalidQuestions
                );

            } catch (error) {

                lastError = error;

                console.error(
                    `EXAMOS round ${round} failed:`,
                    error?.message
                );
            }
        }


        /*
        ============================================================
        FAILED AFTER ALL RETRIES
        ============================================================
        */

        if (!verifiedQuestions) {

            return res.status(502).json({
                success: false,
                error:
                    "AI ने questions generate किए लेकिन answer verification pass नहीं हुआ। कृपया फिर से कोशिश करें।",
                details:
                    lastError?.message ||
                    "Verification failed"
            });
        }


        /*
        ============================================================
        FINAL VERIFIED RESPONSE
        ============================================================
        */

        return res.status(200).json({

            success: true,

            mode,

            class: className,

            board,

            subject: "Mathematics",

            chapter,

            topic: topic || null,

            difficulty,

            language,

            verified: true,

            questions: verifiedQuestions
        });


    } catch (error) {

        console.error(
            "EXAMOS AI Server Error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                "AI server error: " +
                (
                    error?.message ||
                    "Unknown error"
                )
        });
    }
}


/*
====================================================================
GENERATE QUESTIONS
====================================================================
*/

async function generateQuestions({
    apiKey,
    mode,
    className,
    board,
    chapter,
    topic,
    count,
    difficulty,
    language
}) {

    const prompt = `

तुम EXAMOS AI के question generator हो।

तुम्हें school-level Mathematics MCQs बनाने हैं।

============================================================
STUDENT INFORMATION
============================================================

Board:
${board}

Class:
${className}

Subject:
Mathematics

Chapter:
${chapter}

Topic:
${topic || "Chapter के अंदर उपयुक्त topics"}

Difficulty:
${difficulty}

Language:
${language}

Mode:
${mode}

============================================================
STRICT RULES
============================================================

1. ठीक ${count} questions बनाओ।

2. हर question में ठीक 4 अलग-अलग options हों।

3. केवल ONE option mathematically correct होना चाहिए।

4. correctAnswer zero-based होगा:

0 = option A
1 = option B
2 = option C
3 = option D

5. हर question requested chapter के अंदर होना चाहिए।

6. अगर Topic दिया गया है तो question उसी exact topic पर होना चाहिए।

7. दो questions duplicate नहीं होने चाहिए।

8. दो options duplicate नहीं होने चाहिए।

9. ambiguous question मत बनाओ।

10. ऐसा question मत बनाओ जिसमें दो answers सही हो सकते हैं।

11. हर answer की calculation internally दोबारा check करो।

12. explanation उसी correct answer को support करनी चाहिए।

13. question student's class level के अनुसार होना चाहिए।

14. syllabus से बाहर की advanced चीजें unnecessarily मत लाओ।

15. यदि किसी question का answer निश्चित नहीं है तो वह question मत बनाओ।

16. अनुमान लगाकर answer मत बनाओ।

============================================================
TARGETED PRACTICE
============================================================

${mode === "targeted_practice"
    ? `
यह TARGETED PRACTICE है।

Selected Topic:
${topic}

हर एक question इसी topic को test करेगा।

दूसरे topic से question बनाना STRICTLY PROHIBITED है।
`
    : ""
}

============================================================
QUALITY
============================================================

CORRECTNESS > CREATIVITY

पहले question solve करो।
फिर options बनाओ।
फिर correct answer तय करो।
फिर calculation दोबारा check करो।
फिर explanation लिखो।

`;

    return await callGemini({
        apiKey,
        prompt,
        schema: questionSchema(count)
    });
}


/*
====================================================================
ANSWER VERIFICATION ENGINE
====================================================================
*/

async function verifyQuestions({
    apiKey,
    questions,
    className,
    board,
    chapter,
    topic,
    language
}) {

    /*
    IMPORTANT:

    The verifier receives the generated question,
    but its job is to SOLVE IT INDEPENDENTLY.

    It should NOT simply trust the generated correctAnswer.
    */

    const verificationInput =
        questions.map((q, index) => {

            return {
                id: index,

                question:
                    q.question,

                options:
                    q.options,

                generatedCorrectAnswer:
                    q.correctAnswer,

                generatedExplanation:
                    q.explanation,

                topic:
                    q.topic
            };

        });


    const prompt = `

तुम EXAMOS AI के INDEPENDENT ANSWER VERIFIER हो।

तुम्हारा काम generated Mathematics questions के answers
को independently solve करके verify करना है।

IMPORTANT:

GENERATED correctAnswer पर भरोसा मत करो।

हर question को खुद solve करो।

फिर:

1. question पढ़ो
2. calculation करो
3. चारों options compare करो
4. independently correct option निकालो
5. generated correctAnswer से compare करो
6. अगर generated answer गलत है तो invalid बताओ
7. अगर question ambiguous है तो invalid बताओ
8. अगर दो options सही हैं तो invalid बताओ
9. अगर कोई option सही नहीं है तो invalid बताओ
10. explanation और correct answer में contradiction हो तो invalid बताओ

Student:

Class:
${className}

Board:
${board}

Subject:
Mathematics

Chapter:
${chapter}

${topic ? `Selected Topic:\n${topic}` : ""}

Language:
${language}

Generated Questions:

${JSON.stringify(
    verificationInput,
    null,
    2
)}

============================================================

VERIFICATION RULE:

"verified": true तभी होगा जब:

- question valid हो
- exactly one correct option हो
- independently calculated answer
  generatedCorrectAnswer से match करता हो
- explanation consistent हो
- topic appropriate हो

अगर इनमें से कोई भी condition fail हो:

verified = false

और reason में बताओ कि क्यों।

`;

    return await callGemini({
        apiKey,
        prompt,
        schema:
            verificationSchema(
                questions.length
            )
    });
}


/*
====================================================================
VALIDATE VERIFICATION
====================================================================
*/

function validateVerification(
    questions,
    verification
) {

    if (
        !verification ||
        !Array.isArray(
            verification.results
        )
    ) {

        throw new Error(
            "Verification results missing"
        );
    }

    if (
        verification.results.length !==
        questions.length
    ) {

        throw new Error(
            "Verification result count mismatch"
        );
    }

    const invalidQuestions = [];

    const results =
        verification.results.map(
            (result, index) => {

                if (
                    !result ||
                    typeof result !== "object"
                ) {

                    invalidQuestions.push(index);

                    return {
                        verified: false,
                        reason:
                            "Invalid verifier response"
                    };
                }

                if (
                    result.verified !== true
                ) {

                    invalidQuestions.push(index);

                    return {
                        verified: false,
                        independentCorrectAnswer:
                            result
                                .independentCorrectAnswer,
                        reason:
                            result.reason ||
                            "Answer verification failed"
                    };
                }

                /*
                Make sure verifier's answer is valid.
                */

                if (
                    !Number.isInteger(
                        result
                            .independentCorrectAnswer
                    ) ||
                    result
                        .independentCorrectAnswer <
                        0 ||
                    result
                        .independentCorrectAnswer >
                        3
                ) {

                    invalidQuestions.push(index);

                    return {
                        verified: false,
                        reason:
                            "Verifier returned invalid answer index"
                    };
                }

                /*
                VERY IMPORTANT:

                Independent answer must equal
                generated answer.
                */

                if (
                    result
                        .independentCorrectAnswer !==
                    questions[index]
                        .correctAnswer
                ) {

                    invalidQuestions.push(index);

                    return {
                        verified: false,
                        independentCorrectAnswer:
                            result
                                .independentCorrectAnswer,
                        reason:
                            "Generated answer does not match independently verified answer"
                    };
                }

                return {
                    verified: true,

                    independentCorrectAnswer:
                        result
                            .independentCorrectAnswer,

                    reason:
                        result.reason ||
                        "Answer independently verified"
                };
            }
        );

    return {
        results,
        invalidQuestions
    };
}


/*
====================================================================
QUESTION VALIDATION
====================================================================
*/

function validateQuestions(
    questions,
    config
) {

    if (!Array.isArray(questions)) {
        throw new Error(
            "Questions array missing"
        );
    }

    if (
        questions.length !==
        config.count
    ) {

        throw new Error(
            `Expected ${config.count} questions, got ${questions.length}`
        );
    }

    const seen = new Set();

    for (
        let i = 0;
        i < questions.length;
        i++
    ) {

        const q = questions[i];

        if (
            !q ||
            typeof q !== "object"
        ) {
            throw new Error(
                `Question ${i + 1} invalid`
            );
        }


        /*
        QUESTION
        */

        if (
            typeof q.question !== "string" ||
            !q.question.trim()
        ) {

            throw new Error(
                `Question ${i + 1} has no text`
            );
        }


        /*
        DUPLICATE QUESTION
        */

        const normalized =
            normalize(q.question);

        if (seen.has(normalized)) {

            throw new Error(
                `Duplicate question ${i + 1}`
            );
        }

        seen.add(normalized);


        /*
        OPTIONS
        */

        if (
            !Array.isArray(q.options) ||
            q.options.length !== 4
        ) {

            throw new Error(
                `Question ${i + 1} must have exactly 4 options`
            );
        }


        const options =
            q.options.map(
                option =>
                    normalize(option)
            );


        if (
            new Set(options).size !== 4
        ) {

            throw new Error(
                `Question ${i + 1} has duplicate options`
            );
        }


        /*
        CORRECT ANSWER
        */

        if (
            !Number.isInteger(
                q.correctAnswer
            ) ||
            q.correctAnswer < 0 ||
            q.correctAnswer > 3
        ) {

            throw new Error(
                `Question ${i + 1} has invalid correctAnswer`
            );
        }


        /*
        TOPIC
        */

        if (
            typeof q.topic !== "string" ||
            !q.topic.trim()
        ) {

            throw new Error(
                `Question ${i + 1} has no topic`
            );
        }


        /*
        TARGETED TOPIC
        */

        if (
            config.mode ===
                "targeted_practice" &&
            config.topic
        ) {

            if (
                normalize(q.topic) !==
                normalize(config.topic)
            ) {

                throw new Error(
                    `Question ${i + 1} is outside selected topic`
                );
            }
        }


        /*
        DIFFICULTY
        */

        if (
            typeof q.difficulty !==
                "string" ||
            !q.difficulty.trim()
        ) {

            throw new Error(
                `Question ${i + 1} has no difficulty`
            );
        }


        /*
        EXPLANATION
        */

        if (
            typeof q.explanation !==
                "string" ||
            !q.explanation.trim()
        ) {

            throw new Error(
                `Question ${i + 1} has no explanation`
            );
        }
    }

    return true;
}


/*
====================================================================
GEMINI API CALL
====================================================================
*/

async function callGemini({
    apiKey,
    prompt,
    schema
}) {

    const model =
        "gemini-3.5-flash-lite";

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response =
        await fetch(url, {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",

                "x-goog-api-key":
                    apiKey
            },

            body: JSON.stringify({

                systemInstruction: {
                    parts: [
                        {
                            text: `
EXAMOS AI CORE RULES:

CORRECTNESS > CREATIVITY

Never knowingly return an incorrect
mathematical answer.

For MCQs:

- exactly 4 options
- exactly 1 correct option
- calculate independently
- check calculations
- never guess
- follow requested chapter
- follow requested topic
- never duplicate questions

For verification tasks:

Do not trust the generated answer.
Solve the problem independently.
`
                        }
                    ]
                },

                contents: [
                    {
                        role: "user",

                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],

                generationConfig: {

                    responseMimeType:
                        "application/json",

                    responseSchema:
                        schema
                }

            })
        });


    const data =
        await response.json();


    if (!response.ok) {

        console.error(
            "Gemini API Error:",
            JSON.stringify(data)
        );

        throw new Error(
            data?.error?.message ||
            "Gemini API request failed"
        );
    }


    const text =
        data?.candidates?.[0]
            ?.content
            ?.parts
            ?.map(
                part =>
                    part?.text || ""
            )
            .join("")
            .trim();


    if (!text) {

        throw new Error(
            "Gemini returned empty response"
        );
    }


    try {

        return JSON.parse(text);

    } catch (error) {

        console.error(
            "Invalid JSON from Gemini:",
            text
        );

        throw new Error(
            "AI returned invalid JSON"
        );
    }
}


/*
====================================================================
QUESTION SCHEMA
====================================================================
*/

function questionSchema(count) {

    return {

        type: "object",

        properties: {

            questions: {

                type: "array",

                minItems: count,

                maxItems: count,

                items: {

                    type: "object",

                    properties: {

                        question: {
                            type: "string"
                        },

                        options: {

                            type: "array",

                            minItems: 4,

                            maxItems: 4,

                            items: {
                                type: "string"
                            }
                        },

                        correctAnswer: {

                            type: "integer",

                            minimum: 0,

                            maximum: 3
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
}


/*
====================================================================
VERIFICATION SCHEMA
====================================================================
*/

function verificationSchema(count) {

    return {

        type: "object",

        properties: {

            results: {

                type: "array",

                minItems: count,

                maxItems: count,

                items: {

                    type: "object",

                    properties: {

                        verified: {
                            type: "boolean"
                        },

                        independentCorrectAnswer: {

                            type: "integer",

                            minimum: 0,

                            maximum: 3
                        },

                        reason: {
                            type: "string"
                        }

                    },

                    required: [
                        "verified",
                        "independentCorrectAnswer",
                        "reason"
                    ]
                }
            }

        },

        required: [
            "results"
        ]
    };
}


/*
====================================================================
ASK / EXPLAIN SCHEMA
====================================================================
*/

function answerSchema() {

    return {

        type: "object",

        properties: {

            answer: {
                type: "string"
            },

            explanation: {
                type: "string"
            }

        },

        required: [
            "answer",
            "explanation"
        ]
    };
}


/*
====================================================================
HELPERS
====================================================================
*/

function clean(value, maxLength) {

    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .slice(0, maxLength);
}


function clamp(
    value,
    min,
    max,
    fallback
) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return fallback;
    }

    return Math.min(
        max,
        Math.max(
            min,
            Math.floor(n)
        )
    );
}


function normalize(value) {

    return String(value || "")
        .toLowerCase()
        .replace(
            /[^\p{L}\p{N}]+/gu,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}
