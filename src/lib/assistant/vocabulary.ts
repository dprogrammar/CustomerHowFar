// Words and phrases the HowFar Assistant understands. Pure data, shared with tests; extend freely.
// All entries are lowercase and use single spaces (messages are normalized the same way).

/**
 * Nigerian English and Pidgin -> plain English, applied before matching help entries. Phrases
 * come before single words so longer forms win (e.g. "una dey" before "una").
 */
export const PHRASE_REWRITES: [string, string][] = [
  ["wetin be", "what is"],
  ["wetin dey", "what is"],
  ["na wetin", "what is"],
  ["how i go take", "how do i"],
  ["how i go", "how do i"],
  ["how person go", "how do i"],
  ["how i fit", "how can i"],
  ["how una go", "how do you"],
  ["how una dey", "how do you"],
  ["how e dey work", "how does it work"],
  ["na how much", "how much is"],
  ["how much e be", "how much is"],
  ["how much e cost", "how much does it cost"],
  ["e cost", "cost"],
  ["i dey find", "i am looking for"],
  ["dey find", "looking for"],
  ["i wan", "i want to"],
  ["make i", "can i"],
  ["i no fit", "i cannot"],
  ["no fit", "cannot"],
  ["i no", "i do not"],
  ["no be", "is not"],
  ["una dey", "you are"],
  ["una get", "do you have"],
  ["una fit", "can you"],
  ["you fit", "can you"],
  ["who fit", "who can"],
  ["e don", "it has"],
  ["don approve", "approved"],
  ["take list", "list"],
  ["my shop", "my business"],
  ["my store", "my business"],
  ["my company", "my business"],
  ["my work", "my business"],
];

/** Single-word rewrites (Pidgin and text-speak). */
export const WORD_REWRITES: Record<string, string> = {
  wetin: "what",
  una: "you",
  dem: "they",
  wey: "that",
  dey: "is",
  fit: "can",
  sabi: "know",
  wan: "want",
  shey: "is",
  don: "has",
  u: "you",
  ur: "your",
  wat: "what",
  hw: "how",
  d: "the",
  abt: "about",
  acct: "account",
  pls: "please",
  plz: "please",
  pword: "password",
  pics: "photos",
  pix: "photos",
  biz: "business",
};

/** Filler words removed before matching (greetings, politeness, Pidgin particles). */
export const FILLERS = new Set([
  "abeg",
  "please",
  "biko",
  "oga",
  "madam",
  "sir",
  "ma",
  "bros",
  "sister",
  "o",
  "oo",
  "ooo",
  "sha",
  "jare",
  "abi",
  "ehn",
  "ehen",
  "naa",
  "joor",
  "kindly",
]);

/** Common words that don't help pick an answer. */
export const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "am", "be", "been", "was", "were", "do", "does", "did", "doing",
  "i", "me", "my", "mine", "you", "your", "we", "our", "us", "it", "its", "they", "them", "their",
  "to", "of", "in", "on", "at", "for", "and", "or", "but", "how", "what", "when", "where", "which",
  "who", "why", "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "there", "here", "this", "that", "these", "those", "with", "from", "about", "any", "some",
  "have", "has", "had", "so", "if", "then", "than", "just", "also", "as", "by", "up", "out",
  "yes", "ok", "okay", "hi", "hello", "hey", "want", "wants", "know", "tell", "please", "thanks",
  "thank", "help", "question", "ask", "now", "still", "very", "really", "one", "get", "got",
  "na", "e", "go", "make", "need", "needs", "like", "use", "using", "take", "say", "see",
  "way", "im", "ive", "dont", "doesnt", "cant", "isnt", "not", "no",
]);

