const https = require("https");

function callAnthropic(apiKey, prompt, maxTokens, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Anthropic error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  console.log("Blueprint function invoked:", event.httpMethod, new Date().toISOString());
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { type, data } = payload;
  if (!type || !data) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing type or data" }) };
  }

  let prompt = "";
  let maxTokens = 1200;

  if (type === "niche") {
    const { bizType, description } = data;
    prompt = `A local/small business owner in the "${bizType}" category described their business as: "${description}"

Return ONLY valid JSON (no markdown, no backticks):
{
  "title":"3-5 word business type descriptor (e.g. Family-Owned HVAC Company)",
  "identity":"You serve [specific customer type] who need [specific service/outcome] in [their market]. (1 sentence starting with You serve)",
  "focusAreas":[
    {"label":"3-6 words naming a specific marketing struggle","description":"One sentence: what this problem costs them AND what fixing it could produce. Example: No Google rankings means competitors take your leads and ranking for 5 local keywords could add 20 inbound calls per month.","top":true},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":true},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":true},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":false},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":false},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":false},
    {"label":"3-6 words naming a specific marketing struggle","description":"Same format: specific pain plus concrete outcome if fixed","top":false}
  ],
  "rec":"1 sentence: which 1-2 focus areas would move the needle fastest for this specific business and why"
}

CRITICAL: Focus area labels must name real specific marketing struggles. Bad: Local SEO Presence. Good: No Google Rankings Losing Leads. Every description must name the pain AND the potential outcome if fixed.`;
    maxTokens = 1200;

  } else if (type === "blueprint") {
    const { bizType, bizId, description, focusArea, pillar, situation, mindset, fiveK, state, revMid } = data;
    prompt = `Create a Local Business Marketing Blueprint. Be specific. No generic advice.

PROFILE:
Type: ${bizType} | Identity: ${bizId} | Description: ${description}
Gap: ${focusArea} | Pillar: ${pillar} | State: ${state} | Revenue: $${revMid}/mo
Situation: ${situation || "N/A"} | Mindset: ${mindset} | Ready: ${fiveK}

GoHighLevel (GHL) is the recommended core platform. Always list it first in techStack.

Return ONLY valid JSON:
{
"systemTitle":"Specific marketing system name",
"systemType":"Short label e.g. Local SEO + Google Ads + GHL",
"tagline":"One sentence: who it serves, what it delivers, timeframe",
"idealCustomer":"Two sentences on exactly who to target and why",
"primaryFocus":"One sentence: #1 priority and why",
"techStack":["GoHighLevel + one sentence on how it helps","Tool 2 + one sentence","Tool 3 + one sentence"],
"quickWin":{"title":"Your 7-Day Quick Win","description":"One sentence on this week's action","actions":["Action 1 max 25 words","Action 2 max 25 words","Action 3 max 25 words"]},
"simplest":"One sentence: simplest first step tomorrow morning",
"weeks":[
{"tag":"Week 1","title":"Foundation","tasks":["Max 18 words","Max 18 words","Max 18 words","Max 18 words"]},
{"tag":"Week 2","title":"Launch","tasks":["Max 18 words","Max 18 words","Max 18 words","Max 18 words"]},
{"tag":"Week 3","title":"Optimize","tasks":["Max 18 words","Max 18 words","Max 18 words","Max 18 words"]},
{"tag":"Week 4","title":"Scale","tasks":["Max 18 words","Max 18 words","Max 18 words","Max 18 words"]}
],
"milestone":"By day 30 you will have [specific milestone]",
"seoStrategy":"Two sentences on local SEO approach for this business + state",
"adsStrategy":"Two sentences on paid ads recommendation for this pillar + business",
"websiteTip":"One sentence: highest-impact website change",
"businessTip":"One sentence: insider tip specific to this business type"
}

HARD RULES: Every tasks string MAX 18 words. Every quickWin action MAX 25 words. Be tight. Be specific.`;
    maxTokens = 2500;

  } else {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  try {
    const result = await callAnthropic(apiKey, prompt, maxTokens, "claude-sonnet-4-6");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: result.content[0].text }),
    };
  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", detail: err.message }),
    };
  }
};
