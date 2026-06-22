export const maxDuration = 300;
export const runtime = "nodejs";

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

const anthropic = new Anthropic();

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Hotels: ["hotel", "meridien", "hilton", "marriott", "hyatt", "intercontinental", "sheraton", "radisson", "novotel", "ibis", "premier inn", "travelodge", "holiday inn", "courtyard", "fairfield", "residence inn", "hampton", "doubletree", "westin", "st regis", "ritz", "four seasons", "sofitel", "accor", "inn", "lodge", "suites", "hostel", "motel", "airbnb", "aloft", "rove", "first collection", "delta hotels", "four points", "cheval maison"],
  Restaurants: ["restaurant", "cafe", "coffee", "starbucks", "mcdonalds", "mcdonald", "kfc", "pizza", "burger", "nandos", "nando", "greggs", "costa", "pret", "subway", "dominos", "grill", "kitchen", "diner", "bistro", "bakery", "food", "eat", "dining", "sushi", "thai", "chinese", "indian", "kebab", "shawarma", "biryani", "brasserie", "albaik", "leto", "fendi cafe", "bosnian house", "allo beirut", "patisserie"],
  Shopping: ["zara", "h&m", "primark", "amazon", "shop", "store", "mall", "retail", "market", "tesco", "sainsbury", "asda", "lidl", "aldi", "waitrose", "boots", "superdrug", "tk maxx", "next", "marks", "selfridges", "harrods", "john lewis", "argos", "ikea", "uniqlo", "nike", "adidas", "outlet", "bazaar", "carrefour", "spinneys", "mumuso", "faces", "pierre cardin", "parfums", "christian dior", "bath & body", "supermark", "al mana", "byond"],
  Subscriptions: ["netflix", "spotify", "apple", "google", "microsoft", "adobe", "openai", "chatgpt", "subscription", "monthly", "annual", "prime", "youtube", "disney", "hulu", "hbo", "paramount", "icloud", "dropbox", "notion", "slack", "zoom", "canva", "figma", "github", "membership", "twilio", "cursor"],
  Transport: ["uber", "ubr*", "taxi", "lyft", "cab", "bolt", "careem", "grab", "transport", "airline", "flight", "airways", "emirates", "pia", "british airways", "ryanair", "easyjet", "train", "railway", "metro", "bus", "tube", "oyster", "tfl", "parking", "fuel", "petrol", "gas station", "shell", "bp", "total", "rta", "cars taxi"],
  Telecom: ["etisalat", "du telecom", "vodafone", "o2", "ee", "three", "virgin media", "bt ", "sky "],
  "Service Fees": ["assets service fee", "accrual_checkout", "service fee", "conversion fee", "transfer fee", "wise charges"],
};

function categorize(description: string): string {
  const lower = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return "Other";
}

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  "United Kingdom": ["london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool", "bristol", "cardiff", "oxford", "cambridge", "uk", "britain", "england", "scotland", "wales", "southall"],
  "Germany": ["frankfurt", "berlin", "munich", "hamburg", "cologne", "dusseldorf", "düsseldorf", "duesseldorf", "stuttgart", "germany", "deutsche", "gmbh"],
  "France": ["paris", "lyon", "marseille", "nice", "france", "french"],
  "UAE": ["dubai", "abu dhabi", "sharjah", "uae", "ajman"],
  "Pakistan": ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "peshawar", "pakistan", "pk", "pkr"],
  "USA": ["new york", "los angeles", "chicago", "houston", "phoenix", "san francisco", "seattle", "boston", "miami", "las vegas", "usa", "united states", "america"],
  "Turkey": ["istanbul", "ankara", "antalya", "turkey", "turkish"],
  "Spain": ["madrid", "barcelona", "seville", "spain", "spanish"],
  "Italy": ["rome", "milan", "florence", "venice", "naples", "italy", "italian"],
  "Netherlands": ["amsterdam", "rotterdam", "hague", "netherlands", "dutch"],
  "Belgium": ["brussels", "antwerp", "belgium", "belgian"],
  "Switzerland": ["zurich", "geneva", "bern", "switzerland", "swiss"],
  "Saudi Arabia": ["riyadh", "jeddah", "mecca", "medina", "saudi", "ksa"],
  "Qatar": ["doha", "qatar"],
  "China": ["beijing", "shanghai", "guangzhou", "shenzhen", "china", "chinese"],
  "New Zealand": ["auckland", "wellington", "christchurch", "new zealand"],
};

