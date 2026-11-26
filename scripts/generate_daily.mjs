// scripts/generate_daily.mjs
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function fetchYesterdayHeadlines() {
    const rssRes = await fetch('https://feeds.bbci.co.uk/news/business/rss.xml');
    const xml = await rssRes.text();
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
        .map(m => m[1])
        .slice(1, 10);
    return titles.join('\n- ');
}

async function generateEdexcelBriefing(headlines) {
    const prompt = `
You are the editor of New Hall Economic Review, a daily UK A-Level Economics (Edexcel 9EC0) broadsheet.
Pick the single most relevant UK or global macroeconomic/microeconomic story from yesterday's headlines below:
- ${headlines}

Return ONLY valid JSON matching this exact schema:
{
  "story": {
    "id": "daily-story",
    "title": "Italicized newspaper question or headline",
    "heroImage": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85",
    "photoCaption": "Short editorial caption",
    "photoCredit": "PHOTOGRAPH: EDITORIAL ARCHIVE",
    "hasRelevantGraph": true,
    "chartTitle": "Relevant Edexcel 9EC0 Diagram & Empirical Data",
    "articleParagraphs": ["Paragraph 1...", "Paragraph 2...", "Paragraph 3..."],
    "pullQuote": "\"Key analytical takeaway quote\"",
    "specTopics": [{ "code": "2.6.2", "name": "Topic name" }],
    "economics": {
      "summary": "Core theory summary",
      "points": [{ "term": "Mechanism", "desc": "Explanation" }]
    },
    "evidence": {
      "intro": "Empirical data intro",
      "table": [{ "metric": "Indicator", "reading": "Value", "context": "Context" }]
    },
    "evaluation": [{ "title": "Evaluation point", "detail": "Detailed AO4 point" }],
    "application": {
      "essayPrompt": "Edexcel 9EC0 25-mark essay question",
      "checklist": [
        { "code": "AO1", "label": "..." },
        { "code": "AO2", "label": "..." },
        { "code": "AO3", "label": "..." },
        { "code": "AO4", "label": "..." }
      ]
    },
    "opinionsHeadline": "Balanced debate headline",
    "opinionsArgs": [
      { "stance": "Argument For", "text": "..." },
      { "stance": "Argument Against", "text": "..." }
    ],
    "questionBank": {
      "10-mark": { "label": "10-Mark Past Paper Question", "source": "Edexcel 9EC0 Past Paper", "paperUrl": "https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html", "question": "...", "markGuide": "..." },
      "12-mark": { "label": "12-Mark Past Paper Question", "source": "Edexcel 9EC0 Past Paper", "paperUrl": "https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html", "question": "...", "markGuide": "..." },
      "25-mark": { "label": "25-Mark Essay Question", "source": "Edexcel 9EC0 Past Paper", "paperUrl": "https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html", "question": "...", "markGuide": "..." },
      "maths": { "label": "Quantitative Skills (Maths) Question", "source": "Edexcel 9EC0 Quantitative Skills", "paperUrl": "https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html", "question": "...", "markGuide": "..." }
    }
  },
  "jargon": {
    "term-key": {
      "term": "Full Term Name",
      "category": "Edexcel 9EC0 · Theme",
      "definition": "Plain English definition",
      "examTip": "Exam Tip: ..."
    }
  }
}

STRICT RULES:
1. NEVER use an em dash anywhere in the output.
2. NEVER write the full name of something followed by its acronym in parentheses.
3. Wrap every advanced economics term in articleParagraphs with <span class="inline-term font-normal text-ink">word<sup class="ml-[1px]"><button type="button" onclick="openJargonPopover(event, 'term-key')" class="font-sans text-[11px] font-bold text-crimson hover:text-ink leading-none cursor-pointer bg-transparent border-0 p-0">?</button></sup></span> and include matching keys in "jargon".
4. Do not put inline figures inside <strong> tags.
`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        })
    });
    const data = await res.json();
    const rawText = data.candidates[0].content.parts[0].text.replace(/—/g, ', ');
    return JSON.parse(rawText);
}

async function runDailyPipeline() {
    const headlines = await fetchYesterdayHeadlines();
    const generated = await generateEdexcelBriefing(headlines);

    await fetch(`${SUPABASE_URL}/rest/v1/daily_briefings`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
            published_date: new Date().toISOString().slice(0, 10),
            story_json: generated.story,
            jargon_json: generated.jargon,
            indicators_json: {}
        })
    });

    if (RESEND_API_KEY) {
        const subRes = await fetch(`${SUPABASE_URL}/rest/v1/subscribers?select=email`, {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
            }
        });
        const subscribers = await subRes.json();

        for (const sub of subscribers) {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'New Hall Economic Review <onboarding@resend.dev>',
                    to: sub.email,
                    subject: `6:00 AM Briefing: ${generated.story.title}`,
                    html: `
                        <div style="font-family: 'Times New Roman', Georgia, serif; max-width: 640px; margin: 0 auto; color: #121212;">
                            <p style="font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: bold; letter-spacing: 0.2em; color: #E3120B; text-transform: uppercase;">NEW HALL ECONOMIC REVIEW.</p>
                            <h1 style="font-style: italic; font-size: 28px; border-top: 1px solid #D9D9D9; padding-top: 16px;">${generated.story.title}</h1>
                            ${generated.story.articleParagraphs.map(p => `<p style="font-size: 18px; line-height: 1.6;">${p.replace(/<[^>]*>/g, '')}</p>`).join('')}
                            <hr style="border: 0; border-top: 1px solid #121212; margin: 24px 0;">
                            <p style="font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; color: #E3120B; text-transform: uppercase;">Daily Practice Question</p>
                            <p style="font-size: 17px; font-weight: bold;">${generated.story.questionBank['10-mark'].question}</p>
                        </div>
                    `
                })
            });
        }
    }
    console.log('6:00 AM briefing published and emails dispatched.');
}

runDailyPipeline();
