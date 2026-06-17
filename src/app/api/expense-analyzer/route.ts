export const maxDuration = 300;
export const runtime = "nodejs";

import Anthropic from "@anthropic-ai/sdk";

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

function parseWiseStatement(text: string, fileName: string): Transaction[] {
  const transactions: Transaction[] = [];

  const currMatch = text.match(/(EUR|GBP|USD|PKR)\s+statement/i);
  const statementCurrency = currMatch ? currMatch[1].toUpperCase() : "USD";

  // pdf-parse concatenates text without spaces between columns.
  // We use regex on the full text rather than line-by-line since fields run together.

  // 1. Card transactions: "Card transaction of X.XX CUR issued by MERCHANT LOCATION"
  //    Merchant+fee may wrap across 1-3 lines. Date follows: "DD Month YYYYCard ending..."
  const cardTxRegex = /Card transaction of ([\d,]+\.?\d*) (\w{3}) issued by ([\s\S]+?)(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})Card ending/gi;

  let match;
  while ((match = cardTxRegex.exec(text)) !== null) {
    const amount = parseFloat(match[1].replace(/,/g, ""));
    const currency = match[2].toUpperCase();
    const merchantRaw = match[3].trim();
    const day = match[4].padStart(2, "0");
    const mon = MONTH_NAMES[match[5].toLowerCase()] || "01";
    const year = match[6];
    const txDate = `${day}-${mon}-${year}`;
    const txMonth = `${match[5]} ${year}`;

    const cleanMerchant = merchantRaw
      .replace(/\s*\(fee:[\s\S]*?\)/, "")
      .replace(/[\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 80);

    const category = categorize(cleanMerchant);
    const country = detectCountry(cleanMerchant);

    // Skip refund/reversal entries (units "bought" = money coming back)
    const contextStart = Math.max(0, match.index - 10);
    const contextEnd = Math.min(text.length, cardTxRegex.lastIndex + 200);
    const context = text.substring(contextStart, contextEnd);
    const isRefund = /units bought/i.test(context) && !/units sold/i.test(context);

    if (isRefund) {
      transactions.push({
        date: txDate, month: txMonth,
        merchant: cleanMerchant,
        amount, currency, category, country,
        description: `Card transaction (refund) of ${amount} ${currency} - ${cleanMerchant}`,
        type: "income",
      });
    } else {
      transactions.push({
        date: txDate, month: txMonth,
        merchant: cleanMerchant,
        amount, currency, category, country,
        description: `Card transaction of ${amount} ${currency} - ${cleanMerchant}`,
        type: "expense",
      });
    }
  }

  // 2. Wise Charges (card fees): "Wise Charges for: CARD-XXXXXXX"
  const wiseChargesRegex = /Wise Charges for:\s*CARD-\d+[\s\n]*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})[^\n]*?Transaction:\s*FEE-CARD-\d+[\s\n]*-([\d,]+\.?\d*)/gi;

  while ((match = wiseChargesRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, "0");
    const mon = MONTH_NAMES[match[2].toLowerCase()] || "01";
    const year = match[3];
    const feeAmount = parseFloat(match[4].replace(/,/g, ""));

    if (feeAmount > 0) {
      transactions.push({
        date: `${day}-${mon}-${year}`,
        month: `${match[2]} ${year}`,
        merchant: "Wise Card Fee",
        amount: feeAmount,
        currency: statementCurrency,
        category: "Service Fees",
        country: "United Kingdom",
        description: `Wise Charges for card transaction`,
        type: "fee",
      });
    }
  }

  // 3. Assets service fees: "CUR Assets service fee"
  const assetFeeRegex = /(\w{3}) Assets service fee[\s\n]*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})[^\n]*?-([\d,]+\.?\d*)/gi;

  while ((match = assetFeeRegex.exec(text)) !== null) {
    const feeCurrency = match[1].toUpperCase();
    const day = match[2].padStart(2, "0");
    const mon = MONTH_NAMES[match[3].toLowerCase()] || "01";
    const year = match[4];
    const feeAmount = parseFloat(match[5].replace(/,/g, ""));

    if (feeAmount > 0) {
      transactions.push({
        date: `${day}-${mon}-${year}`,
        month: `${match[3]} ${year}`,
        merchant: `${feeCurrency} Assets Service Fee`,
        amount: feeAmount,
        currency: feeCurrency,
        category: "Service Fees",
        country: "United Kingdom",
        description: `${feeCurrency} Assets service fee`,
        type: "fee",
      });
    }
  }

  // 4. Sent money: "Sent money to NAME"
  const sentRegex = /Sent money to ([^\n]+?)[\s\n]*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})[^\n]*?-([\d,]+\.?\d*)/gi;

  while ((match = sentRegex.exec(text)) !== null) {
    const recipient = match[1].trim().substring(0, 80);
    const day = match[2].padStart(2, "0");
    const mon = MONTH_NAMES[match[3].toLowerCase()] || "01";
    const year = match[4];
    const amount = parseFloat(match[5].replace(/,/g, ""));

    if (amount > 0) {
      transactions.push({
        date: `${day}-${mon}-${year}`,
        month: `${match[3]} ${year}`,
        merchant: `Transfer to ${recipient}`,
        amount, currency: statementCurrency,
        category: "Transfer",
        country: "Unknown",
        description: `Sent money to ${recipient}`,
        type: "expense",
      });
    }
  }

  // 5. Received money: "Received money from NAME"
  const receivedRegex = /Received money from ([^\n]+?)[\s\n]*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/gi;

  while ((match = receivedRegex.exec(text)) !== null) {
    const sender = match[1].trim().substring(0, 80);
    const day = match[2].padStart(2, "0");
    const mon = MONTH_NAMES[match[3].toLowerCase()] || "01";
    const year = match[4];

    // Find amount — look for a number after the date context
    const afterMatch = text.substring(receivedRegex.lastIndex, receivedRegex.lastIndex + 300);
    const amtMatch = afterMatch.match(/([\d,]+\.?\d*)/);
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, "")) : 0;

    if (amount > 0) {
      transactions.push({
        date: `${day}-${mon}-${year}`,
        month: `${match[3]} ${year}`,
        merchant: `Received from ${sender}`,
        amount, currency: statementCurrency,
        category: "Transfer",
        country: "Unknown",
        description: `Received money from ${sender}`,
        type: "income",
      });
    }
  }

  // 6. Wise Card Acquisition
  const cardAcqRegex = /Wise Card Acquisition[\s\n]*(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})[^\n]*?-([\d,]+\.?\d*)/gi;

  while ((match = cardAcqRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, "0");
    const mon = MONTH_NAMES[match[2].toLowerCase()] || "01";
    const year = match[3];
    const amount = parseFloat(match[4].replace(/,/g, ""));

    if (amount > 0) {
      transactions.push({
        date: `${day}-${mon}-${year}`,
        month: `${match[2]} ${year}`,
        merchant: "Wise Card Acquisition",
        amount, currency: statementCurrency,
        category: "Service Fees",
        country: "United Kingdom",
        description: "Wise Card Acquisition fee",
        type: "fee",
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