function detectCountry(description: string): string {
  const lower = description.toLowerCase();
  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return country;
  }
  return "Unknown";
}

type Transaction = {
  date: string;
  month: string;
  merchant: string;
  amount: number;
  currency: string;
  baseAmount?: number;
  baseCurrency?: string;
  category: string;
  country: string;
  description: string;
  type: "expense" | "income" | "fee";
};

const MONTH_NAMES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12"
};

const MONTH_PATTERN = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

function extractDate(text: string): { date: string; month: string } | null {
  const dm = text.match(new RegExp(`(\\d{1,2})\\s*(${MONTH_PATTERN})\\s*(\\d{4})`, "i"));
  if (!dm) return null;
  const day = dm[1].padStart(2, "0");
  const mon = MONTH_NAMES[dm[2].toLowerCase()] || "01";
  return { date: `${day}-${mon}-${dm[3]}`, month: `${dm[2]} ${dm[3]}` };
}

function parseWiseStatement(text: string, _fileName: string): Transaction[] {
  const statCur = (text.match(/(EUR|GBP|USD|PKR)\s+statement/i)?.[1] || "GBP").toUpperCase();

  const MP = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

  function pd(day: string, mon: string, yr: string) {
    return { date: `${day.padStart(2,"0")}-${MONTH_NAMES[mon.toLowerCase()]||"01"}-${yr}`, month: `${mon} ${yr}` };
  }

  // Key insight from pdf-parse output:
  // After "| Asset 1\n" the next line is: -AMOUNT BALANCE  (concatenated, e.g. "-7.5121119.16")
  // Use (-?[\d,]+\.\d{2}) to grab exactly 2 decimal places = just the amount, not the balance.

  const transactions: Transaction[] = [];
  let m: RegExpExecArray | null;

  // 1. Card transactions — also capture actual base currency amount from "| Asset 1\n-X.XX"
  const cardRx = new RegExp(
    `Card transaction of ([\\d,]+\\.?\\d*) (\\w{3}) issued by ([\\s\\S]+?)(\\d{1,2})\\s+(${MP})\\s+(\\d{4})Card ending[\\s\\S]*?\\| Asset 1\\s*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = cardRx.exec(text)) !== null) {
    const amount = parseFloat(m[1].replace(/,/g, ""));
    const currency = m[2].toUpperCase();
    const baseRaw = parseFloat(m[7].replace(/,/g, ""));
    const baseAmount = Math.abs(baseRaw);
    const isIncoming = baseRaw >= 0;
    const merchant = m[3]
      .replace(/\s*\(fee:[^)]*\)/g, "")
      .replace(/\n/g, " ").replace(/\s+/g, " ").trim().substring(0, 80);
    const { date, month } = pd(m[4], m[5], m[6]);
    transactions.push({
      date, month, merchant, amount, currency,
      baseAmount, baseCurrency: statCur,
      category: categorize(merchant), country: detectCountry(merchant),
      description: `Card transaction of ${amount} ${currency} - ${merchant}`,
      type: isIncoming ? "income" : "expense",
    });
  }

  // 2. Wise Charges — fee on same line as FEE-CARD-XXX\n-X.XX BALANCE
  const wiseRx = new RegExp(
    `Wise Charges for: CARD-\\d+\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})Card ending[\\s\\S]*?FEE-CARD-\\d+\\s*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = wiseRx.exec(text)) !== null) {
    const fee = Math.abs(parseFloat(m[4].replace(/,/g, "")));
    if (fee > 0) {
      const { date, month } = pd(m[1], m[2], m[3]);
      transactions.push({
        date, month, merchant: "Wise Card Fee",
        amount: fee, currency: statCur,
        baseAmount: fee, baseCurrency: statCur,
        category: "Service Fees", country: "United Kingdom",
        description: "Wise card transaction fee", type: "fee",
      });
    }
  }

  // 3a. Assets service fee WITH "| Asset 1" line — boundary: don't cross "Card transaction of"
  const assetRx = new RegExp(
    `(\\w{3}) Assets service fee\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})((?:(?!Card transaction of)[\\s\\S])*?)\\| Asset 1\\s*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  const seenAssetFees = new Set<string>();
  while ((m = assetRx.exec(text)) !== null) {
    const feeCur = m[1].toUpperCase();
    const fee = Math.abs(parseFloat(m[6].replace(/,/g, "")));
    if (fee > 0) {
      const { date, month } = pd(m[2], m[3], m[4]);
      const key = `${date}|${feeCur}|${fee}`;
      if (!seenAssetFees.has(key)) {
        seenAssetFees.add(key);
        transactions.push({
          date, month, merchant: `${feeCur} Assets Service Fee`,
          amount: fee, currency: feeCur,
          baseAmount: fee, baseCurrency: statCur,
          category: "Service Fees", country: "United Kingdom",
          description: `${feeCur} Assets service fee`, type: "fee",
        });
      }
    }
  }

  // 3b. Assets service fee WITHOUT "| Asset 1" — amount directly after ACCRUAL_CHECKOUT line
  // Format: "CUR Assets service fee\nDD Month YYYYTransaction: ACCRUAL_CHECKOUT-...\n-X.XXBALANCE"
  const assetNoAssetRx = new RegExp(
    `(\\w{3}) Assets service fee\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})Transaction: ACCRUAL_CHECKOUT[^\\n]*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = assetNoAssetRx.exec(text)) !== null) {
    const feeCur = m[1].toUpperCase();
    const fee = Math.abs(parseFloat(m[5].replace(/,/g, "")));
    if (fee > 0) {
      const { date, month } = pd(m[2], m[3], m[4]);
      const key = `${date}|${feeCur}|${fee}`;
      if (!seenAssetFees.has(key)) {
        seenAssetFees.add(key);
        transactions.push({
          date, month, merchant: `${feeCur} Assets Service Fee`,
          amount: fee, currency: feeCur,
          baseAmount: fee, baseCurrency: statCur,
          category: "Service Fees", country: "United Kingdom",
          description: `${feeCur} Assets service fee`, type: "fee",
        });
      }
    }
  }

  // 4. Received money
  const receivedRx = new RegExp(
    `Received money from ([^\\n]+?)\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})[\\s\\S]*?\\| Asset 1\\s*\\n([\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = receivedRx.exec(text)) !== null) {
    const sender = m[1].trim().replace(/\n/g, " ").substring(0, 80);
    const amount = parseFloat(m[5].replace(/,/g, ""));
    if (amount > 0) {
      const { date, month } = pd(m[2], m[3], m[4]);
      transactions.push({
        date, month, merchant: `Received from ${sender}`,
        amount, currency: statCur,
        baseAmount: amount, baseCurrency: statCur,
        category: "Transfer", country: "Unknown",
        description: `Received money from ${sender}`, type: "income",
      });
    }
  }

  // 5. Sent money (transfers out)
  const sentRx = new RegExp(
    `Sent money to ([^\\n]+?)\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})[\\s\\S]*?\\| Asset 1\\s*\\n(-[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = sentRx.exec(text)) !== null) {
    const recipient = m[1].trim()
      .replace(/\s*\(fee:[^)]*\)/g, "")
      .replace(/\n/g, " ").substring(0, 80);
    const amount = Math.abs(parseFloat(m[5].replace(/,/g, "")));
    if (amount > 0) {
      const { date, month } = pd(m[2], m[3], m[4]);
      transactions.push({
        date, month, merchant: `Transfer to ${recipient}`,
        amount, currency: statCur,
        baseAmount: amount, baseCurrency: statCur,
        category: "Transfer", country: "Unknown",
        description: `Sent money to ${recipient}`, type: "expense",
      });
    }
  }

  // 6. Wise Card Acquisition (new card fee)
  const acqRx = new RegExp(
    `Wise Card Acquisition\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})[\\s\\S]*?\\| Asset 1\\s*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = acqRx.exec(text)) !== null) {
    const fee = Math.abs(parseFloat(m[4].replace(/,/g, "")));
    if (fee > 0) {
      const { date, month } = pd(m[1], m[2], m[3]);
      transactions.push({
        date, month, merchant: "Wise Card Acquisition",
        amount: fee, currency: statCur,
        baseAmount: fee, baseCurrency: statCur,
        category: "Service Fees", country: "United Kingdom",
        description: "Wise card acquisition fee", type: "fee",
      });
    }
  }

  // 7. Transfer fees (Wise Charges for: TRANSFER-XXXX)
  const transFeeRx = new RegExp(
    `Wise Charges for: TRANSFER-\\d+\\s*(\\d{1,2})\\s+(${MP})\\s+(\\d{4})[\\s\\S]*?FEE-TRANSFER-\\d+\\s*\\n(-?[\\d,]+\\.\\d{2})`,
    "gi"
  );
  while ((m = transFeeRx.exec(text)) !== null) {
    const fee = Math.abs(parseFloat(m[4].replace(/,/g, "")));
    if (fee > 0) {
      const { date, month } = pd(m[1], m[2], m[3]);
      transactions.push({
        date, month, merchant: "Wise Transfer Fee",
        amount: fee, currency: statCur,
        baseAmount: fee, baseCurrency: statCur,
        category: "Service Fees", country: "United Kingdom",
        description: "Wise transfer fee", type: "fee",
      });
    }
  }

  return transactions;
}

async function extractWithAI(text: string, currency: string): Promise<Transaction[]> {
  // Chunk the text to handle large statements (19+ pages)
  const CHUNK_SIZE = 25000;
  const allTransactions: Transaction[] = [];

  // If text fits in one chunk, send it all
  if (text.length <= CHUNK_SIZE) {
    const txns = await extractChunkWithAI(text, currency, 1, 1);
    allTransactions.push(...txns);
  } else {
    // Split into chunks at line boundaries
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length);
      if (end < text.length) {
        const newlineIdx = text.lastIndexOf("\n", end);
        if (newlineIdx > start) end = newlineIdx;
      }
      chunks.push(text.substring(start, end));
      start = end;
    }

    for (let i = 0; i < chunks.length; i++) {
      const txns = await extractChunkWithAI(chunks[i], currency, i + 1, chunks.length);
      allTransactions.push(...txns);
    }
  }

  return allTransactions;
}

async function extractChunkWithAI(text: string, currency: string, chunkNum: number, totalChunks: number): Promise<Transaction[]> {
  const chunkNote = totalChunks > 1 ? ` (chunk ${chunkNum} of ${totalChunks})` : "";

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: `Extract ALL transactions from this Wise ${currency} statement${chunkNote}. For each transaction return a JSON array of objects with these fields:
- date: DD-MM-YYYY format
- month: "Month Year" (e.g. "July 2025")
- merchant: merchant/payee name (clean, no transaction IDs, no card numbers)
- amount: positive number (the outgoing/spent amount for the ACTUAL transaction currency, NOT the statement currency conversion)
- currency: the TRANSACTION currency (e.g. if "Card transaction of 500.00 AED" then currency is "AED", NOT GBP)
- category: one of "Hotels", "Restaurants", "Shopping", "Subscriptions", "Transport", "Telecom", "Service Fees", "Transfer", "Other"
- country: detected country from merchant location text
- type: "expense", "fee", or "income"

Rules:
- Skip header/footer text, IBAN info, asset fund details, page numbers
- "Card transaction of X.XX CUR issued by MERCHANT" → type "expense", amount is X.XX, currency is CUR
- "Wise Charges for: CARD-XXX" → type "fee", these are small card transaction fees in ${currency}
- "Assets service fee" → type "fee", category "Service Fees"
- "Received money from" → type "income", category "Transfer"
- "Sent money to" → type "expense", category "Transfer"
- "Wise Card Acquisition" → type "fee", category "Service Fees"
- If "units bought" appears (refund/reversal), type is "income"
- Amount should always be positive
- Detect country from merchant location: DUBAI/ABU DHABI = UAE, DOHA = Qatar, LONDON = UK, FRANKFURT/DUSSELDORF = Germany, AUCKLAND = New Zealand
- Do NOT skip "Wise Charges" fee entries — include every single one
- Do NOT merge duplicate-looking entries — if the same merchant appears twice, include both

Return ONLY a valid JSON array, no other text.

Statement text:
${text}`
    }],
  });

  if (resp.usage) {
    logUsage("Expense Analyzer", "claude-sonnet-4-6", resp.usage.input_tokens, resp.usage.output_tokens);
  }

  const content = resp.content[0];
  if (content.type !== "text") return [];

  try {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const fd = await req.formData();
    const files = fd.getAll("files") as File[];
    const useAI = fd.get("useAI") === "true";

    if (files.length === 0) {
      return Response.json({ error: "Please upload at least one Wise statement PDF." }, { status: 400 });
    }

    const allTransactions: Transaction[] = [];
    const fileSummaries: { name: string; currency: string; count: number }[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "pdf") {
        return Response.json({ error: `Only PDF files are supported. Got: ${file.name}` }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractPdfText(buffer);

      const currFromFile = file.name.match(/(GBP|EUR|USD|PKR)/i);
      const currFromText = text.match(/(EUR|GBP|USD|PKR)\s+statement/i);
      const currency = (currFromFile?.[1] || currFromText?.[1] || "USD").toUpperCase();

      let transactions: Transaction[];

      if (useAI) {
        transactions = await extractWithAI(text, currency);
      } else {
        transactions = parseWiseStatement(text, file.name);
      }

      fileSummaries.push({ name: file.name, currency, count: transactions.length });
      allTransactions.push(...transactions);
    }

    allTransactions.sort((a, b) => {
      const da = a.date.split("-").reverse().join("");
      const db = b.date.split("-").reverse().join("");
      return db.localeCompare(da);
    });

    const months = [...new Set(allTransactions.map(t => t.month).filter(Boolean))];
    const categories = [...new Set(allTransactions.map(t => t.category))];
    const countries = [...new Set(allTransactions.map(t => t.country).filter(c => c !== "Unknown"))];
    const currencies = [...new Set(allTransactions.map(t => t.currency))];

    const expenses = allTransactions.filter(t => t.type === "expense" || t.type === "fee");
    const totalByCurrency: Record<string, number> = {};
    for (const t of expenses) {
      totalByCurrency[t.currency] = (totalByCurrency[t.currency] || 0) + t.amount;
    }

    const totalByCategory: Record<string, number> = {};
    for (const t of expenses) {
      totalByCategory[t.category] = (totalByCategory[t.category] || 0) + t.amount;
    }

    const totalByMonth: Record<string, Record<string, number>> = {};
    for (const t of expenses) {
      if (!totalByMonth[t.month]) totalByMonth[t.month] = {};
      totalByMonth[t.month][t.currency] = (totalByMonth[t.month][t.currency] || 0) + t.amount;
    }

    const totalByCountry: Record<string, number> = {};
    for (const t of expenses) {
      totalByCountry[t.country] = (totalByCountry[t.country] || 0) + t.amount;
    }

    return Response.json({
      transactions: allTransactions,
      fileSummaries,
      months,
      categories,
      countries,
      currencies,
      summary: {
        totalTransactions: allTransactions.length,
        totalExpenses: expenses.length,
        totalByCurrency,
        totalByCategory,
        totalByMonth,
        totalByCountry,
      },
    });
  } catch (err) {
    console.error("Expense analyzer error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unexpected error processing statements." },
      { status: 500 }
    );
  }
}
