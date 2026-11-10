/* Fiveday — paste-to-tasks, five-day split, role-aligned EOD report.
   Everything is local: localStorage only, no network. */
'use strict';

const STORE = 'fiveday.v1';

/* ------------------------------------------------------------------ *
 * Role defaults — AI Systems & Research Operations Specialist
 * ------------------------------------------------------------------ */
const DEFAULT_AREAS = [
  { id:'ai',    name:'AI Systems Development & Maintenance',
    lead:'On AI systems development and maintenance, I',
    keywords:'ai,claude,gpt,llm,prompt,model,agent,skill,mcp,python,api,worker,gemini,token,embedding,inference,fine-tune,notebook' },
  { id:'auto',  name:'Workflow Automation',
    lead:'For workflow automation, I',
    keywords:'automate,automation,workflow,pipeline,trigger,webhook,integration,zapier,make.com,batch,cron,scheduler,template,bulk,auto-fill,sync' },
  { id:'crm',   name:'CRM Infrastructure',
    lead:'On CRM infrastructure, I',
    keywords:'crm,podio,hubspot,salesforce,zoho,airtable,record,records,field,fields,stage,stages,tag,view,import,export,upload,merge,deal,contact,status update' },
  { id:'res',   name:'Property Research Operations',
    lead:'In property research operations, I',
    keywords:'property,properties,parcel,cad,deed,owner,heir,probate,lien,title,address,skip,skiptrace,skipgenie,delinquent,tax,county,roll,lead,leads,dibs,letter,letters,mailer,mail-ready,research,appraisal,plat,survey,foreclosure' },
  { id:'dq',    name:'Data Quality',
    lead:'For data quality, I',
    keywords:'duplicate,duplicates,dedupe,clean,cleanup,validate,verify,verification,accuracy,mismatch,normalize,format,standardize,qa,audit,correct,corrected,data quality,blank,missing,stale' },
  { id:'tech',  name:'Technical Troubleshooting',
    lead:'On technical troubleshooting, I',
    keywords:'bug,fix,fixed,broken,troubleshoot,debug,crash,error,fail,failing,issue,not working,permission,access,login,credential,reset,timeout,403,404,500,downtime' },
  { id:'bi',    name:'Business Intelligence',
    lead:'For business intelligence, I',
    keywords:'report,reporting,dashboard,metric,metrics,kpi,analysis,analyze,trend,forecast,insight,tracking,tracker,count,volume,conversion,summary,breakdown,pivot' },
];

const DEFAULT_METRICS = [
  { id:'props',   label:'Properties researched' },
  { id:'leads',   label:'Qualified leads' },
  { id:'letters', label:'Mail-ready letters' },
  { id:'dibs',    label:'DIBS leads' },
  { id:'errors',  label:'Errors corrected' },
  { id:'systems', label:'Systems deployed' },
];

const DEFAULT_STATE = {
  tasks: [],
  metrics: {},            // 'YYYY-MM-DD' -> {props:n, ...}
  notes: {},              // 'YYYY-MM-DD' -> {blockers:'', proposals:''}
  role: {
    title: 'AI Systems & Research Operations Specialist',
    org: 'GFP',
    objectives: 'efficiency,accuracy,scalability,lead generation,risk reduction',
    areas: DEFAULT_AREAS.map(a => ({...a})),
  },
  capacity: 6,
  weekStartDow: 1,
  tz: 'America/Chicago',   // the workday that matters is Central, not the device clock
  ai: { enabled: true, endpoint: 'https://studyforge-api.apx-jqnn.workers.dev' },
  weekStart: null,        // set on first load
};

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
let S = load();

function load(){
  try{
    const raw = localStorage.getItem(STORE);
    if(!raw) return fresh();
    const p = JSON.parse(raw);
    const s = {...structuredClone(DEFAULT_STATE), ...p};
    s.role = {...DEFAULT_STATE.role, ...(p.role||{})};
    s.ai = {...DEFAULT_STATE.ai, ...(p.ai||{})};
    if(!Array.isArray(s.role.areas) || !s.role.areas.length) s.role.areas = DEFAULT_AREAS.map(a=>({...a}));
    s.tasks = Array.isArray(s.tasks) ? s.tasks.map(normTask) : [];
    s.metrics = s.metrics || {}; s.notes = s.notes || {};
    if(!s.weekStart) s.weekStart = weekStartOf(todayISO(), s.weekStartDow);
    return s;
  }catch(e){ console.warn('load failed, starting fresh', e); return fresh(); }
}
function fresh(){
  const s = structuredClone(DEFAULT_STATE);
  s.weekStart = weekStartOf(todayISO(), s.weekStartDow);
  return s;
}
function save(){
  try{ localStorage.setItem(STORE, JSON.stringify(S)); }
  catch(e){ toast('Could not save to this browser'); }
}
function normTask(t){
  return {
    id: t.id || uid(),
    title: String(t.title||'').trim(),
    date: t.date || null,
    done: !!t.done,
    doneAt: t.doneAt || null,
    status: t.status || (t.done ? 'done' : 'pending'),   // pending | active | proposed | done
    due: t.due || null,
    priority: t.priority || 'normal',                     // high | normal | low
    area: t.area || null,
    objectives: Array.isArray(t.objectives) ? t.objectives : [],
    note: t.note || '',
    source: t.source || '',
    createdAt: t.createdAt || new Date().toISOString(),
  };
}
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DOW_SHORT= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function iso(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fromISO(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }

/* Dates below the day level are always read in the working timezone, not the
   device's. On a Manila laptop working Central hours the two disagree for most
   of the day, which would otherwise put tasks and EOD entries on the wrong day. */
function activeTz(){
  if(!S || !S.tz || S.tz === 'device') return Intl.DateTimeFormat().resolvedOptions().timeZone;
  return S.tz;
}
function tzISO(d){
  const when = d || new Date();
  try{
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: activeTz(), year:'numeric', month:'2-digit', day:'2-digit',
    }).format(when);
  }catch(e){ return iso(when); }
}
function tzLabel(){
  const tz = activeTz();
  try{
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'short'}).formatToParts(new Date());
    return (parts.find(p => p.type === 'timeZoneName') || {}).value || tz;
  }catch(e){ return tz; }
}
function todayISO(){ return tzISO(); }
function addDays(isoStr, n){ const d = fromISO(isoStr); d.setDate(d.getDate()+n); return iso(d); }
function weekStartOf(isoStr, dow){
  const d = fromISO(isoStr);
  const diff = (d.getDay() - dow + 7) % 7;
  d.setDate(d.getDate() - diff);
  return iso(d);
}
function weekDates(){ return [0,1,2,3,4].map(i => addDays(S.weekStart, i)); }
function prettyDate(isoStr){
  const d = fromISO(isoStr);
  return DOW_LONG[d.getDay()] + ', ' + MON_LONG[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function shortDate(isoStr){ const d = fromISO(isoStr); return (d.getMonth()+1) + '/' + d.getDate(); }
function nextWorkday(isoStr){
  let n = addDays(isoStr,1);
  while([0,6].includes(fromISO(n).getDay())) n = addDays(n,1);
  return n;
}

/* ------------------------------------------------------------------ *
 * Parser — pull action items out of pasted text
 * ------------------------------------------------------------------ */
const VERBS = ('send,email,call,text,message,follow,review,update,create,make,prepare,draft,check,confirm,schedule,book,fix,'+
 'submit,upload,download,add,remove,delete,write,finish,complete,finalize,reach,contact,verify,validate,test,deploy,push,pull,'+
 'merge,coordinate,sync,align,set,setup,organize,clean,compile,collect,gather,research,analyze,build,rebuild,design,document,'+
 'report,share,forward,reply,respond,process,handle,resolve,close,reconcile,audit,track,monitor,ensure,arrange,print,scan,sign,'+
 'file,log,enter,encode,tally,pay,invoice,quote,order,install,configure,migrate,backup,archive,fill,look,go,run,rerun,start,'+
 'continue,refactor,debug,troubleshoot,automate,generate,export,import,map,label,tag,sort,filter,flag,route,assign,escalate,'+
 'onboard,train,teach,walk,present,demo,publish,rename,restructure,split,combine,dedupe,cross-check,double-check,pick,find,'+
 'identify,qualify,screen,scrub,skip,trace,price,estimate,quote,draw,chart,graph,plot,set-up,wrap,revise,rewrite,translate'
).split(',');
const VERB_SET = new Set(VERBS);

const NOISE = [
  /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))\b/i,
  /^(thanks|thank you|many thanks|regards|best|best regards|kind regards|sincerely|cheers|br|talk soon|appreciate it)\b[\s,.!]*$/i,
  /^sent from my/i, /^on .{3,60}\bwrote:?\s*$/i,
  /^(from|to|cc|bcc|subject|date|sent|reply-to)\s*:/i,
  /unsubscribe/i, /this (e-?mail|message) (is|and)/i, /confidential/i,
  /^[-_=*~]{2,}$/, /^\s*$/, /^(fyi|fyi\.|heads up|just a heads up)\b[\s,.!]*$/i,
  /^(let me know|lmk)\b[\s,.!]*$/i, /^(no action (needed|required))\b/i,
  /^\d{1,2}:\d{2}\s*(am|pm)?$/i,
];
const KILL_PHRASES = [/\bno action (needed|required)\b/i, /\bfyi only\b/i, /\bjust so you know\b/i, /\bfor your (awareness|reference)\b/i];

