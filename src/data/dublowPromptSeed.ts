// src/data/dublowPromptSeed.ts
// Twenty Dublow-authored prompts seeded into the "Dublow" folder on first launch.
// Bracketed hints in the originals have been converted to {{placeholder}} form so
// the prompt-fill modal can render one labeled field per variable at use-time.

export type DublowSeedPrompt = {
  title: string;
  body: string;
  tags: string[];
};

export const DUBLOW_SEED: DublowSeedPrompt[] = [
  // ---------- Strategy and positioning ----------
  {
    title: 'The Positioning Stress Test',
    tags: ['strategy', 'positioning'],
    body:
      'Here is my current one-sentence positioning: {{positioning_sentence}}. ' +
      'Act as three skeptical buyers in my target market and tell me, in their own voice, why this does not compel them. ' +
      'Then rewrite the sentence three ways, each targeting a different buyer psychology.',
  },
  {
    title: 'The Competitor X-Ray',
    tags: ['strategy', 'competition'],
    body:
      'My top three competitors are {{competitors}}. ' +
      'Visit their sites, compare pricing, feature breadth, positioning language, and social proof. ' +
      'Identify the gap in the market none of them are filling, and tell me whether I am positioned to own it.',
  },
  {
    title: 'The Five-Year Pre-Mortem',
    tags: ['strategy', 'risk'],
    body:
      'It is five years from now and my business has failed. ' +
      'Walk me through the three most likely causes, in order of probability, based on what you know about my model ({{business_model}}), my market ({{market}}), and solo operators in general. ' +
      'Be blunt.',
  },

  // ---------- Operations and leverage ----------
  {
    title: 'The Time Audit',
    tags: ['operations', 'productivity'],
    body:
      'Here is a list of everything I did this week: {{weekly_tasks}}. ' +
      'Categorize each task as (a) revenue-generating, (b) revenue-protecting, (c) delegatable, or (d) eliminatable. ' +
      'Then tell me the two tasks I should stop doing immediately.',
  },
  {
    title: 'The SOP Generator',
    tags: ['operations', 'delegation'],
    body:
      'I am going to describe a recurring task in my business: {{task_description}}. ' +
      'Write it up as a standard operating procedure detailed enough that a contractor earning $15/hour could execute it without asking me a single question.',
  },
  {
    title: 'The Delegation Readiness Check',
    tags: ['operations', 'delegation', 'hiring'],
    body:
      'Given my revenue of ${{monthly_revenue}} and these responsibilities {{responsibilities}}, ' +
      'what is the single highest-leverage role I should hire or contract first, what should I pay, and what should the job description say?',
  },

  // ---------- Sales and marketing ----------
  {
    title: 'The Objection Inventory',
    tags: ['sales', 'conversion'],
    body:
      'Act as my ideal customer who was about to buy but did not. ' +
      'List the ten most likely reasons you walked away, ranked by how often they occur in markets like mine ({{market}}). ' +
      'For each, give me the one-sentence response that would have salvaged the sale.',
  },
  {
    title: 'The Cold Outreach Rewrite',
    tags: ['sales', 'outreach', 'copywriting'],
    body:
      'Here is the cold email I am sending: {{cold_email}}. ' +
      'Rewrite it three ways: (1) shorter and sharper, (2) more curiosity-driven, (3) more specific to the recipient. ' +
      'Then tell me which will likely convert best and why.',
  },
  {
    title: 'The Offer Ladder',
    tags: ['sales', 'pricing', 'offer'],
    body:
      'My current offer is {{current_offer}}. ' +
      'Design a three-tier offer ladder — entry, core, premium — with pricing, inclusions, and the psychological reason each tier exists. ' +
      'Flag which tier most solopreneurs in my position underprice.',
  },
  {
    title: 'The Content Engine',
    tags: ['marketing', 'content'],
    body:
      'Here is a 30-minute transcript of me talking about {{topic}}: {{transcript}}. ' +
      'Extract: (a) three LinkedIn posts, (b) one newsletter, (c) five tweet-length hooks, (d) one long-form article outline. ' +
      'Preserve my voice; do not make it sound like marketing copy.',
  },

  // ---------- Finance ----------
  {
    title: 'The Runway Reality Check',
    tags: ['finance', 'runway'],
    body:
      'Here are my monthly revenue, fixed costs, and variable costs: {{financials}}. ' +
      'Tell me my true runway, my break-even MRR, and the three expenses most likely to be bloat for a business of my stage.',
  },
  {
    title: 'The Pricing Raise Script',
    tags: ['finance', 'pricing', 'copywriting'],
    body:
      'I want to raise prices by {{percent_increase}}%. ' +
      'Write the email to existing clients that communicates this with confidence, offers an honest reason, and minimizes churn. ' +
      'Then give me a one-liner for the two clients most likely to push back.',
  },
  {
    title: 'The Tax-Aware Decision Helper',
    tags: ['finance', 'tax', 'decision'],
    body:
      'I am considering {{purchase_or_hire}} for ${{amount}}. ' +
      'Walk me through the decision as a US sole proprietor / LLC owner: cash impact, tax treatment, and whether this is genuinely a business expense or I am rationalizing. ' +
      'Then give me the honest answer.',
  },

  // ---------- Product and execution ----------
  {
    title: 'The Scope Cutter',
    tags: ['product', 'execution', 'scope'],
    body:
      'Here is the feature list I want to build: {{feature_list}}. ' +
      'I have {{hours_per_week}} hours/week for the next {{weeks}} weeks. ' +
      'Cut this to the minimum viable version that still delivers the core promise, and tell me which cuts I will most regret and which I will not.',
  },
  {
    title: 'The Weekly Review',
    tags: ['execution', 'accountability'],
    body:
      'Act as a pragmatic, experienced solopreneur coach. ' +
      'Here is what I planned this week and what I actually did: {{plan_vs_actual}}. ' +
      'Give me a brutally honest review — no encouragement theater — and three specific corrections for next week.',
  },
  {
    title: 'The Customer Interview Script',
    tags: ['product', 'research'],
    body:
      'I want to interview five existing customers to find out why they really bought. ' +
      'Write me a 20-minute interview script using the Jobs-to-be-Done framework, with follow-up probes for when they give vague answers. ' +
      'Context on my product: {{product_context}}.',
  },

  // ---------- Personal operating system ----------
  {
    title: 'The Decision Journal',
    tags: ['personal', 'decision'],
    body:
      'I am about to make this decision: {{decision_description}}. ' +
      'Walk me through it using a decision-journal format: what I expect to happen, what could go wrong, what signal would tell me I was wrong, and what I would do then.',
  },
  {
    title: 'The Energy Audit',
    tags: ['personal', 'productivity'],
    body:
      'Here is my typical week: {{weekly_schedule}}. ' +
      'Identify the mismatch between when I do my highest-value work and when my energy is actually highest. ' +
      'Propose a restructured week.',
  },
  {
    title: 'The Boundary Script',
    tags: ['sales', 'client-management', 'copywriting'],
    body:
      'A client is asking for {{out_of_scope_request}}. ' +
      'Write me two responses: one that says no without damaging the relationship, and one that reframes it as a paid add-on with a specific price and deliverable.',
  },
  {
    title: 'The Annual Letter to Myself',
    tags: ['personal', 'reflection'],
    body:
      'Act as me, one year from today, writing a letter back to present-day me. ' +
      'I tell you: my revenue goal is {{revenue_goal}}, my stress point is {{stress_point}}, my biggest blind spot is probably {{blind_spot}}. ' +
      'Write the letter. Be kind but not soft.',
  },
];