/** A message that is only small talk gets a short friendly reply. */
export const GREETING = /^(how far|howfar|hi+|hello+|hey+|hiya|good (morning|afternoon|evening|day)|morning|evening|afternoon|wassup|whats up|sup|how are you|how you dey|how body|hw far|bawo ni|kedu|sannu|yo)$/;
export const THANKS = /^(thanks?( a lot| so much)?|thank you( so much| very much)?|thank u|tnx|thx|ty|e se|ese|e seun|daalu|nagode|god bless( you)?|ok thanks?|okay thanks?|alright|great|nice|cool|ok|okay)$/;
export const GOODBYE = /^(bye+|goodbye|good bye|later|see you|ciao|i dey go|ka chi fo)$/;

/** Phrases that mean "show me my listing status" (owners). */
export const STATUS_REQUEST =
  /\b(my (listing|listings|business|businesses|application|submission)s? (status|progress)|(status|progress) of my (listing|business|application|submission)|(has|is|was) my (listing|business|application) (been )?(approved|live|reviewed|rejected|done|ready)|my (listing|business) (is |has )?(still )?(approved|live|pending|rejected|not live|not approved|not showing|not visible)|my (listing|business) (is |has )?(still )?(never|not|no|isnt|hasnt|cannot|cant) (show|shows|showing|shown|appear|appearing|come out|go live|live|approved|visible)|why (is|cant|cannot) (i )?(see )?my (listing|business)|listing status|my status|check my (listing|business))\b/;

/** "Find a business" without saying what: ask what they need. */
export const FIND_REQUEST = /^(find|search|look for|looking for)( a| an)? (business|businesses|service|services|artisan|artisans|someone|somebody)$/;

/** Words that show someone wants a service (used with a detected category). */
export const SERVICE_CUES =
  /\b(need|needs|needed|want|looking for|look for|find|search|get me|who can|anybody|anyone|someone|somebody|recommend|any good|good|best|near|nearby|around|close to|fix|repair|repairs|install|available|hire|book)\b/;

/** Words that show the question is about using CustomerHowFar, not finding a service. */
export const PLATFORM_WORDS =
  /\b(list|listing|listings|register|my business|account|fee|fees|pay|payment|review|reviews|report|verify|verification|id|password|sign ?up|login|log in|delete|edit|upload|badge|customerhowfar)\b/;