const BULLET = /^\s*(?:[-*•◦▪·–—]|\[\s?[xX]?\s?\]|\(\s?\)|\d{1,2}[.)]|[a-hA-H][.)])\s+/;

function stripQuotes(text){
  // drop quoted reply blocks and signature tails
  const lines = text.replace(/\r/g,'').split('\n');
  const out = [];
  for(const ln of lines){
    if(/^\s*>+/.test(ln)) continue;
    if(/^\s*--\s*$/.test(ln)) break;
    if(/^\s*on .{3,80}\bwrote:?\s*$/i.test(ln)) break;
    if(/^-{3,}\s*(original message|forwarded message)/i.test(ln)) break;
    out.push(ln);
  }
  return out.join('\n');
}

function splitUnits(text){
  const units = [];
  for(let raw of stripQuotes(text).split('\n')){
    const line = raw.trim();
    if(!line) continue;
    const bulleted = BULLET.test(line);
    if(bulleted){ units.push({ text:line, bulleted:true }); continue; }
    // long prose: break into sentences so one paragraph can yield several items
    const words = line.split(/\s+/).length;
    if(words > 14 && /[.!?]\s/.test(line)){
      for(const s of line.split(/(?<=[.!?])\s+/)){
        const t = s.trim(); if(t) units.push({ text:t, bulleted:false });
      }
    } else {
      units.push({ text:line, bulleted:false });
    }
  }
  return units;
}

