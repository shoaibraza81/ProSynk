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
            max_tokens: 3000,
            temperature: 0.4, 
            messages: [
                {
                    role: "system",
                    content: `You are a Senior Project Management Auditor for ProSynk. 
                    GOAL: Write a high-density, single-paragraph technical audit.
                    
                    INSTRUCTIONS: 
                    1. Do NOT provide lists, bullet points, reminders, or separate prediction objects.
                    2. Write one massive, comprehensive paragraph (at least 400 words).
                    3. Content must flow logically: start with Velocity/Trends, move into Technical Debt and specific Project Roadblocks, transition to Resource Allocation, and conclude with a 30-day Risk Forecast and Mitigation Strategy.
                    4. Use authoritative, "Senior Auditor" language.
                    
                    STRUCTURE: Return ONLY this JSON format:
                    {
                      "summary": "Your entire detailed report written as one continuous, professional paragraph..."
                    }`
                },
                {
                    role: "user",
                    content: `Projects: ${JSON.stringify(projects)}, Tasks: ${JSON.stringify(tasks)}`
                }
            ],
        });

        return NextResponse.json({
            success: true,
            result: response.choices[0].message.content
        });

    } catch (error) {
        console.error("Audit Generation Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "AI Service Unavailable"
        }, { status: 500 });
    }
}