/** Category slug -> words people use for it (singular and plural forms where they differ). */
export const CATEGORY_TERMS: Record<string, string[]> = {
  "fashion-tailoring": [
    "tailor", "tailors", "fashion designer", "fashion designers", "designer", "seamstress",
    "sewing", "sew", "dress maker", "dressmaker", "aso ebi", "asoebi", "native wear", "agbada",
    "kaftan", "clothes", "fashion",
  ],
  electricians: [
    "electrician", "electricians", "electrical", "wiring", "rewire", "socket", "sockets",
    "bulb", "light problem", "nepa", "electric",
  ],
  plumbers: [
    "plumber", "plumbers", "plumbing", "pipe", "pipes", "leak", "leaking", "toilet",
    "water heater", "sink", "drainage",
  ],
  "hair-beauty": [
    "hair", "hairdresser", "hair dresser", "hair stylist", "salon", "braids", "braiding",
    "wig", "wigs", "nails", "nail tech", "manicure", "pedicure", "lashes", "beautician", "beauty",
  ],
  mechanics: [
    "mechanic", "mechanics", "car repair", "vulcanizer", "vulcaniser", "vulcanizers",
    "panel beater", "rewire my car", "tyre", "tyres", "tire", "car", "engine", "auto",
  ],
  carpenters: [
    "carpenter", "carpenters", "carpentry", "furniture", "wardrobe", "cabinet", "woodwork",
    "bed frame", "door",
  ],
  "caterers-food": [
    "caterer", "caterers", "catering", "food", "small chops", "cook", "chef", "jollof",
    "party food", "food vendor",
  ],
  photographers: [
    "photographer", "photographers", "photography", "photoshoot", "photo shoot",
    "videographer", "video coverage", "pre wedding shoot",
  ],
  "phone-laptop-repair": [
    "phone repair", "phone repairer", "phone engineer", "laptop", "laptop repair", "computer",
    "computer repair", "screen repair", "iphone", "android", "cracked screen",
  ],
  cleaners: [
    "cleaner", "cleaners", "cleaning", "house cleaning", "office cleaning", "deep clean",
    "deep cleaning",
  ],
  painters: ["painter", "painters", "painting", "paint my house", "paint", "screeding"],
  "event-planners": [
    "event planner", "event planners", "party planner", "wedding planner", "events",
    "event decorator", "event", "party", "wedding", "birthday party",
  ],
  bricklayers: [
    "bricklayer", "bricklayers", "mason", "builder", "building", "block work", "tiler",
    "tiling", "tiles", "plaster", "plastering",
  ],
  welders: ["welder", "welders", "welding", "gate", "burglary proof", "iron work"],
  "ac-fridge-repair": [
    "ac", "a c", "air condition", "air conditioner", "air conditioning", "aircon",
    "ac repairer", "ac repair", "ac technician", "fridge", "freezer", "refrigerator",
    "fridge repairer",
  ],
  "generator-repair": [
    "generator", "generators", "gen", "gen repairer", "generator repairer", "generator mechanic",
    "generator repair",
  ],
  "solar-installers": ["solar", "inverter", "inverters", "solar panel", "solar panels", "battery"],
  "makeup-artists": [
    "makeup", "make up", "makeup artist", "makeup artists", "mua", "gele", "gele tier",
    "bridal makeup",
  ],
  barbers: ["barber", "barbers", "barbing", "barbing salon", "haircut", "hair cut", "low cut", "shave"],
  tutors: [
    "tutor", "tutors", "lesson teacher", "home lesson", "home lessons", "lessons", "teacher",
    "waec", "jamb", "tutoring",
  ],
  drivers: ["driver", "drivers", "chauffeur", "private driver"],
  "interior-decorators": [
    "interior decorator", "interior decorators", "interior design", "interior designer",
    "pop ceiling", "pop", "curtains", "wallpaper", "decor",
  ],
  laundry: [
    "laundry", "dry cleaning", "dry cleaner", "drycleaner", "wash my clothes", "ironing",
    "laundromat",
  ],
  shoemakers: ["shoemaker", "shoemakers", "cobbler", "shoe", "shoes", "sandals", "slippers"],
  bakers: ["baker", "bakers", "bakery", "cake", "cakes", "birthday cake", "wedding cake", "bread"],
  "pos-mobile-money": ["pos", "pos agent", "mobile money", "cash withdrawal", "withdraw cash"],
  "fumigation-pest-control": [
    "fumigation", "fumigator", "fumigate", "pest control", "rats", "cockroach", "cockroaches",
    "termites", "bed bugs", "bedbugs",
  ],
};

/**
 * Popular areas and cities that aren't LGA or state names -> state slug and (optionally) LGA
 * slug. `prep: true` means only match after "in", "at", "for", "around"... (short or common words).
 */