function scoreUnit(u){
  const t = u.text;
  const bare = t.replace(BULLET,'').trim();
  if(!bare) return -99;
  if(NOISE.some(r => r.test(bare))) return -99;
  if(KILL_PHRASES.some(r => r.test(bare))) return -99;
  const words = bare.split(/\s+/);
  const lower = bare.toLowerCase();
  const first = lower.split(/[\s,]+/)[0].replace(/[^a-z-]/g,'');
  let sc = 0;

  if(u.bulleted) sc += 3;
  if(VERB_SET.has(first)) sc += 3;
  if(/^(please|kindly|pls)\b/.test(lower)) sc += 3;
  if(/\b(please|kindly)\b/.test(lower)) sc += 1;
  if(/\b(can|could|would|will) you\b/.test(lower)) sc += 3;
  if(/\b(need to|needs to|needs|have to|has to|must|should|make sure|ensure that|ensure)\b/.test(lower)) sc += 2;
  const commitment = /^(i|we|you|they)\s+(also\s+|still\s+|now\s+)?(need to|needs to|have to|has to|must|should|will|'?ll|are going to|am going to)\b/.test(lower);
  if(commitment) sc += 3;
  if(/\b(action item|action items|to-?do|todo|next step|next steps|deliverable|task|assignment|follow up|follow-up|pending)\b/.test(lower)) sc += 3;
  if(/\b(by|before|due|deadline|eod|cob|asap)\b/.test(lower)) sc += 1;
  if(/\b(i will|i'?ll|we will|we'?ll)\b/.test(lower)) sc += 2;

  if(words.length < 3 && !u.bulleted) sc -= 3;
  if(words.length > 30) sc -= 1;
  if(/\?\s*$/.test(bare) && !/\b(can|could|would|will) you\b/.test(lower)) sc -= 3;
  if(/^(the|this|that|there|it|he|she|they|we)\b/.test(lower) && !u.bulleted && !commitment) sc -= 1;
  if(/\b(thanks|thank you|regards)\b/.test(lower) && words.length < 6) sc -= 3;
  if(/^[A-Z][A-Z\s&/-]{4,}$/.test(bare) && words.length <= 5) sc -= 2;   // all-caps header
  if(/https?:\/\//.test(bare) && words.length < 4) sc -= 2;
  if(/:$/.test(bare) && words.length <= 8 && !u.bulleted) return -99;   // list header
  return sc;
}

function cleanTitle(raw){
  let t = raw.replace(BULLET,'').trim();
  t = t.replace(/^(please|kindly|pls|also|and|then|next|additionally|lastly|finally)[,:\s]+/i,'');
  t = t.replace(/^(can|could|would|will)\s+you\s+(please\s+)?/i,'');
  t = t.replace(/^(i|we|they)\s+(also\s+|still\s+|now\s+)?(will|'?ll|need to|needs to|have to|has to|should|must|are going to|am going to)\s+/i,'');
  t = t.replace(/^(you\s+)?(need to|have to|must|should|will)\s+/i,'');
  t = t.replace(/^(make sure (to|that)?|ensure (that)?)\s+/i,'');
  // a bulleted line can carry a second sentence of colour — keep the instruction only
  const cut = t.match(/^(.{12,}?[.?!])\s+[A-Z(]/);
  if(cut && cut[1].split(/\s+/).length >= 4) t = cut[1];
  t = t.replace(/[,;(]?\s*\b(?:this one is\s+)?(no rush|not urgent|urgent|asap|low priority|high priority|if possible|if you can|when you (?:can|get a chance|have time)|time permitting|nice to have)\b[.!)]?\s*$/i,'');
  t = t.replace(/\s*[.,;?!]+$/,'').trim();
  t = t.replace(/\s{2,}/g,' ');
  if(t) t = t[0].toUpperCase() + t.slice(1);
  if(t.length > 180) t = t.slice(0,177).trimEnd() + '…';
  return t;
}

function detectPriority(lower){
  if(/\b(urgent|asap|critical|immediately|right away|top priority|high priority|p1|eod today|rush job)\b/.test(lower)) return 'high';
  if(/\b(low priority|no rush|whenever|when you (get a chance|can|have time)|nice to have|backlog|p3)\b/.test(lower)) return 'low';
  return 'normal';
}

function detectDue(lower, baseISO){
  const base = baseISO || todayISO();
  const upcoming = (targetDow, inclusive) => {
    const b = fromISO(base);
    let diff = (targetDow - b.getDay() + 7) % 7;
    if(diff === 0 && !inclusive) diff = 7;
    return addDays(base, diff);
  };
  if(/\b(today|eod|end of day|cob|close of business|by tonight|tonight)\b/.test(lower)) return base;
  if(/\b(asap|immediately|right away)\b/.test(lower)) return base;
  if(/\btomorrow\b/.test(lower)) return addDays(base,1);
  if(/\b(end of week|eow|by friday|before friday)\b/.test(lower)) return upcoming(5,true);
  if(/\bnext week\b/.test(lower)) return weekStartOf(addDays(base,7), S.weekStartDow || 1);
  if(/\bend of (the )?month\b/.test(lower)){
    const d = fromISO(base); return iso(new Date(d.getFullYear(), d.getMonth()+1, 0));
  }
  // weekday by name — only when a cue word marks it as a deadline
  const BACKREF = /\b(since|last|past|was|were|yesterday|earlier)\s+(?:\w+\s+){0,2}(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\b/;
  const dm = BACKREF.test(lower) ? null :
    lower.match(/\b(?:by|before|due(?:\s+\w+)?|on|no later than|deadline(?:\s+is)?|this|next|come)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\b/);
  if(dm){
    const map = {sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,weds:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
    const dow = map[dm[1]];
    if(dow !== undefined) return upcoming(dow, false);
  }
  // numeric 11/14 or 11/14/2026 or 2026-11-14
  let m = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if(m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  m = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if(m){
    const mm = +m[1], dd = +m[2];
    if(mm>=1 && mm<=12 && dd>=1 && dd<=31){
      let yy = m[3] ? +m[3] : fromISO(base).getFullYear();
      if(yy < 100) yy += 2000;
      let cand = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      if(!m[3] && cand < base) cand = `${yy+1}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      return cand;
    }
  }
  // Nov 14 / November 14th / 14 Nov
  const MN = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
  m = lower.match(new RegExp('\\b('+MN+')[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b'));
  if(!m) m = lower.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+MN+')[a-z]*\\b'));
  if(m){
    const names = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
    const a = m[1], b = m[2];
    const mm = names[a] || names[b];
    const dd = +(names[a] ? b : a);
    if(mm && dd>=1 && dd<=31){
      let yy = fromISO(base).getFullYear();
      let cand = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      if(cand < base) cand = `${yy+1}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      return cand;
    }
  }
  return null;
}

function detectArea(text){
  const norm = String(text||'').toLowerCase().replace(/[^a-z0-9.\s-]/g,' ').replace(/\s+/g,' ').trim();
  if(!norm) return null;
  const lower = ' ' + norm + ' ';
  const head  = ' ' + norm.split(' ').slice(0,6).join(' ') + ' ';   // the subject usually sits up front
  let best = null, bestScore = 0;
  for(const a of S.role.areas){
    let sc = 0;
    for(const kwRaw of String(a.keywords||'').split(',')){
      const kw = kwRaw.trim().toLowerCase();
      if(!kw) continue;
      let hit, early;
      if(kw.includes(' ')){ hit = lower.includes(' ' + kw); early = head.includes(' ' + kw); }
      else {
        const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b');
        hit = re.test(lower); early = re.test(head);
      }
      if(!hit) continue;
      sc += early ? 3 : (kw.includes(' ') ? 2 : 1);
    }
    if(sc > bestScore){ bestScore = sc; best = a.id; }
  }
  return best;
}

function parseText(text, includeMaybes){
  const seen = new Set();
  const out = [];
  for(const u of splitUnits(text)){
    const sc = scoreUnit(u);
    if(sc < 1) continue;
    if(sc < 3 && !includeMaybes) continue;
    const title = cleanTitle(u.text);
    if(!title || title.split(/\s+/).length < 2) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(seen.has(key)) continue;
    seen.add(key);
    const lower = u.text.toLowerCase();
    out.push({
      id: uid(), title,
      area: detectArea(title) || detectArea(u.text),
      due: detectDue(lower),
      priority: detectPriority(lower),
      source: u.text.trim().slice(0,160),
      confident: sc >= 3,
      score: sc,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * AI reading — Gemini through the shared Cloudflare Worker.
 * The worker holds the API key and only answers the published origin,
 * so this never runs from localhost. Any failure falls back to rules.
 * ------------------------------------------------------------------ */
/* A real parse measured 26-27s against gemini-3.6-flash, so 30s left almost
   no headroom and fell back to the rules parser on perfectly good calls. */
const AI_TIMEOUT_MS = 60000;
const AI_RETRY_IF_FASTER_THAN_MS = 30000;

function aiSystemPrompt(){
  const today = todayISO();
  const areas = S.role.areas
    .map(a => '  ' + a.id + ' = ' + a.name + (a.keywords ? '  (typical subjects: ' + a.keywords + ')' : ''))
    .join('\n');
  return [
    'You turn pasted workplace text into a task list for one person. You do not do the tasks.',
    '',
    'Today is ' + today + ', a ' + DOW_LONG[fromISO(today).getDay()] + '. Resolve every relative date against that.',
    '',
    'Return ONLY a JSON object of the form {"tasks": [ ... ]}. Each task has these keys:',
    '  title     short imperative instruction, under 120 characters, no trailing period,',
    '            no "please", no urgency words, no name of whoever asked',
    '  source    the exact sentence or line from the input that the task came from',
    '  area      one of the area ids below, or null if none clearly fits',
    '  due       "YYYY-MM-DD", or null when the text states no deadline',
    '  priority  "high", "normal" or "low"',
    '  note      a short detail worth keeping that does not belong in the title, else ""',
    '',
    'Area ids:',
    areas || '  (none configured)',
    '',
    'Rules:',
    '- Include only things that someone actually has to do. Skip greetings, sign-offs, thanks,',
    '  FYI statements, announcements, and status updates that ask for nothing.',
    '- Split a sentence that contains two separate actions into two tasks.',
    '- Never invent a task, a number, a deadline or a detail that is not in the text.',
    '- Keep names, counts, counties, file names and system names exactly as written.',
    '- A date only counts as a deadline when the text sets one. "since Thursday" and',
    '  "we met Monday" are references to the past, not due dates.',
    '- priority is "high" only for stated urgency (urgent, ASAP, critical, today),',
    '  and "low" for stated slack (no rush, low priority, whenever, nice to have).',
    '- If the text contains no tasks at all, return {"tasks": []}.',
  ].join('\n');
}

function stripFence(t){
  return String(t||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
}

async function aiParse(text){
  const endpoint = (S.ai.endpoint||'').trim();
  if(!endpoint) throw new Error('No endpoint set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let res;
  try{
    res = await fetch(endpoint, {
      method:'POST',
      headers:{'content-type':'application/json'},
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: aiSystemPrompt() }] },
        contents: [{ role:'user', parts:[{ text: String(text).slice(0, 60000) }] }],
        /* A task list is small: roughly 60 tokens per task, so even a long
           email lands well under 4096. Asking for 8192 only made the model
           slower without ever being used. */
        generationConfig: { responseMimeType:'application/json', maxOutputTokens: 4096 },
      }),
    });
  } catch(e){
    throw new Error(e.name === 'AbortError' ? 'the model took too long' : 'the request could not be sent');
  } finally { clearTimeout(timer); }

  if(!res.ok){
    let msg = 'HTTP ' + res.status;
    try{ const j = await res.json(); if(j?.error?.message) msg = j.error.message; }catch(e){}
    throw new Error(msg);
  }
  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if(!raw.trim()) throw new Error('the model returned nothing');
  let parsed;
  try{ parsed = JSON.parse(stripFence(raw)); }
  catch(e){ throw new Error('the model did not return usable JSON'); }

  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tasks) ? parsed.tasks : null);
  if(!list) throw new Error('the model did not return a task list');

  /* Everything below treats the model output as untrusted data: unknown
     areas, bad dates and stray keys are dropped rather than stored. */
  const ids = new Set(S.role.areas.map(a => a.id));
  const seen = new Set();
  const out = [];
  for(const r of list){
    if(!r || typeof r !== 'object') continue;
    let title = cleanTitle(String(r.title||'').replace(/\s+/g,' ').trim());
    if(!title || title.split(/\s+/).length < 2) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(seen.has(key)) continue;
    seen.add(key);
    const due = (typeof r.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due) && !isNaN(fromISO(r.due))) ? r.due : null;
    const priority = ['high','normal','low'].includes(r.priority) ? r.priority : 'normal';
    const area = (typeof r.area === 'string' && ids.has(r.area)) ? r.area : (detectArea(title) || null);
    out.push({
      id: uid(), title, area, due, priority,
      note: typeof r.note === 'string' ? r.note.slice(0,300) : '',
      source: typeof r.source === 'string' ? r.source.slice(0,200) : '',
      confident: true, score: 99, via: 'ai',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Past tense — so "Update the CRM" reads as "updated the CRM"
 * ------------------------------------------------------------------ */
const IRREGULAR = {
  build:'built', rebuild:'rebuilt', send:'sent', run:'ran', rerun:'re-ran', write:'wrote', rewrite:'rewrote',
  make:'made', go:'went', find:'found', get:'got', begin:'began', bring:'brought', buy:'bought', come:'came',
  do:'did', draw:'drew', drive:'drove', feel:'felt', hold:'held', keep:'kept', know:'knew', leave:'left',
  lose:'lost', meet:'met', pay:'paid', put:'put', read:'read', see:'saw', set:'set', sit:'sat', speak:'spoke',
  spend:'spent', stand:'stood', take:'took', teach:'taught', tell:'told', think:'thought', understand:'understood',
  win:'won', cut:'cut', let:'let', hit:'hit', split:'split', shut:'shut', cost:'cost', fit:'fit', deal:'dealt',
  troubleshoot:'troubleshot', rebuilt:'rebuilt', forward:'forwarded', hand:'handed', redo:'redid',
};
const PHRASAL = {
  'follow up':'followed up', 'set up':'set up', 'clean up':'cleaned up', 'reach out':'reached out',
  'sync up':'synced up', 'double check':'double-checked', 'cross check':'cross-checked', 'look into':'looked into',
  'look at':'looked at', 'look over':'looked over', 'go through':'went through', 'go over':'went over',
  'write up':'wrote up', 'check in':'checked in', 'fill out':'filled out', 'fill in':'filled in',
  'log in':'logged in', 'back up':'backed up', 'break down':'broke down', 'pull together':'pulled together',
  'put together':'put together', 'take care of':'took care of', 'tie out':'tied out', 'wrap up':'wrapped up',
  'carry over':'carried over', 'roll out':'rolled out', 'spin up':'spun up', 'stand up':'stood up',
  'walk through':'walked through', 'hand off':'handed off', 'sign off':'signed off', 'scope out':'scoped out',
};
function pastWord(w){
  const lw = w.toLowerCase();
  if(IRREGULAR[lw]) return IRREGULAR[lw];
  if(/ed$/.test(lw)) return lw;
  if(/e$/.test(lw)) return lw + 'd';
  if(/[^aeiou]y$/.test(lw)) return lw.slice(0,-1) + 'ied';
  if(/(?:[^aeiou][aeiou][bdgklmnprt])$/.test(lw) && lw.length <= 5) return lw + lw.slice(-1) + 'ed';
  return lw + 'ed';
}
function toPast(title){
  let t = String(title||'').trim();
  if(!t) return t;
  const words = t.split(/\s+/);
  const two = (words[0] + ' ' + (words[1]||'')).toLowerCase().replace(/[^a-z\s]/g,'');
  const three = (words.slice(0,3).join(' ')).toLowerCase().replace(/[^a-z\s]/g,'');
  if(PHRASAL[three]) return PHRASAL[three] + (words.length>3 ? ' ' + words.slice(3).join(' ') : '');
  if(PHRASAL[two])   return PHRASAL[two]   + (words.length>2 ? ' ' + words.slice(2).join(' ') : '');
  const first = words[0].toLowerCase().replace(/[^a-z-]/g,'');
  if(VERB_SET.has(first) || IRREGULAR[first]){
    let rest = words.length>1 ? ' ' + words.slice(1).join(' ') : '';
    // "pull the roll and screen it" -> "pulled the roll and screened it"
    rest = rest.replace(/\b(and|then)\s+([a-z]+)\b/, (mm, conj, v) => {
      const lv = v.toLowerCase();
      return (VERB_SET.has(lv) || IRREGULAR[lv]) ? conj + ' ' + pastWord(lv) : mm;
    });
    return pastWord(first) + rest;
  }
  // not verb-initial: leave as-is but lowercase the lead-in word if it is not a proper noun
  if(/^[A-Z][a-z]+$/.test(words[0]) && !/^[A-Z]{2,}/.test(words[0])) words[0] = words[0].toLowerCase();
  return 'worked on ' + words.join(' ');
}
function joinSemis(items){
  const a = items.filter(Boolean);
  if(a.length <= 1) return a[0] || '';
  return a.join('; ');   // titles keep their own case and commas, so semicolons read cleanest
}
function joinList(items){
  const a = items.filter(Boolean);
  if(a.length === 0) return '';
  if(a.length === 1) return a[0];
  if(a.length === 2) return a[0] + ' and ' + a[1];
  return a.slice(0,-1).join(', ') + ', and ' + a[a.length-1];
}

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
function el(tag, props={}, kids=[]){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(props)){
    if(k === 'class') n.className = v;
    else if(k === 'text') n.textContent = v;
    else if(k === 'html') n.innerHTML = v;
    else if(k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if(v === true) n.setAttribute(k,'');
    else if(v !== false && v != null) n.setAttribute(k, v);
  }
  for(const kid of [].concat(kids)) if(kid) n.appendChild(kid);
  return n;
}
async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    /* clipboard API needs a secure context and a user gesture; fall back */
    try{
      const ta = el('textarea',{});
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove(); return ok;
    }catch(e2){ return false; }
  }
}

/* One task as text worth pasting into a chat: what it is, where it sits, and
   the line it came from, which is usually the part that carries the detail. */
function taskText(t, withHeader){
  const lines = [];
  if(withHeader) lines.push('Task: ' + t.title); else lines.push(t.title);
  const a = areaById(t.area);
  if(a) lines.push('Area: ' + a.name);
  if(t.due) lines.push('Due: ' + prettyDate(t.due));
  if(t.priority && t.priority !== 'normal') lines.push('Priority: ' + t.priority);
  if(t.date) lines.push('Scheduled: ' + prettyDate(t.date));
  const st = t.done ? 'completed' : (t.status === 'active' ? 'in progress' : t.status);
  lines.push('Status: ' + st);
  if(t.note && t.note.trim()) lines.push('Note: ' + t.note.trim());
  if(t.source && t.source.trim() && t.source.trim().toLowerCase() !== t.title.toLowerCase()){
    lines.push('From the original message: "' + t.source.trim() + '"');
  }
  return lines.join('\n');
}
function tasksText(list, heading){
  const body = list.map(t => taskText(t, true)).join('\n\n');
  return heading ? heading + '\n\n' + body : body;
}

let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.hidden = true; }, 2600);
}
const areaById = id => S.role.areas.find(a => a.id === id) || null;
const areaName = id => (areaById(id)?.name) || 'Unassigned';

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if(!b) return;
  $$('.tab').forEach(t => t.classList.toggle('active', t === b));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + b.dataset.tab));
  if(b.dataset.tab === 'week') renderBoard();
  if(b.dataset.tab === 'eod') renderEod();
  if(b.dataset.tab === 'settings') renderSettings();
});

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */
let candidates = [];

function dayOptions(selectEl, withBacklog=true){
  const cur = selectEl.value;
  selectEl.innerHTML = '';
  if(withBacklog) selectEl.appendChild(el('option',{value:'',text:'Backlog (unscheduled)'}));
  for(const d of weekDates()){
    const dd = fromISO(d);
    selectEl.appendChild(el('option',{
      value:d,
      text: DOW_SHORT[dd.getDay()] + ' ' + shortDate(d) + (d === todayISO() ? ' · today' : ''),
    }));
  }
  selectEl.appendChild(el('option',{value:'__auto',text:'Auto-split across the week'}));
  if(cur) selectEl.value = cur;
}
function areaOptions(selectEl, selected){
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option',{value:'',text:'— area —'}));
  for(const a of S.role.areas) selectEl.appendChild(el('option',{value:a.id,text:a.name}));
  selectEl.value = selected || '';
}

function renderCandidates(){
  const wrap = $('#candidates');
  wrap.innerHTML = '';
  $('#candCount').textContent = candidates.length;
  $('#candidatesCard').hidden = candidates.length === 0;
  candidates.forEach(c => {
    const cb = el('input',{type:'checkbox'});
    cb.checked = c.selected;
    cb.addEventListener('change', () => { c.selected = cb.checked; });

    const titleIn = el('input',{type:'text',value:c.title});
    titleIn.addEventListener('input', () => { c.title = titleIn.value; });

    const areaSel = el('select',{});
    areaOptions(areaSel, c.area);
    areaSel.addEventListener('change', () => { c.area = areaSel.value || null; });

    const prioSel = el('select',{});
    [['high','High'],['normal','Normal'],['low','Low']].forEach(([v,t]) =>
      prioSel.appendChild(el('option',{value:v,text:t})));
    prioSel.value = c.priority;
    prioSel.addEventListener('change', () => { c.priority = prioSel.value; });

    const dueIn = el('input',{type:'date',value:c.due||''});
    dueIn.style.width = 'auto';
    dueIn.addEventListener('change', () => { c.due = dueIn.value || null; });

    const meta = el('div',{class:'cand-meta'},[
      areaSel, prioSel,
      el('span',{class:'tag',text:'due'}), dueIn,
    ]);
    const main = el('div',{class:'cand-main'},[
      titleIn, meta,
      c.source && c.source.toLowerCase() !== c.title.toLowerCase()
        ? el('div',{class:'src',text:'“' + c.source + '”'}) : null,
      c.note ? el('div',{class:'src',text:'note: ' + c.note}) : null,
    ]);
    wrap.appendChild(el('div',{class:'cand' + (c.confident ? '' : ' maybe')},[cb, main]));
  });
}

function runRules(text){
  return parseText(text, $('#includeMaybes').checked).map(c => ({...c, selected: c.confident, via:'rules'}));
}
function showCandidates(how){
  if(!candidates.length){
    $('#candidatesCard').hidden = true;
    toast(how === 'ai' ? 'The model found no action items in that text'
                       : 'No action items found. Try the low-confidence box.');
    return;
  }
  renderCandidates();
  const n = candidates.filter(c => c.selected).length;
  $('#addHint').textContent = n + ' of ' + candidates.length + ' pre-selected';
  dayOptions($('#candDay'));
}
$('#extractBtn').addEventListener('click', async () => {
  const text = $('#rawInput').value;
  if(!text.trim()){ toast('Nothing pasted yet'); return; }
  const btn = $('#extractBtn');
  const status = $('#parseStatus');

  if(!$('#useAI').checked){
    status.textContent = '';
    candidates = runRules(text);
    showCandidates('rules');
    return;
  }

  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Reading…';
  status.textContent = 'Sending the text to the model';
  /* The endpoint is reliable but not consistently fast: a first call that
     times out is usually followed by a quick one, so try twice before
     giving up on it and handing the text to the rules parser. */
  let got = null, lastErr = null;
  const started = Date.now();
  const tick = setInterval(() => {
    status.textContent = 'Reading with the model… ' + Math.round((Date.now() - started) / 1000) + 's';
  }, 1000);
  for(let attempt = 1; attempt <= 2 && !got; attempt++){
    const t0 = Date.now();
    try{
      if(!navigator.onLine) throw new Error('this device is offline');
      got = await aiParse(text);
    }catch(err){
      lastErr = err;
      /* A fast failure is usually the model being busy, and an immediate
         second call tends to work. A slow one has already spent the user's
         patience, so hand over to the rules parser instead of doubling it. */
      if(!navigator.onLine || Date.now() - t0 >= AI_RETRY_IF_FASTER_THAN_MS) break;
    }
  }
  clearInterval(tick);
  try{
    if(got){
      candidates = got.map(c => ({...c, selected: true}));
      status.textContent = 'Read by the model';
      showCandidates('ai');
    } else {
      candidates = runRules(text);
      status.textContent = 'AI reading failed (' + (lastErr ? lastErr.message : 'unknown') + '), used the built-in rules instead';
      toast('AI unavailable, fell back to the rules parser');
      showCandidates('rules');
    }
  }finally{
    btn.disabled = false; btn.textContent = label;
  }
});
$('#useAI').addEventListener('change', e => {
  S.ai.enabled = e.target.checked; save();
  $('#maybesWrap').hidden = e.target.checked;
  $('#parseStatus').textContent = '';
  const box = $('#aiEnabled'); if(box) box.checked = e.target.checked;
});
$('#clearRawBtn').addEventListener('click', () => {
  $('#rawInput').value = ''; candidates = []; $('#candidatesCard').hidden = true;
});
$('#selectAllBtn').addEventListener('click', () => { candidates.forEach(c=>c.selected=true); renderCandidates(); });
$('#selectNoneBtn').addEventListener('click', () => { candidates.forEach(c=>c.selected=false); renderCandidates(); });

$('#addSelectedBtn').addEventListener('click', () => {
  const picked = candidates.filter(c => c.selected && c.title.trim());
  if(!picked.length){ toast('Nothing selected'); return; }
  const target = $('#candDay').value;
  const added = picked.map(c => normTask({
    title: c.title.trim(), area: c.area, due: c.due, priority: c.priority, source: c.source, note: c.note || '',
    date: (target && target !== '__auto') ? target : null,
  }));
  S.tasks.push(...added);
  if(target === '__auto') autoSplit(added.map(t=>t.id));
  save();
  candidates = candidates.filter(c => !c.selected);
  renderCandidates();
  toast(added.length + ' task' + (added.length>1?'s':'') + ' added');
  renderBoard();
});

$('#manualAddBtn').addEventListener('click', () => {
  const title = $('#manualTitle').value.trim();
  if(!title){ toast('Type a task first'); return; }
  const d = $('#manualDay').value;
  S.tasks.push(normTask({
    title, area: $('#manualArea').value || detectArea(title),
    date: (d && d !== '__auto') ? d : null,
  }));
  save(); $('#manualTitle').value = '';
  toast('Added'); renderBoard();
});
$('#manualTitle').addEventListener('keydown', e => { if(e.key === 'Enter') $('#manualAddBtn').click(); });

/* ------------------------------------------------------------------ *
 * Week board
 * ------------------------------------------------------------------ */
const PRIO_RANK = { high:0, normal:1, low:2 };

function sortTasks(list){
  return list.slice().sort((a,b) =>
    (a.done?1:0) - (b.done?1:0) ||
    PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
    String(a.due||'9999').localeCompare(String(b.due||'9999')) ||
    String(a.createdAt).localeCompare(String(b.createdAt))
  );
}

function taskNode(t){
  const cb = el('input',{type:'checkbox'});
  cb.checked = t.done;
  cb.addEventListener('change', () => {
    t.done = cb.checked;
    if(t.done){ t.status = 'done'; t.doneAt = new Date().toISOString(); if(!t.date) t.date = todayISO(); }
    else { t.status = 'pending'; t.doneAt = null; }
    save(); renderBoard();
  });

  const title = el('div',{class:'t-title',contenteditable:'true',text:t.title});
  title.addEventListener('blur', () => {
    const v = title.textContent.trim();
    if(v && v !== t.title){ t.title = v; save(); }
    else if(!v){ title.textContent = t.title; }
  });
  title.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); title.blur(); } });

  const tags = el('div',{class:'t-tags'});
  if(t.area) tags.appendChild(el('span',{class:'tag area',text: shortArea(t.area)}));
  if(t.priority !== 'normal') tags.appendChild(el('span',{class:'tag p-'+t.priority,text:t.priority}));
  if(t.due){
    const late = !t.done && t.due < todayISO();
    tags.appendChild(el('span',{class:'tag due' + (late?' late':''),text:'due ' + shortDate(t.due)}));
  }
  if(!t.done){
    const cycle = ['pending','active','proposed'];
    const label = { pending:'pending', active:'in progress', proposed:'proposed' };
    const st = el('span',{class:'tag btn-tag st-'+t.status, text: label[t.status] || 'pending'});
    st.addEventListener('click', () => {
      const i = cycle.indexOf(t.status);
      t.status = cycle[(i+1) % cycle.length];
      save(); renderBoard();
    });
    tags.appendChild(st);
  }

  // day picker: drag-and-drop does not exist on touch, so every task carries one
  const mv = el('select',{class:'tag mv',title:'Move to another day'});
  mv.appendChild(el('option',{value:'',text:'backlog'}));
  const wd = weekDates();
  for(const d of wd) mv.appendChild(el('option',{value:d,text:DOW_SHORT[fromISO(d).getDay()].toLowerCase()}));
  if(t.date && !wd.includes(t.date)) mv.appendChild(el('option',{value:t.date,text:shortDate(t.date)}));
  mv.value = t.date || '';
  mv.addEventListener('change', () => { t.date = mv.value || null; save(); renderBoard(); });
  mv.addEventListener('pointerdown', e => e.stopPropagation());
  tags.appendChild(mv);

  const cp = el('span',{class:'tag btn-tag',title:'Copy this task, ready to paste into a chat',text:'copy'});
  cp.addEventListener('click', async () => {
    const ok = await copyToClipboard(taskText(t, false));
    toast(ok ? 'Task copied' : 'Could not reach the clipboard');
  });
  tags.appendChild(cp);

  const x = el('button',{class:'t-x',title:'Delete',text:'×'});
  x.addEventListener('click', () => {
    S.tasks = S.tasks.filter(o => o.id !== t.id); save(); renderBoard();
  });

  const node = el('div',{class:'task' + (t.done?' done':''),draggable:'true','data-id':t.id},[
    cb, el('div',{class:'t-main'},[title, tags]), x
  ]);
  node.addEventListener('dragstart', e => {
    if(e.target.closest('select,input,[contenteditable="true"]')){ e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => node.classList.remove('dragging'));
  return node;
}
function shortArea(id){
  const a = areaById(id); if(!a) return '';
  return a.name.length <= 34 ? a.name : a.name.slice(0,32).trimEnd() + '…';
}

function wireDrop(zone){
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain');
    const t = S.tasks.find(o => o.id === id); if(!t) return;
    t.date = zone.dataset.date || null;
    save(); renderBoard();
  });
}

