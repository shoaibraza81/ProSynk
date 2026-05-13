// app/api/ai/agent/route.js
// ─────────────────────────────────────────────────────────────
//  ProSynk Agentic AI — Groq-powered, robust single route
//  requestType: "insight"         → AI Insights button
//  requestType: "detailed_report" → Detailed Report button
// ─────────────────────────────────────────────────────────────

import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function analyzeProjects(projects) {
    const today = new Date();
    return projects.map((p) => {
        const progress = Number(p.progress) || 0;
        const hasEnd = p.end_date ? new Date(p.end_date) : null;
        const daysLeft = hasEnd ? Math.ceil((hasEnd - today) / 86400000) : null;

        let risk = 0;
        if (p.status === "on_hold") risk += 40;
        if (progress < 30) risk += 30;
        if (daysLeft !== null && daysLeft < 7) risk += 30;
        if (p.status === "completed") risk = 0;

        return {
            name: p.name,
            status: p.status,
            progress,
            days_left: daysLeft,
            risk_score: Math.min(risk, 100),
            spi: progress > 0 ? parseFloat((progress / 50).toFixed(2)) : 0,
        };
    });
}

function analyzeTasks(tasks) {
    const today = new Date();
    const overdue = tasks.filter(
        (t) => t.deadline && new Date(t.deadline) < today && t.status !== "Completed"
    );
    const highPriority = tasks.filter(
        (t) => t.priority === "High" && t.status !== "Completed"
    );
    const workload = {};
    tasks.forEach((t) => {
        if (t.assigned_user_id) {
            workload[t.assigned_user_id] = (workload[t.assigned_user_id] || 0) + 1;
        }
    });
    return {
        total: tasks.length,
        overdue_count: overdue.length,
        high_priority_count: highPriority.length,
        overdue_titles: overdue.slice(0, 5).map((t) => t.title),
        workload,
    };
}

async function generateWithGroq(projectAnalysis, taskAnalysis, requestType) {
    const isInsight = requestType === "insight";

    const timestamp = new Date().toISOString();

    const systemPrompt = `You are ProSynk's AI project analyst.
You will receive pre-computed project and task analysis data.
You must respond with ONLY a valid JSON object — no markdown, no backticks, no explanation.
Always cover EVERY project in the predictions array — never skip any.
Vary your sentence structure and wording each time so reports feel fresh.
${isInsight ? `
The JSON must have exactly this shape:
{
  "summary": "3-4 sentence executive overview covering ALL projects and overall portfolio health",
  "reminders": [
    { "task": "action item title", "reason": "why this matters" }
  ],
  "predictions": [
    { "project_name": "name", "risk_score": 45 }
  ]
}
Rules:
- predictions must include ONE entry for EVERY project in the analysis — no exceptions
- reminders should cover the most urgent actions across all projects (max 4)
- summary must mention overall portfolio health, not just one project
` : `
The JSON must have exactly this shape:
{
  "summary": "6-8 sentence detailed audit covering ALL projects, schedule performance, risk areas, team workload, overdue tasks, recommendations, and an overall health rating of Good / At Risk / Critical"
}
`}`;

    const userMessage = `
Report generated at: ${timestamp}

Project Analysis:
${JSON.stringify(projectAnalysis, null, 2)}

Task Analysis:
${JSON.stringify(taskAnalysis, null, 2)}

Generate the ${isInsight ? "insight report" : "detailed audit report"} JSON now.`;

    const response = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        temperature: 0.8,   
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
        ],
    });

    const raw = response.choices[0]?.message?.content || "";

    const stripped = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const toParse = jsonMatch ? jsonMatch[0] : stripped;

    try {
        return JSON.parse(toParse);
    } catch (parseErr) {
        console.error("JSON parse failed. Raw response:", raw);
        throw new Error("AI returned invalid JSON. Please try again.");
    }
}

export async function POST(req) {
    try {
        const { projects = [], tasks = [], requestType = "insight" } = await req.json();

        if (!projects.length) {
            return Response.json(
                { success: false, error: "No projects provided." },
                { status: 400 }
            );
        }

        const projectAnalysis = analyzeProjects(projects);
        const taskAnalysis = analyzeTasks(tasks);

        const report = await generateWithGroq(projectAnalysis, taskAnalysis, requestType);

        if (!report) {
            return Response.json(
                { success: false, error: "Agent did not produce a report. Please try again." },
                { status: 500 }
            );
        }

        return Response.json({ success: true, result: report });

    } catch (err) {
        console.error("Agent error:", err?.message || err);
        return Response.json(
            { success: false, error: err.message || "Agent failed." },
            { status: 500 }
        );
    }
}