export const AREA_ALIASES: Record<string, { state: string; lga?: string; prep?: boolean }> = {
  // Lagos
  lekki: { state: "lagos", lga: "eti-osa" },
  "lekki phase 1": { state: "lagos", lga: "eti-osa" },
  ajah: { state: "lagos", lga: "eti-osa" },
  "victoria island": { state: "lagos", lga: "eti-osa" },
  vi: { state: "lagos", lga: "eti-osa", prep: true },
  ikoyi: { state: "lagos", lga: "eti-osa" },
  oniru: { state: "lagos", lga: "eti-osa" },
  sangotedo: { state: "lagos", lga: "eti-osa" },
  chevron: { state: "lagos", lga: "eti-osa", prep: true },
  yaba: { state: "lagos", lga: "lagos-mainland" },
  "ebute metta": { state: "lagos", lga: "lagos-mainland" },
  gbagada: { state: "lagos", lga: "kosofe" },
  ketu: { state: "lagos", lga: "kosofe" },
  ojota: { state: "lagos", lga: "kosofe" },
  magodo: { state: "lagos", lga: "kosofe" },
  festac: { state: "lagos", lga: "amuwo-odofin" },
  "festac town": { state: "lagos", lga: "amuwo-odofin" },
  ikotun: { state: "lagos", lga: "alimosho" },
  egbeda: { state: "lagos", lga: "alimosho" },
  idimu: { state: "lagos", lga: "alimosho" },
  igando: { state: "lagos", lga: "alimosho" },
  ogba: { state: "lagos", lga: "ikeja" },
  ojodu: { state: "lagos", lga: "ikeja" },
  opebi: { state: "lagos", lga: "ikeja" },
  allen: { state: "lagos", lga: "ikeja", prep: true },
  "allen avenue": { state: "lagos", lga: "ikeja" },
  maryland: { state: "lagos", lga: "ikeja" },
  "gra ikeja": { state: "lagos", lga: "ikeja" },
  isolo: { state: "lagos", lga: "oshodi-isolo" },
  ejigbo: { state: "lagos", lga: "oshodi-isolo" },
  oshodi: { state: "lagos", lga: "oshodi-isolo" },
  ojuelegba: { state: "lagos", lga: "surulere" },
  ajegunle: { state: "lagos", lga: "ajeromi-ifelodun" },
  obalende: { state: "lagos", lga: "lagos-island" },
  marina: { state: "lagos", lga: "lagos-island" },
  "lagos island": { state: "lagos", lga: "lagos-island" },
  "lagos mainland": { state: "lagos", lga: "lagos-mainland" },
  "eti osa": { state: "lagos", lga: "eti-osa" },
  ikeja: { state: "lagos", lga: "ikeja" },
  surulere: { state: "lagos", lga: "surulere" },
  ikorodu: { state: "lagos", lga: "ikorodu" },
  agege: { state: "lagos", lga: "agege" },
  alimosho: { state: "lagos", lga: "alimosho" },
  apapa: { state: "lagos", lga: "apapa" },
  badagry: { state: "lagos", lga: "badagry" },
  mushin: { state: "lagos", lga: "mushin" },
  ojo: { state: "lagos", lga: "ojo", prep: true },
  epe: { state: "lagos", lga: "epe", prep: true },
  kosofe: { state: "lagos", lga: "kosofe" },
  shomolu: { state: "lagos", lga: "shomolu" },
  somolu: { state: "lagos", lga: "shomolu" },
  bariga: { state: "lagos", lga: "shomolu" },
  "amuwo odofin": { state: "lagos", lga: "amuwo-odofin" },
  "ibeju lekki": { state: "lagos", lga: "ibeju-lekki" },
  "ifako ijaiye": { state: "lagos", lga: "ifako-ijaiye" },
  "oshodi isolo": { state: "lagos", lga: "oshodi-isolo" },
  // Other big cities and areas
  abuja: { state: "fct" },
  fct: { state: "fct" },
  wuse: { state: "fct", lga: "abuja-municipal" },
  garki: { state: "fct", lga: "abuja-municipal" },
  maitama: { state: "fct", lga: "abuja-municipal" },
  asokoro: { state: "fct", lga: "abuja-municipal" },
  gwarinpa: { state: "fct", lga: "abuja-municipal" },
  jabi: { state: "fct", lga: "abuja-municipal" },
  lugbe: { state: "fct", lga: "abuja-municipal" },
  kubwa: { state: "fct", lga: "bwari" },
  "port harcourt": { state: "rivers", lga: "port-harcourt" },
  ph: { state: "rivers", lga: "port-harcourt", prep: true },
  portharcourt: { state: "rivers", lga: "port-harcourt" },
  ibadan: { state: "oyo" },
  benin: { state: "edo", prep: true },
  "benin city": { state: "edo" },
  warri: { state: "delta" },
  asaba: { state: "delta" },
  abeokuta: { state: "ogun" },
  ota: { state: "ogun", prep: true },
  sagamu: { state: "ogun" },
  onitsha: { state: "anambra" },
  awka: { state: "anambra" },
  nnewi: { state: "anambra" },
  uyo: { state: "akwa-ibom", prep: true },
  calabar: { state: "cross-river" },
  jos: { state: "plateau", prep: true },
  owerri: { state: "imo" },
  aba: { state: "abia", prep: true },
  umuahia: { state: "abia" },
  ilorin: { state: "kwara" },
  akure: { state: "ondo" },
  osogbo: { state: "osun" },
  "ile ife": { state: "osun" },
  "ado ekiti": { state: "ekiti" },
  zaria: { state: "kaduna" },
  maiduguri: { state: "borno" },
  yola: { state: "adamawa", prep: true },
  makurdi: { state: "benue" },
  lokoja: { state: "kogi" },
  minna: { state: "niger" },
  sokoto: { state: "sokoto" },
  yenagoa: { state: "bayelsa" },
  abakaliki: { state: "ebonyi" },
};