function renderBoard(){
  const board = $('#board');
  board.innerHTML = '';
  const dates = weekDates();
  const today = todayISO();
  $('#weekLabel').textContent = shortDate(dates[0]) + ' – ' + shortDate(dates[4]) + ', ' + fromISO(dates[0]).getFullYear();

  for(const d of dates){
    const dd = fromISO(d);
    const mine = sortTasks(S.tasks.filter(t => t.date === d));
    const openCount = mine.filter(t => !t.done).length;
    const body = el('div',{class:'col-body dropzone','data-date':d});
    mine.forEach(t => body.appendChild(taskNode(t)));
    wireDrop(body);
    const copyDay = el('button',{class:'col-copy',title:'Copy this day\u2019s tasks',text:'copy'});
    copyDay.addEventListener('click', async () => {
      if(!mine.length){ toast('Nothing on that day'); return; }
      const ok = await copyToClipboard(tasksText(mine, 'Tasks for ' + prettyDate(d) + ':'));
      toast(ok ? mine.length + ' task' + (mine.length>1?'s':'') + ' copied' : 'Could not reach the clipboard');
    });
    const col = el('div',{class:'col' + (d===today?' today':'') + (d<today?' past':'')},[
      el('div',{class:'col-head'},[
        el('div',{},[
          el('div',{class:'dow',text:DOW_SHORT[dd.getDay()]}),
          el('div',{class:'dnum',text:shortDate(d)}),
        ]),
        el('div',{class:'col-head-right'},[
          el('span',{class:'load',text: mine.length ? (mine.length - openCount) + '/' + mine.length : '—'}),
          copyDay,
        ]),
      ]),
      body,
    ]);
    board.appendChild(col);
  }

  const back = $('#backlog');
  back.innerHTML = '';
  const bl = sortTasks(S.tasks.filter(t => !t.date && !t.done));
  bl.forEach(t => back.appendChild(taskNode(t)));
  wireDrop(back);
  $('#backlogCount').textContent = bl.length;

  const weekTasks = S.tasks.filter(t => dates.includes(t.date));
  const doneN = weekTasks.filter(t => t.done).length;
  const late = S.tasks.filter(t => !t.done && t.due && t.due < today).length;
  $('#weekStats').textContent = doneN + ' of ' + weekTasks.length + ' done this week'
    + (late ? ' · ' + late + ' past due' : '');
  dayOptions($('#candDay')); dayOptions($('#manualDay'));
}

