import { NextResponse } from "next/server";
import OpenAI from "openai";

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req) {
    try {
        const body = await req.json();
        const projects = body.projects || [];
        const tasks = body.tasks || [];

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" },
            max_tokens: 1000,
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: `You are a Lead Project Strategy Consultant for ProSynk. 
                    GOAL: Provide a quick, high-level executive insight.
                    INSTRUCTIONS: 
                    1. Provide a 2-paragraph summary focusing only on the "big picture".
                    2. Identify top 3 critical risks only.
                    STRUCTURE: Return ONLY a JSON object:
                    {
                      "summary": "Full text here...",
                      "reminders": [{ "task": "Name", "priority": "High|Med|Low", "reason": "..." }],
                      "predictions": [{ "project_name": "Name", "risk_score": 0, "forecast": "...", "mitigation": "..." }]
                    }`
                },
                {
                    role: "user",
                    content: `Projects: ${JSON.stringify(projects)}, Tasks: ${JSON.stringify(tasks)}`
                }
            ],
        });

        return NextResponse.json({ success: true, result: response.choices[0].message.content });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}