/** State names that are also ordinary English words: only match after "in", "at"... or before "state". */
export const AMBIGUOUS_STATE_NAMES = new Set(["delta", "rivers", "plateau", "niger", "cross river"]);

/** LGA names that are ordinary words (or Pidgin): only match after "in", "at", "for"... */
export const AMBIGUOUS_LGA_NAMES = new Set([
  "logo", "song", "brass", "bonny", "abi", "owo", "ise", "oye", "ila", "ede", "ofu", "obi", "udi",
  "isu", "ika", "itu", "mbo", "ibi", "lau", "zing", "isa", "ado", "apa", "oju", "edu", "moro",
  "asa", "maru", "mani", "rimi", "toro", "zaki", "kura", "rano", "rogo", "gaya", "kabo", "tofa",
  "ini", "ivo", "suru", "zuru", "jega", "anka", "miga", "roni", "guri", "buji", "fika", "fune",
  "bade", "dass", "bama", "biu", "gada", "yabo", "gudu", "kaga", "bayo", "jere", "mafa", "boki",
  "yala", "orlu", "orsu", "oron", "onna", "abak", "eket", "nkanu", "ikwo", "ezza", "izzi", "ijero",
  "efon", "moba", "ifo", "ose", "iwo", "egor", "udu", "okpe", "owan", "esan", "ovia", "ukum",
  "guma", "tarka", "agatu", "ohimini", "kogi", "ekiti", "bassa", "wase", "kanam", "mangu", "shira",
  "lere", "soba", "giwa", "jaba", "kaura", "tafa", "moya", "rafi", "lapai", "gurara", "borgu",
  "bida", "tai", "eleme", "etche", "khana", "gokana", "andoni", "degema", "ogu", "oyi", "ideato",
  "isoko", "ndokwa", "sapele", "ethiope", "ughelli", "patani", "bomadi", "burutu", "ogbia", "nembe",
  "ekeremor", "sagbama", "katsina", "kano", "bauchi", "gombe", "kebbi", "yobe", "jigawa", "zamfara",
  "sokoto", "kaduna", "taraba", "adamawa", "borno", "nasarawa", "nassarawa", "benue", "kwara", "osun",
  "ondo", "ogun", "oyo", "edo", "imo", "abia", "anambra", "enugu", "ebonyi", "lagos",
]);

/** Words that, right before a place name, show it is a location ("plumber in Lekki"). */
export const LOCATION_PREPOSITIONS = new Set([
  "in", "at", "for", "around", "near", "from", "inside", "within", "reach", "to", "side", "area",
]);

/** Asking what listing costs or how to pay for it ("is there a fee", "how much to list"). */
export const COST_QUESTION =
  /\b(fee|fees|price|prices|pricing|cost|costs|charge|charges|how much|subscription|refund|refunds|bank transfer|bank details|account number|receipt|pay for (my |the |a )?(listing|business|shop)|pay to list|payment for (my |the |a )?(listing|business)|listing payment)\b/;

/** Questions about customers paying a business (safety advice), not the listing fee. */
export const CUSTOMER_PAYMENT =
  /\b(customer|customers|upfront|deposit|advance|part payment|balance|pay (the|a) (business|worker|artisan|plumber|tailor)|scam|scammed|refund my money)\b/;