$('#prevWeek').addEventListener('click', () => { S.weekStart = addDays(S.weekStart,-7); save(); renderBoard(); });
$('#nextWeek').addEventListener('click', () => { S.weekStart = addDays(S.weekStart, 7); save(); renderBoard(); });
$('#thisWeek').addEventListener('click', () => { S.weekStart = weekStartOf(todayISO(), S.weekStartDow); save(); renderBoard(); });

function autoSplit(onlyIds){
  const dates = weekDates();
  const today = todayISO();
  const startIdx = Math.max(0, dates.findIndex(d => d >= today));
  const open = dates.slice(startIdx === -1 ? 0 : startIdx);
  const targets = open.length ? open : dates;
  const load = {}; targets.forEach(d => load[d] = S.tasks.filter(t => t.date === d && !t.done).length);

  let pool = S.tasks.filter(t => !t.date && !t.done);
  if(onlyIds) pool = pool.filter(t => onlyIds.includes(t.id));
  pool = pool.sort((a,b) =>
    PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
    String(a.due||'9999').localeCompare(String(b.due||'9999')));

  const cap = Math.max(1, Number(S.capacity) || 6);
  for(const t of pool){
    // never schedule past the due date when the due date is inside this week
    let allowed = targets.filter(d => !t.due || d <= t.due || t.due < targets[0]);
    if(!allowed.length) allowed = targets;
    const under = allowed.filter(d => load[d] < cap);
    const pool2 = under.length ? under : allowed;
    const pick = pool2.reduce((a,b) => load[a] <= load[b] ? a : b);
    t.date = pick; load[pick]++;
  }
  save();
}
$('#autoSplitBtn').addEventListener('click', () => {
  const before = S.tasks.filter(t => !t.date && !t.done).length;
  if(!before){ toast('Backlog is empty'); return; }
  autoSplit(null); renderBoard();
  toast('Spread ' + before + ' task' + (before>1?'s':'') + ' across the week');
});
$('#rolloverBtn').addEventListener('click', () => {
  const today = todayISO();
  const moved = S.tasks.filter(t => !t.done && t.date && t.date < today);
  if(!moved.length){ toast('Nothing unfinished behind today'); return; }
  moved.forEach(t => { t.date = today; });
  save(); renderBoard();
  toast(moved.length + ' moved to today');
});

