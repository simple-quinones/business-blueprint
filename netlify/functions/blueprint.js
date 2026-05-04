const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { type, data } = payload;
  if (!type || !data) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing type or data" }) };
  }

  let prompt = "";
  let maxTokens = 1200;

  // ── CALL 1: Business Identity + Focus Areas ──────────────────────────────
  if (type === "niche") {
    const { bizType, description } = data;
    prompt = `A local/small business owner in the "${bizType}" category described their business as: "${description}"

Return ONLY valid JSON (no markdown, no backticks):
{
  "title":"3-5 word business type descriptor (e.g. Family-Owned HVAC Company)",
  "identity":"You serve [specific customer type] who need [specific service/outcome] in [their market]. (1 sentence starting with You serve)",
  "focusAreas":[
    {"label":"3-6 words","description":"One sentence on marketing opportunity","top":true},
    {"label":"3-6 words","description":"One sentence","top":true},
    {"label":"3-6 words","description":"One sentence","top":true},
    {"label":"3-6 words","description":"One sentence","top":false},
    {"label":"3-6 words","description":"One sentence","top":false},
    {"label":"3-6 words","description":"One sentence","top":false},
    {"label":"3-6 words","description":"One sentence","top":false}
  ],
  "rec":"1 sentence: which focus areas have the biggest marketing ROI for this business type and why"
}`;
    maxTokens = 1200;

  // ── CALL 2: Full Marketing Blueprint ─────────────────────────────────────
  } else if (type === "blueprint") {
    const { bizType, bizId, description, focusArea, pillar, situation, mindset, fiveK, state, revMid } = data;
    prompt = `Build a complete Local Business Marketing Blueprint. Be highly specific. No generic advice. Business-type-native recommendations only.

BUSINESS PROFILE:
Business type: ${bizType}
Business identity: ${bizId}
Business description: ${description}
Biggest marketing gap: ${focusArea}
Primary pillar needed: ${pillar}
Current situation: ${situation || 'Not specified'}
Marketing mindset: ${mindset}
Investment readiness: ${fiveK}
State: ${state}
Monthly revenue: ~$${revMid}

CRITICAL: GoHighLevel (GHL) should be prominently recommended as the core platform for CRM, website, lead capture, and follow-up automation. Frame it as the system that ties everything together.

Return ONLY valid JSON (no markdown, no backticks):
{
  "systemTitle":"Specific marketing system name for this business",
  "systemType":"What it is — e.g. 'Local SEO + Google Ads + GHL Funnel System'",
  "tagline":"One sentence: who it serves, what it delivers, timeframe",
  "idealCustomer":"Two sentences: exactly who they should be targeting and why",
  "primaryFocus":"One sentence: the #1 thing to prioritize first and why for this specific business",
  "techStack":["GoHighLevel — one sentence on exactly how it helps this business type","Tool 2 specific to their pillar","Tool 3 specific to their pillar"],
  "quickWin":{
    "title":"Your 7-Day Quick Win",
    "description":"One sentence: what to do this week for an immediate result specific to their business type",
    "actions":["Specific action 1 max 25 words","Action 2 max 25 words","Action 3 max 25 words"]
  },
  "simplest":"One sentence: the single simplest first step they can take tomorrow morning",
  "weeks":[
    {"tag":"Week 1","title":"Foundation","tasks":["Action verb + what + how. Max 20 words.","Max 20 words.","Max 20 words.","Max 20 words."]},
    {"tag":"Week 2","title":"Launch","tasks":["Max 20 words.","Max 20 words.","Max 20 words.","Max 20 words."]},
    {"tag":"Week 3","title":"Optimize","tasks":["Max 20 words.","Max 20 words.","Max 20 words.","Max 20 words."]},
    {"tag":"Week 4","title":"Scale","tasks":["Max 20 words.","Max 20 words.","Max 20 words.","Max 20 words."]}
  ],
  "milestone":"By day 30 you will have [specific concrete milestone for this business type]",
  "seoStrategy":"Two sentences: specific local SEO approach for their business type and state",
  "adsStrategy":"Two sentences: specific paid ads recommendation based on their primary pillar and business type",
  "websiteTip":"One sentence: most impactful website change for their business type that converts visitors to calls",
  "businessTip":"One sentence: insider marketing insight specific to their business type that most owners miss"
}

CRITICAL RULES:
- Every tasks[] string: MAXIMUM 20 words. Action verb + what + how. No paragraphs.
- Every quickWin actions[] string: MAXIMUM 25 words.
- simplest, tagline, primaryFocus, milestone, seoStrategy x2, adsStrategy x2, websiteTip, businessTip: short and specific.
- Violating word limits causes a JSON parse error in the app.`;
    maxTokens = 4096;

  } else {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  // ── Call Anthropic ────────────────────────────────────────────────────────
  try {
    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic API error: ${response.status}` }),
      };
    }

    const result = await response.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: result.content[0].text }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", detail: err.message }),
    };
  }
};