/* ------------------------------------------------------------------ *
 * EOD report
 * ------------------------------------------------------------------ */
function metricsFor(d){ return S.metrics[d] || (S.metrics[d] = {}); }
function notesFor(d){ return S.notes[d] || (S.notes[d] = {blockers:'',proposals:''}); }

function renderEod(){
  const dEl = $('#eodDate');
  if(!dEl.value) dEl.value = todayISO();
  const d = dEl.value;

  const grid = $('#metricsGrid');
  grid.innerHTML = '';
  const m = metricsFor(d);
  for(const def of DEFAULT_METRICS){
    const inp = el('input',{type:'number',min:'0',step:'1',value: m[def.id] != null ? m[def.id] : ''});
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      if(v === '') delete m[def.id]; else m[def.id] = Number(v);
      save();
    });
    grid.appendChild(el('div',{class:'metric'},[el('span',{text:def.label}), inp]));
  }

  // objectives chip row, built from the role vocabulary
  let objWrap = $('#objWrap');
  if(!objWrap){
    objWrap = el('div',{class:'field',id:'objWrap'},[
      el('span',{text:'Objectives this day served (optional, nothing is assumed)'}),
      el('div',{class:'row gap wrap',id:'objRow'}),
    ]);
    $('#eodBlockers').closest('.field').before(objWrap);
  }
  const objRow = $('#objRow');
  objRow.innerHTML = '';
  const chosen = new Set((notesFor(d).objectives || []));
  for(const o of String(S.role.objectives||'').split(',').map(s=>s.trim()).filter(Boolean)){
    const cb = el('input',{type:'checkbox'});
    cb.checked = chosen.has(o);
    cb.addEventListener('change', () => {
      const n = notesFor(d);
      const set = new Set(n.objectives || []);
      cb.checked ? set.add(o) : set.delete(o);
      n.objectives = Array.from(set); save();
    });
    objRow.appendChild(el('label',{class:'check inline'},[cb, el('span',{text:o})]));
  }

  const n = notesFor(d);
  $('#eodBlockers').value = n.blockers || '';
  $('#eodProposals').value = n.proposals || '';
}
$('#eodDate').addEventListener('change', renderEod);
$('#eodBlockers').addEventListener('input', e => { notesFor($('#eodDate').value).blockers = e.target.value; save(); });
$('#eodProposals').addEventListener('input', e => { notesFor($('#eodDate').value).proposals = e.target.value; save(); });

function doneOn(d){
  return S.tasks.filter(t => t.done && (t.doneAt ? tzISO(new Date(t.doneAt)) === d : t.date === d));
}
function groupByArea(list){
  const map = new Map();
  for(const a of S.role.areas) map.set(a.id, []);
  map.set('__none', []);
  for(const t of list) (map.get(t.area) || map.get('__none')).push(t);
  return map;
}
function sentenceFromTasks(list, lead){
  const phrases = list.map(t => toPast(t.title));
  const body = joinList(phrases);
  if(!body) return '';
  let s = lead ? lead + ' ' + body : 'Completed ' + body;
  if(!/[.!?]$/.test(s)) s += '.';
  const notes = list.map(t => t.note && t.note.trim()).filter(Boolean);
  if(notes.length) s += ' ' + notes.map(x => /[.!?]$/.test(x) ? x : x + '.').join(' ');
  return s;
}

function buildEod(){
  const d = $('#eodDate').value || todayISO();
  const useLeads = $('#eodHeadings').checked;
  const summaryOnly = $('#eodSummaryOnly').checked;
  const role = S.role;
  const out = [];

  if(!summaryOnly){
    out.push('EOD Report — ' + prettyDate(d));
    out.push(role.title + (role.org ? ', ' + role.org : ''));
    out.push('');
  }

  /* completed */
  const completed = doneOn(d);
  if(completed.length){
    const grouped = groupByArea(completed);
    const paras = [];
    if(useLeads){
      for(const a of role.areas){
        const list = grouped.get(a.id) || [];
        if(list.length) paras.push(sentenceFromTasks(list, a.lead || ('On ' + a.name.toLowerCase() + ', I')));
      }
      const rest = grouped.get('__none') || [];
      if(rest.length) paras.push(sentenceFromTasks(rest, 'Outside the main areas, I'));
    } else {
      paras.push(sentenceFromTasks(completed, 'Today I'));
    }
    out.push(paras.join('\n\n'));
  } else {
    out.push('No tasks were closed out today.');
  }

  /* Summary only stops here: just the prose, nothing appended. Everything
     below is the full report's extra sections. */
  if(summaryOnly) return out.join('\n').trim();

  /* metrics */
  const m = metricsFor(d);
  const mparts = DEFAULT_METRICS
    .filter(def => Number(m[def.id]) > 0)
    .map(def => m[def.id] + ' ' + lowerFirst(def.label));
  if(mparts.length){
    out.push('');
    out.push('Output recorded for the day: ' + joinList(mparts) + '.');
  }

  /* objectives */
  const objs = (notesFor(d).objectives || []).filter(Boolean);
  if(objs.length && completed.length){
    out.push('');
    out.push('This work supported ' + joinList(objs) + '.');
  }

  /* ongoing */
  const ongoing = S.tasks.filter(t => !t.done && t.status === 'active');
  if(ongoing.length){
    out.push('');
    out.push('Ongoing. Still in progress: ' + joinSemis(ongoing.map(t => t.title)) + '.');
  }

  /* proposed */
  const proposedTasks = S.tasks.filter(t => !t.done && t.status === 'proposed');
  const proposedText = String(notesFor(d).proposals || '')
    .split('\n').map(s => s.trim()).filter(Boolean);
  if(proposedTasks.length || proposedText.length){
    out.push('');
    const bits = proposedTasks.map(t => t.title).concat(proposedText);
    out.push('Proposed improvements, raised but not yet started: ' + joinSemis(bits) + '.');
  }

  /* pending */
  const pending = S.tasks.filter(t => !t.done && t.status === 'pending' && t.date && t.date <= d);
  const upcoming = S.tasks.filter(t => !t.done && t.status === 'pending' && t.date && t.date > d);
  if(pending.length || upcoming.length){
    out.push('');
    const seg = [];
    if(pending.length) seg.push('Carrying forward: ' + joinSemis(pending.map(t => t.title)) + '.');
    if(upcoming.length){
      const nd = upcoming.map(t=>t.date).sort()[0];
      const nextSet = upcoming.filter(t => t.date === nd);
      seg.push('Scheduled for ' + prettyDate(nd).split(',')[0] + ': ' +
        joinSemis(nextSet.map(t => t.title)) + '.');
    }
    out.push('Pending. ' + seg.join(' '));
  }

  /* blockers */
  const bl = String(notesFor(d).blockers || '').trim();
  if(bl){ out.push(''); out.push('Blockers. ' + (/[.!?]$/.test(bl) ? bl : bl + '.')); }

  return out.join('\n');
}
function lowerFirst(s){
  s = String(s||'').trim().replace(/[.;,]+$/,'');
  if(!s) return s;
  if(/^[A-Z]{2,}/.test(s)) return s;              // keep acronyms like CRM, CAD
  return s[0].toLowerCase() + s.slice(1);
}

let lastGenerated = '';
function putReport(){
  const box = $('#eodOut');
  const report = buildEod();
  const cur = box.value;
  let kept = '';
  if(cur.trim()){
    /* strip the previous generated block, keep whatever the user wrote */
    kept = (lastGenerated && cur.includes(lastGenerated) ? cur.replace(lastGenerated, '') : cur).trim();
  }
  box.value = kept ? kept + '\n\n' + report : report;
  lastGenerated = report;
  return box.value;
}
$('#genEodBtn').addEventListener('click', () => { putReport(); toast('Report generated'); });
$('#eodSummaryOnly').addEventListener('change', () => { if($('#eodOut').value) putReport(); });
$('#copyEodBtn').addEventListener('click', async () => {
  const v = $('#eodOut').value || putReport();
  const ok = await copyToClipboard(v);
  if(ok) toast('Copied'); else { $('#eodOut').select(); toast('Press Cmd+C to copy'); }
});
$('#eodHeadings').addEventListener('change', () => { if($('#eodOut').value) putReport(); });

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */
function renderSettings(){
  $('#roleTitle').value = S.role.title || '';
  $('#roleOrg').value = S.role.org || '';
  $('#roleObjectives').value = S.role.objectives || '';
  $('#capacity').value = S.capacity;
  $('#weekStartDow').value = String(S.weekStartDow);
  $('#tzSelect').value = S.tz || 'America/Chicago';
  $('#aiEnabled').checked = !!S.ai.enabled;
  $('#aiEndpoint').value = S.ai.endpoint || '';

  const list = $('#areaList');
  list.innerHTML = '';
  S.role.areas.forEach((a, i) => {
    const nameIn = el('input',{type:'text',value:a.name,placeholder:'Area name'});
    nameIn.addEventListener('input', () => { a.name = nameIn.value; save(); refreshChrome(); });
    const leadIn = el('input',{type:'text',value:a.lead||'',placeholder:'Paragraph lead-in, e.g. "On CRM infrastructure, I"'});
    leadIn.addEventListener('input', () => { a.lead = leadIn.value; save(); });
    const kwIn = el('input',{type:'text',value:a.keywords||'',placeholder:'comma,separated,keywords'});
    kwIn.addEventListener('input', () => { a.keywords = kwIn.value; save(); });
    const up = el('button',{class:'btn ghost sm',text:'↑',title:'Move up'});
    up.addEventListener('click', () => { if(i>0){ const [x]=S.role.areas.splice(i,1); S.role.areas.splice(i-1,0,x); save(); renderSettings(); } });
    const del = el('button',{class:'btn ghost sm danger',text:'Remove'});
    del.addEventListener('click', () => {
      if(!confirm('Remove "' + a.name + '"? Tasks keep the tag but it will show as unassigned.')) return;
      S.role.areas.splice(i,1); save(); renderSettings(); refreshChrome();
    });
    list.appendChild(el('div',{class:'area'},[
      el('div',{class:'row gap'},[nameIn, up, del]),
      leadIn, kwIn,
    ]));
  });
}
$('#roleTitle').addEventListener('input', e => { S.role.title = e.target.value; save(); refreshChrome(); });
$('#roleOrg').addEventListener('input', e => { S.role.org = e.target.value; save(); refreshChrome(); });
$('#roleObjectives').addEventListener('input', e => { S.role.objectives = e.target.value; save(); });
$('#capacity').addEventListener('input', e => { S.capacity = Math.max(1, Number(e.target.value)||6); save(); });
$('#tzSelect').addEventListener('change', e => {
  S.tz = e.target.value;
  S.weekStart = weekStartOf(todayISO(), S.weekStartDow);
  save(); refreshChrome(); renderBoard(); renderEod();
  toast('Dates now read in ' + tzLabel());
});
$('#weekStartDow').addEventListener('change', e => {
  S.weekStartDow = Number(e.target.value);
  S.weekStart = weekStartOf(todayISO(), S.weekStartDow);
  save(); renderBoard();
});
$('#aiEnabled').addEventListener('change', e => {
  S.ai.enabled = e.target.checked; save();
  $('#useAI').checked = e.target.checked;
  $('#maybesWrap').hidden = e.target.checked;
});
$('#aiEndpoint').addEventListener('input', e => { S.ai.endpoint = e.target.value.trim(); save(); });
$('#aiTestBtn').addEventListener('click', async () => {
  const out = $('#aiTestOut');
  out.textContent = 'Testing…';
  try{
    const got = await aiParse('Action items: please pull the Nueces delinquent roll by Friday, and fix the broken DIBS export.');
    out.textContent = got.length
      ? 'Working. The model read ' + got.length + ' task' + (got.length>1?'s':'') + ' from the test text.'
      : 'Reached the model, but it found no tasks in the test text.';
  }catch(err){
    out.textContent = 'Not working: ' + err.message + '. Pasting still works, it just uses the built-in rules.';
  }
});
$('#addAreaBtn').addEventListener('click', () => {
  S.role.areas.push({id:uid(),name:'New area',lead:'On this area, I',keywords:''});
  save(); renderSettings();
});

/* data */
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a = el('a',{href:URL.createObjectURL(blob),download:'fiveday-' + todayISO() + '.json'});
  document.body.appendChild(a); a.click(); a.remove(); toast('Exported');
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if(!f) return;
  try{
    const data = JSON.parse(await f.text());
    if(!data || typeof data !== 'object') throw new Error('bad shape');
    if(!confirm('Replace everything in this browser with the file contents?')) return;
    localStorage.setItem(STORE, JSON.stringify(data));
    S = load(); refreshChrome(); renderBoard(); renderSettings(); renderEod();
    toast('Imported');
  }catch(err){ toast('That file could not be read'); }
  e.target.value = '';
});
$('#clearDoneBtn').addEventListener('click', () => {
  const cut = addDays(todayISO(), -30);
  const before = S.tasks.length;
  S.tasks = S.tasks.filter(t => !(t.done && t.doneAt && tzISO(new Date(t.doneAt)) < cut));
  save(); renderBoard();
  toast((before - S.tasks.length) + ' removed');
});
$('#wipeBtn').addEventListener('click', () => {
  if(!confirm('Erase all tasks, numbers, and notes in this browser? This cannot be undone.')) return;
  localStorage.removeItem(STORE); S = fresh(); save();
  refreshChrome(); renderBoard(); renderSettings(); renderEod();
  toast('Erased');
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
function refreshChrome(){
  $('#roleChip').textContent = S.role.title + (S.role.org ? ' · ' + S.role.org : '');
  const d = fromISO(todayISO());
  $('#todayChip').textContent = DOW_SHORT[d.getDay()] + ' ' + shortDate(todayISO()) + ' · ' + tzLabel();
  areaOptions($('#manualArea'), '');
}
function init(){
  if(!S.weekStart) S.weekStart = weekStartOf(todayISO(), S.weekStartDow);
  // keep the board on the current week when the app is reopened later
  const cur = weekStartOf(todayISO(), S.weekStartDow);
  if(S.weekStart < cur) S.weekStart = cur;
  refreshChrome();
  $('#useAI').checked = !!S.ai.enabled;
  $('#maybesWrap').hidden = !!S.ai.enabled;
  dayOptions($('#candDay')); dayOptions($('#manualDay'));
  renderBoard(); renderEod(); renderSettings();
  save();
}
init();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
