# מפרט מלא להעתקת מערכת ניהול והערכת המועמדים לסביבת VS Code מקומית

> מסמך עבודה ל-LLM שמפתח את המערכת מחדש בבעלות מלאה של המשתמש

## 0. הוראת על ל-LLM

עליך להקים מערכת Web מלאה, עובדת ומאובטחת, המעתיקה את היכולות, זרימות העבודה והחוויה של האתר `tech-candidate-manager`. המערכת מיועדת לניהול גיוס טכנולוגי בעברית ולניתוח מועמדים באמצעות AI.

אל תסתפק ב-Mockup, דף סטטי או נתוני Demo. יש לבנות Frontend, Backend, בסיס נתונים, אחסון קבצים, אימות והרשאות, חיבור OpenAI, Migrations, בדיקות, תיעוד והוראות הרצה ופריסה. כל מידע תפעולי יישמר בצד השרת. אין לחשוף מפתחות API בדפדפן.

המערכת כולה תהיה RTL ובעברית, אך שמות טכנולוגיים מקובלים יישארו באנגלית.

## 1. הדרך הנכונה להגיע להעתק מדויק

### מסלול A - העתקת קוד המקור הקיים, מומלץ

זהו המסלול היחיד שמבטיח זהות גבוהה באמת. לפני כתיבה מחדש, בדוק אם התקבלה תיקיית המקור של Site או Repository שיוצא ממנו. אם כן:

1. פתח את הקוד הקיים ב-VS Code.
2. שמור את מבנה המסכים, הטקסטים, ה-CSS, חוזי ה-API, סכמות ה-JSON והנחיות ה-AI הקיימות.
3. החלף רק רכיבים שתלויים ב-ChatGPT Sites:
   - Cloudflare D1 יוחלף ב-PostgreSQL מקומי או מנוהל.
   - Cloudflare R2 יוחלף ב-S3, MinIO או אחסון Object Storage תואם S3.
   - כותרות הזיהוי של ChatGPT יוחלפו ב-Auth.js או ספק OIDC ארגוני.
   - משתני הסביבה של Sites יוחלפו בקובץ `.env.local` לפיתוח וב-Secrets של סביבת הפריסה לייצור.
4. אל תשכתב את כל המערכת רק כדי להחליף תשתית. בנה שכבת Adapter ל-DB, Storage ו-Auth כדי לצמצם סטייה התנהגותית.

### מסלול B - שחזור לפי המפרט

השתמש במסלול זה רק כאשר קוד המקור אינו זמין. שחזור לפי מסמך יכול להגיע לשוויון פונקציונלי גבוה, אך לא לזהות של כל פיקסל או כל ניסוח פנימי. במקרה כזה, התייחס לכל סעיף המסומן "חובה" כקריטריון קבלה.

## 2. תמונת המערכת

המערכת מנהלת ארבע ישויות עסקיות עיקריות:

1. משרה - דרישות, טכנולוגיות, דגשי מנהל מגייס וסטטוס.
2. מועמד - פרטים אישיים ומקצועיים, קורות חיים וחוות דעת מגייס.
3. מועמדות - הקשר בין מועמד למשרה מסוימת. כאן נשמרים סטטוס התהליך, ראיון, פעולה הבאה והערכת התאמה.
4. הערכת AI - תוצאה מובנית של השוואת המועמד למשרה לפני ראיון או לאחריו.

זרימת העל:

```text
משתמש -> דפדפן RTL -> שרת היישום -> PostgreSQL
                              -> Object Storage לקובצי PDF
                              -> OpenAI Responses API
                              -> יומן פעילות ועלויות AI
```

הבחנה חשובה: מועמד הוא אדם יחיד, אך יכול להיות משויך לכמה משרות. כל שיוך הוא מועמדות עצמאית עם סטטוס, ראיון, ציון והמלצה משלה. קורות החיים שייכים למועמד ומשותפים לכל המועמדויות שלו.

## 3. Stack מומלץ למימוש מקומי ובבעלות המשתמש

### 3.1 ברירת המחדל המומלצת

- Node.js 22 LTS ומעלה.
- TypeScript עם `strict: true`.
- Next.js 16 עם App Router ו-React 19.
- PostgreSQL 16.
- Drizzle ORM ו-Drizzle Kit עבור Schema ו-Migrations.
- MinIO בפיתוח מקומי, ו-AWS S3 או שירות S3-compatible בייצור.
- Auth.js עם Google, Microsoft Entra ID או OIDC ארגוני.
- OpenAI Responses API עם Structured Outputs באמצעות JSON Schema.
- Tailwind CSS 4 או CSS Modules. אם קוד המקור קיים, יש לשמר את ה-CSS הקיים.
- Docker Compose להפעלה מקומית של היישום, PostgreSQL ו-MinIO.
- Vitest לבדיקות יחידה, Playwright לבדיקות E2E.

### 3.2 Tradeoffs

| רכיב | בחירה מומלצת | חלופה | Tradeoff |
|---|---|---|---|
| DB | PostgreSQL | SQLite | PostgreSQL מתאים לריבוי משתמשים, גיבוי ופריסה. SQLite פשוט יותר אך מוגבל בכתיבה מקבילית. |
| קבצים | S3/MinIO | דיסק מקומי | דיסק מקומי קל אך מסוכן בפריסה בקונטיינר ואינו מתאים לסקייל. |
| Auth | OIDC/Auth.js | משתמש וסיסמה עצמאיים | OIDC מפחית טיפול בסיסמאות וסיכוני אבטחה. |
| AI | OpenAI Responses API | ספק LLM אחר | OpenAI נדרש לשוויון הגבוה ביותר מול המערכת הנוכחית. ספק חלופי מחייב Adapter ובדיקות איכות. |
| פריסה | Docker | Serverless | Docker נותן בעלות וניידות. Serverless מפחית תפעול אך מגדיל תלות בספק. |

### 3.3 מבנה Repository נדרש

```text
tech-candidate-manager/
  app/
    api/
      auth/
      session/
      recruiting/
      cv/
      cv/ai/
      evaluate/
      interview/summarize/
      jobs/parse/
      jobs/refine/
    layout.tsx
    page.tsx
    globals.css
  components/
    layout/
    dashboard/
    jobs/
    candidates/
    evaluation/
    admin/
    ui/
  db/
    schema.ts
    client.ts
    repositories/
  drizzle/
  lib/
    auth/
    storage/
    ai/
    validation/
    audit/
  public/
  tests/
    unit/
    integration/
    e2e/
  docker-compose.yml
  Dockerfile
  .env.example
  README.md
  package.json
```

אין חובה לפצל את הממשק לאותם קבצים בדיוק, אבל חובה לשמור הפרדה בין UI, גישה לנתונים, אחסון, Auth ו-AI.

## 4. שפה חזותית וחוויית שימוש

### 4.1 עקרונות

- כיוון מסמך `dir="rtl"`.
- Top Bar קבוע עם סימן מותג `N`, הכותרת "ניהול והערכת מועמדים", כותרת משנה "גיוס טכנולוגי מבוסס AI" ופרטי המשתמש.
- Sidebar ימני עם ניווט. במובייל הוא נסגר ונפתח מכפתור Hamburger.
- צבע מוביל סגול, כרטיסים לבנים, רקע אפור בהיר, גבולות עדינים ורדיוס בינוני.
- טבלאות צפופות אך קריאות, Badges לסטטוסים, Score Ring לציון 0-100.
- מצבי Loading, Empty, Success ו-Error בכל פעולה אסינכרונית.
- אישור מפורש לפני מחיקה, ארכוב או פעולה בלתי הפיכה.
- אין Marketing Hero. המסך הראשון הוא סביבת העבודה.

### 4.2 מיפוי סטטוסים לצבעים

- `נדחה`, `לא מתאים`, `לא רלוונטי לתפקיד` - אדום.
- `בירור`, `מתאים חלקית`, `גבולי` - כתום.
- `חדש`, `בבדיקה`, `טרם הוערך` - אפור.
- סטטוסים חיוביים אחרים - ירוק.

### 4.3 ניווט

לכל משתמש מורשה:

- לוח בקרה
- משרות
- מועמדים
- ארכיון
- מדריך ותיעוד
- פעילות AI ועלויות

למנהל בלבד:

- משתמשים והרשאות
- הוראות AI

ניווט לפרטי משרה או מועמד יתבצע בתוך האפליקציה ללא Reload מלא. רצוי להשתמש בנתיבים אמיתיים כגון `/jobs/[id]` ו-`/candidates/[applicationId]`, גם אם המקור השתמש במצב Client יחיד. URL אמיתי משפר Deep Links ו-Back Button ואינו משנה את הפונקציונליות.

## 5. המסכים והיכולות

### 5.1 כניסה והרשאה

מצבים:

1. טעינה - "טוען את המערכת...".
2. לא מחובר - "נדרשת התחברות" וכפתור התחברות.
3. מחובר אך לא מורשה - הצגת כתובת החשבון והנחיה לפנות למנהל.
4. מורשה - כניסה למערכת.

השרת, ולא ה-UI, חייב לאמת הרשאה בכל Endpoint. הסתרת כפתורים אינה Authorization.

### 5.2 לוח בקרה

חובה להציג:

- מספר משרות פעילות.
- מספר מועמדים ייחודיים.
- מועמדויות פעילות.
- משימות להמשך, ממוינות לפי תאריך יעד ואז עדכון אחרון.
- משרות פעילות עם מספר מועמדים, התאמה גבוהה והתאמה סבירה.
- מועמדים אחרונים.
- כפתורי פעולה מהירים ליצירת משרה ומועמד.

כל כרטיס או שורה רלוונטיים ניתנים ללחיצה ומעבירים לפרטי הרשומה.

### 5.3 רשימת משרות

- חיפוש לפי שם משרה או לקוח.
- כרטיס/טבלה עם שם, לקוח, סטטוס, טכנולוגיות, מספר מועמדים ותאריך עדכון.
- יצירת משרה ידנית.
- יצירת טיוטת משרה מ-Text באמצעות AI.
- פתיחת משרה קיימת.

### 5.4 יצירה ועריכה של משרה

שדות:

- שם משרה - חובה.
- לקוח - חובה.
- סטטוס - ברירת מחדל `פעילה`.
- תיאור.
- דרישות חובה.
- דרישות יתרון.
- טכנולוגיות כרשימה.
- מינימום שנות ניסיון, Nullable.
- דגשים מקצועיים.
- דגשים אישיותיים.
- הערות פנימיות.

מצבי AI:

1. יצירת טיוטה מטקסט חופשי הכולל תיאור, שרשור מייל או תמלול.
2. עדכון משרה קיימת לפי חומר חדש. יש להציג Summary, רשימת Changes, Questions וטיוטה מלאה. המשתמש מאשר לפני שמירה.

### 5.5 דף משרה

- כותרת, לקוח וסטטוס.
- עריכה.
- העברה לארכיון.
- מחיקה לצמיתות רק אם אין מועמדויות.
- הצגת תיאור, חובה, יתרון, דגשים מקצועיים, אישיותיים, טכנולוגיות והערות פנימיות.
- תמונת מצב עם מספר מועמדויות והתפלגות התאמה.
- רשימת המועמדים למשרה עם סטטוס, ציון והמלצה.
- הוספת מועמד חדש למשרה.

### 5.6 רשימת מועמדים

- ספירה לפי אנשים ייחודיים, לא לפי מועמדויות.
- חיפוש לפי שם, משרה או לקוח.
- סינון לפי סטטוס.
- טבלה המציגה מועמד, תפקיד מקצועי/חברה, המשרה שאליה מועמד, לקוח, טכנולוגיות, ציון, המלצה, תאריך ראיון וסטטוס.
- אם לאותו אדם יש כמה מועמדויות, כל מועמדות יכולה להופיע בשורה עצמאית אך הכרטיס הראשי נשאר משותף.

### 5.7 יצירת מועמד

שדות:

- שם מלא - חובה.
- טלפון.
- דוא"ל.
- LinkedIn.
- תפקיד מקצועי נוכחי או אחרון.
- חברה נוכחית או אחרונה.
- שנות ניסיון.
- טכנולוגיות.
- תקציר ניסיון.
- שיוך למשרה - חובה בעת יצירת המועמד הראשון.

יש למנוע יצירת מועמדות כפולה לאותו מועמד ולאותה משרה.

### 5.8 דף מועמד ומועמדות

הדף מציג את האדם ואת המועמדות הנבחרת. אם יש כמה מועמדויות, יש Selector למעבר ביניהן וכפתור לשיוך למשרה נוספת.

לשוניות:

1. סקירה.
2. קורות חיים.
3. ראיון.
4. הערכת AI.

בסקירה:

- שם ופרטי קשר.
- תפקיד מקצועי, חברה, שנות ניסיון, טכנולוגיות ותקציר.
- רשימת כל המועמדויות.
- סטטוס המועמדות הנוכחית.
- תאריך ראיון.
- ציון והמלצה.
- פעולה הבאה ותאריך יעד אופציונלי.
- קיצור דרך להערכה המלאה.

פעולה הבאה כוללת הצעות:

- הפעלת הערכה לפני ראיון
- תיאום ראיון מקצועי
- ביצוע ראיון מקצועי
- הפעלת הערכה לאחר ראיון
- העברה ללקוח
- מעקב מול הלקוח

ניתן לערוך, לנקות ולשמור פעולה.

### 5.9 קורות חיים

דרישות חובה:

- PDF בלבד.
- גודל מרבי 10MB.
- שמירת הקובץ ב-Object Storage ולא בבסיס הנתונים.
- שמירת Metadata וטקסט שחולץ ב-DB.
- הצגת שם קובץ, גודל, מספר עמודים, תאריך העלאה, סטטוס חילוץ ואורך הטקסט.
- פתיחת ה-PDF בהרשאה מתאימה.
- החלפת PDF קיים.
- חילוץ טקסט אוטומטי מה-PDF בצד השרת.
- שני מסלולי חילוץ פרטים:
  - חילוץ מהיר ללא AI באמצעות Regex וכללים בסיסיים.
  - חילוץ חכם באמצעות AI.
- הצגת טופס אימות אנושי לפני עדכון כרטיס המועמד.
- ה-AI אינו משנה אוטומטית שיוך למשרה.

הפרטים שמוחזרים לאימות:

- שם מלא
- דוא"ל
- טלפון
- LinkedIn
- תפקיד מקצועי אחרון
- חברה אחרונה
- שנות ניסיון
- טכנולוגיות
- תקציר ניסיון
- Notes המסבירים אי-ודאות בכל שדה מרכזי

חוות דעת מגייס מהראיון הראשוני נשמרת בנפרד בקובץ המועמד ומשמשת מקור משני בלבד בהערכות.

### 5.10 ראיון

שני אזורים נפרדים:

1. יצירת טיוטה מחומר גלם באמצעות AI:
   - המשתמש מדביק תמלול Teams, הערות או שילוב.
   - מינימום 50 תווים, מקסימום 150,000.
   - התוצאה היא טיוטה בלבד עם רשימת Uncertainties.
   - המשתמש רשאי לערוך, לבטל או לאשר.
2. סיכום ראיון מאושר:
   - שדה שניתן לערוך ידנית.
   - רק תוכן מאושר נשמר ומשמש את ההערכה שלאחר ראיון.

לאחר שמירת סיכום ראיון, יש להעביר את המשתמש ללשונית ההערכה ולהגדיר פעולה מתאימה להפעלת הערכה לאחר ראיון.

### 5.11 הערכת התאמה באמצעות AI

יש שני מצבים:

- לפני ראיון - משרה + קורות חיים + כרטיס מועמד + חוות דעת מגייס כמקור משני.
- לאחר ראיון - כל האמור לעיל + סיכום ראיון מאושר + הערכה קודמת כנקודת ייחוס.

התוצאה המובנית חייבת לכלול:

```ts
type EvaluationResult = {
  gate_status: "עבר את שער ההתאמה" | "לא רלוונטי לתפקיד";
  score: number; // 0..100
  fit_label: "מתאים" | "מתאים חלקית" | "גבולי" | "לא מתאים" | "לא רלוונטי לתפקיד";
  recommendation:
    | "להתקדם לראיון מקצועי"
    | "להתקדם בכפוף לבירור"
    | "לא להתקדם"
    | "להעביר ללקוח"
    | "להעביר ללקוח בכפוף להשלמה"
    | "לא להעביר ללקוח";
  bottom_line: string;
  executive_summary: string;
  strengths: Array<{
    requirement: string;
    evidence: string;
    assessment: "מתאים" | "מתאים חלקית";
  }>;
  gaps: Array<{
    requirement: string;
    candidate_has: string;
    missing: string;
    criticality: "נמוכה" | "בינונית" | "גבוהה" | "פוסל";
    completion_likelihood: string;
  }>;
  uncertainties: string[];
  questions: Array<{
    question: string;
    why: string;
    good_answer: string;
    red_flag: string;
    interviewer_explanation: string;
  }>;
  technology_fit: string;
  experience_fit: string;
  risks: string[];
  cv_changes_needed: boolean;
  cv_change_recommendations: Array<{
    location: string;
    change: string;
    reason: string;
    evidence: string;
  }>;
  generalizable_feedback: boolean;
  proposed_engine_rule: string;
  recruitment_email: string;
};
```

תצוגת ההערכה:

- ציון 0-100 וטבעת גרפית.
- Label והמלצה.
- שורה תחתונה.
- תקציר מנהלים.
- חוזקות עם Evidence.
- פערים עם קריטיות והיתכנות השלמה.
- אי-ודאויות.
- סיכונים.
- התאמה טכנולוגית והתאמת ניסיון/Seniority.
- שאלות לראיון: השאלה, למה, תשובה טובה, דגל אדום והסבר למראיין.
- תיקוני קורות חיים רק כאשר יש בסיס עובדתי.
- מייל מוכן להעתקה לצוות הגיוס.
- תיבת משוב לתיקון הערכת AI.
- הצעת כלל רוחבי לשיפור מנוע ההערכה, שאדמין יכול לאשר או לדחות.

כאשר מופעלת הערכה מחדש עם משוב, יש להעביר למודל את המשוב ואת ההערכה הקודמת. אין למחוק היסטוריה ללא Audit.

### 5.12 ארכיון

שני אזורים:

- משרות בארכיון.
- מועמדויות בארכיון.

חובה לאפשר שחזור. ארכוב מועמדות אחת אינו מוחק את המועמד או מועמדויות אחרות. ארכוב משרה מסתיר גם את המועמדויות שלה מהתצוגה הפעילה אך אינו מוחק מידע.

### 5.13 פעילות AI ועלויות

טבלה של 100 הפעולות האחרונות לפחות:

- סוג פעולה.
- אובייקט ונושא.
- מודל.
- Input Tokens.
- Cached Input Tokens.
- Output Tokens.
- עלות משוערת בדולר.
- תאריך ושעה.

יש להציג במפורש שהעלות היא אומדן בלבד והחיוב הרשמי נמצא אצל ספק ה-AI.

### 5.14 הוראות AI - מנהל בלבד

חמישה סוגי הוראות ניתנים לעריכה:

- `candidate_evaluation` - הערכה לפני ראיון.
- `post_interview_evaluation` - הערכה לאחר ראיון.
- `job_parsing` - יצירת משרה מטקסט.
- `cv_extraction` - חילוץ פרטי מועמד.
- `interview_summary` - יצירת טיוטת סיכום ראיון.

לכל הוראה:

- כותרת.
- תיאור.
- תוכן מלא.
- דגל האם היא מותאמת אישית.
- תאריך עדכון.
- שמירה.
- איפוס לברירת מחדל.

הערה: Prompt הוא קוד עסקי. יש לשמור אותו ב-Version Control כברירת מחדל, ואת השינוי המותאם ב-DB עם Audit.

### 5.15 משתמשים והרשאות - מנהל בלבד

- רשימת משתמשים מורשים.
- הוספת כתובת מייל.
- Role: `admin` או `user`.
- שינוי Role.
- מחיקת משתמש.
- אין לאפשר למנהל הראשי למחוק את עצמו או להפוך את עצמו למשתמש רגיל.

## 6. מודל הנתונים המלא

השתמש ב-UUID או BigInt כמפתחות. אם נדרש שוויון למקור ניתן להשתמש ב-Identity Integer. כל הזמנים ב-UTC מסוג `timestamptz`.

### 6.1 users

```sql
create table app_users (
  email text primary key,
  role text not null check (role in ('admin','user')) default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 6.2 jobs

```sql
create table jobs (
  id bigserial primary key,
  title text not null,
  client text not null,
  status text not null default 'פעילה',
  description text not null default '',
  must_requirements text not null default '',
  preferred_requirements text not null default '',
  technologies jsonb not null default '[]'::jsonb,
  min_years integer null check (min_years is null or min_years >= 0),
  professional_emphasis text not null default '',
  personality_emphasis text not null default '',
  internal_notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_jobs_archived_updated on jobs (archived, updated_at desc);
```

### 6.3 candidates

```sql
create table candidates (
  id bigserial primary key,
  full_name text not null,
  phone text not null default '',
  email text not null default '',
  linkedin_url text not null default '',
  professional_title text not null default '',
  company text not null default '',
  years_experience integer null check (years_experience is null or years_experience >= 0),
  technologies jsonb not null default '[]'::jsonb,
  experience_summary text not null default '',
  recruiter_opinion text not null default '',
  cv_key text null,
  cv_filename text null,
  cv_content_type text null,
  cv_size bigint null,
  cv_pages integer null,
  cv_extracted_text text not null default '',
  cv_extraction_status text not null default 'לא הועלה',
  cv_uploaded_at timestamptz null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_candidates_archived_updated on candidates (archived, updated_at desc);
```

### 6.4 applications

```sql
create table applications (
  id bigserial primary key,
  candidate_id bigint not null references candidates(id) on delete cascade,
  job_id bigint not null references jobs(id) on delete restrict,
  status text not null default 'חדש',
  interview_date timestamptz null,
  interview_summary text not null default '',
  next_action text not null default '',
  next_action_date date null,
  score integer null check (score is null or score between 0 and 100),
  recommendation text not null default 'טרם הוערך',
  evaluation_type text not null default 'ראשונית',
  evaluation_date timestamptz null,
  evaluation_json jsonb null,
  evaluation_feedback text not null default '',
  proposed_engine_rule text not null default '',
  engine_rule_status text not null default 'ללא הצעה',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id, job_id)
);
create index idx_applications_job_active on applications (job_id, archived, updated_at desc);
create index idx_applications_candidate_active on applications (candidate_id, archived, updated_at desc);
create index idx_applications_next_action on applications (archived, next_action_date) where next_action <> '';
```

### 6.5 ai_activity_logs

```sql
create table ai_activity_logs (
  id bigserial primary key,
  action_type text not null,
  subject_type text not null default '',
  subject_id bigint null,
  subject_label text not null default '',
  model text not null,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_ai_activity_created on ai_activity_logs (created_at desc);
```

### 6.6 ai_instructions

```sql
create table ai_instructions (
  key text primary key,
  title text not null,
  description text not null,
  content text not null,
  is_custom boolean not null default false,
  updated_at timestamptz not null default now()
);
```

### 6.7 evaluation_rules

```sql
create table evaluation_rules (
  id bigserial primary key,
  rule_text text not null unique,
  source_application_id bigint null references applications(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### 6.8 audit_logs - שיפור חובה במימוש החדש

```sql
create table audit_logs (
  id bigserial primary key,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  before_json jsonb null,
  after_json jsonb null,
  created_at timestamptz not null default now()
);
```

Audit נדרש לשינוי הרשאות, מחיקה, ארכוב, שינוי Prompt, הפעלת הערכה ואישור כלל רוחבי.

## 7. חוזי API

אפשר להשתמש ב-REST או Server Actions, אך יש לשמר את החוזים הלוגיים הבאים. כל Endpoint דורש Session והרשאה.

### 7.1 Session

`GET /api/session`

```json
{
  "email": "user@example.com",
  "name": "User Name",
  "isAuthenticated": true,
  "isAllowed": true,
  "isAdmin": false
}
```

### 7.2 Dashboard bootstrap

`GET /api/recruiting`

מחזיר:

- `jobs`
- `candidates` כאשר כל שורה מייצגת מועמדות עם פרטי המועמד והמשרה
- `archivedJobs`
- `archivedApplications`
- `aiActivity`
- `aiInstructions` למנהל בלבד
- `appUsers` למנהל בלבד

במימוש חדש עדיף לפצל Endpoints ולהשתמש ב-Pagination, אך חובה לשמר את המידע וההתנהגות.

### 7.3 CRUD

- `POST /api/jobs`
- `PATCH /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `POST /api/candidates`
- `PATCH /api/candidates/:id`
- `DELETE /api/candidates/:id`
- `POST /api/applications`
- `PATCH /api/applications/:id`
- `DELETE /api/applications/:id`
- `POST /api/jobs/:id/archive`
- `POST /api/jobs/:id/restore`
- `POST /api/applications/:id/archive`
- `POST /api/applications/:id/restore`

כל כתיבה תחזיר אובייקט מעודכן או מזהה ברור. השתמש ב-Zod לאימות Body ו-Params. החזר 400 לשגיאת קלט, 401 ללא Session, 403 ללא הרשאה, 404 לחסר, 409 לכפילות ו-500 לשגיאה פנימית לא צפויה.

### 7.4 CV

- `POST /api/cv` - Multipart עם `candidateId` ו-`file`.
- `GET /api/cv/:candidateId` - Stream או Signed URL קצר-חיים.
- `GET /api/cv/:candidateId/details?mode=quick` - חילוץ כללים.
- `POST /api/cv/:candidateId/extract-ai` - חילוץ AI.

בדיקות חובה:

- MIME אמיתי ו-Signature של PDF, לא רק Extension.
- עד 10MB.
- Filename מנוקה.
- Key אקראי, לא Filename מהמשתמש.
- אין Public Bucket.
- בהחלפת קובץ: העלה חדש, עדכן DB ב-Transaction לוגי, ורק אז מחק ישן.

### 7.5 AI

- `POST /api/jobs/parse`
- `POST /api/jobs/refine`
- `POST /api/interview/summarize`
- `POST /api/evaluate`
- `POST /api/cv/ai`

כל Endpoint:

1. מאמת הרשאה.
2. מאמת אורכי קלט.
3. טוען Prompt פעיל מה-DB עם Fallback מקובץ Versioned.
4. בונה Input מפורש עם כותרות למקורות.
5. קורא ל-Responses API עם `store: false`.
6. דורש Structured Output עם JSON Schema ו-`strict: true`.
7. מאמת שוב את ה-JSON שהוחזר באמצעות Zod.
8. כותב `ai_activity_logs` גם בהצלחה וגם Log טכני מאובטח בכישלון.
9. אינו שומר Prompt מלא או קורות חיים ב-Log אפליקטיבי רגיל.

## 8. אינטגרציית OpenAI

### 8.1 משתני סביבה

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
DATABASE_URL=postgresql://app:change-me@localhost:5432/candidate_manager
AUTH_SECRET=
AUTH_TRUST_HOST=true
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_ISSUER=
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=candidate-cv
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change-me
S3_FORCE_PATH_STYLE=true
APP_OWNER_EMAIL=owner@example.com
APP_BASE_URL=http://localhost:3000
```

אין Commit של `.env.local`. יש לספק `.env.example` ללא ערכים אמיתיים.

### 8.2 Adapter

צור ממשק:

```ts
interface AiProvider {
  generateStructured<T>(args: {
    operation: string;
    instructions: string;
    input: string;
    schemaName: string;
    jsonSchema: object;
    reasoningEffort: "low" | "medium" | "high";
  }): Promise<{
    data: T;
    model: string;
    usage: { input: number; cached: number; output: number };
  }>;
}
```

כך ניתן יהיה להחליף ספק בעתיד בלי לשכתב את ה-Business Logic.

### 8.3 חישוב עלות

אל תקבע מחירים בקוד ללא Config. צור טבלת/קובץ `model-pricing.json` לפי תאריך ותן לאדמין לעדכן. החישוב:

```text
עלות = input_non_cached * input_rate
      + cached_input * cached_rate
      + output * output_rate
```

כל Rate הוא למיליון Tokens. הצג תמיד "אומדן".

## 9. כללי Prompt עסקיים שחייבים להישמר

### 9.1 הערכת מועמד

- אין לבצע Keyword Matching בלבד.
- לזהות 2-4 יכולות שהן ליבת התפקיד ולתת להן את רוב המשקל.
- תיאור משרה הוא לעיתים Wish List, לא רשימת פסילות מצטברת.
- Hard Filter רק כאשר נאמר במפורש או כאשר בלעדיו אי אפשר לבצע את ליבת התפקיד.
- להבחין בין שימוש, פיתוח, תחזוקה, Troubleshooting, תכנון ו-Ownership.
- חסר בקורות חיים אינו הוכחה לחוסר ניסיון.
- מידע חסר הוא אי-ודאות, לא פער.
- פער במוצר ספציפי אינו בהכרח פער יסודי אם יש ניסיון עמוק במערכת מקבילה.
- Production, Ownership, Troubleshooting ויכולת למידה מוכחת מקבלים משקל גבוה.
- חוות דעת מגייס היא מקור משני. מסקנות כלליות כגון "חזק" אינן Evidence.
- שכר, זמינות ומיקום אינם חלק מציון ההתאמה המקצועית.
- לפני ראיון, ההחלטה היא אם להתקדם לראיון מקצועי.
- לאחר ראיון, ההחלטה היא אם להעביר ללקוח.
- אין להמציא עובדות, שנות ניסיון, אחריות או טכנולוגיות.
- כל מסקנה חייבת להיות קשורה למקור או מסומנת כ-Inference.

סולם ציון:

- 80-100 - התאמה חזקה.
- 65-79 - התאמה טובה עם פערים ניתנים להשלמה.
- 50-64 - התאמה חלקית או גבולית.
- 35-49 - פערים מהותיים.
- 0-34 - רחוק מליבת התפקיד.

`לא רלוונטי לתפקיד` מיועד למשפחת עיסוק שונה מהותית, ולא למוצר חסר, פחות שנות ניסיון או מידע שטרם נבדק.

### 9.2 יצירת משרה

- לחלץ רק מידע שקיים.
- להפריד חובה, יתרון, דגשים מקצועיים ואישיותיים.
- לא לפתור סתירות לבד. להחזיר אותן ב-Uncertainties.
- להסיר חתימות, ברכות, פרטי קשר ורעש.
- לא להמציא Title, Client או Min Years.

### 9.3 חילוץ CV

- להסתמך רק על טקסט ה-CV.
- התפקיד והחברה הם הנוכחיים או האחרונים.
- Years Experience הוא אומדן לפי תקופות, עם אי-ודאות בעת הצורך.
- Technologies כוללת רק טכנולוגיות שמופיעות במקור.
- אין לייצר ציון או התאמה למשרה בשלב החילוץ.

### 9.4 סיכום ראיון

- לסכם מה המועמד עשה בפועל: מערכות, פעולות, עומק, אחריות ופתרון בעיות.
- להבחין בין User, Developer, Administrator, Lead ו-Architect.
- לשמר דוגמאות ממשיות ללמידה עצמית ול-Ownership.
- לתקן טעויות תמלול של שמות טכנולוגיים רק כשההקשר חד-משמעי.
- לא לתת ציון או החלטה בשלב יצירת הסיכום.
- ליצור פסקאות קצרות תחת כותרות טקסטואליות ברורות.

## 10. Authentication ו-Authorization

### 10.1 מודל

- Authentication דרך OIDC.
- Authorization דרך `app_users`.
- משתמש חייב להיות גם מחובר וגם קיים ב-Allowlist.
- `admin` יכול לנהל משתמשים ו-Prompts.
- `user` יכול לנהל משרות, מועמדים, מועמדויות והערכות.

### 10.2 כללי אבטחה

- Session Cookie: `HttpOnly`, `Secure` בייצור, `SameSite=Lax` לפחות.
- CSRF Protection לכל פעולה משנת מצב אם ה-Framework לא מספק זאת.
- Rate Limiting ל-Login ול-AI endpoints.
- Security Headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy ו-Frame-Ancestors.
- אין לסמוך על Email שמגיע מה-Client.
- בדיקת Role בכל Endpoint אדמיניסטרטיבי.
- אין להחזיר Stack Trace למשתמש.
- אין לרשום CV, Prompt עם מידע אישי או API Key בלוגים.

## 11. פרטיות ושמירת מידע

המערכת מכילה מידע אישי רגיש של מועמדים. יש להוסיף:

- מדיניות Retention ניתנת להגדרה.
- מחיקה מלאה של Candidate כולל קבצים, מועמדויות והערכות, לאחר אישור כפול.
- Export של נתוני מועמד לפי בקשה.
- הצפנה בתעבורה ובמנוחה.
- גיבוי מוצפן ל-DB ול-Object Storage.
- הפרדה בין Dev, Test ו-Production.
- נתוני בדיקה סינתטיים בלבד.
- הגדרת Data Processing מול ספק ה-AI בהתאם למדיניות הארגון.

## 12. Docker והפעלה מקומית

`docker-compose.yml` צריך להקים:

- `web` - Next.js.
- `postgres` - PostgreSQL 16 עם Volume.
- `minio` - אחסון S3-compatible עם Volume.
- `minio-init` - יצירת Bucket פרטי אם אינו קיים.

פקודות יעד:

```bash
cp .env.example .env.local
docker compose up -d postgres minio minio-init
npm ci
npm run db:migrate
npm run dev
```

פקודות נוספות:

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run build
docker compose up --build
```

ה-README חייב להסביר התקנה ב-Windows עם PowerShell וב-Windows Subsystem for Linux. אין להניח שכלי Bash זמינים ב-PowerShell.

## 13. Seed ו-Migration

- Migrations הן Append-only לאחר שהגיעו לייצור.
- אין ליצור טבלאות דינמית בכל Request.
- Seed רץ רק במפורש ורק בסביבת Development.
- חשבון Owner ראשון נוצר מ-`APP_OWNER_EMAIL` בזמן Bootstrap.
- Seed מכיל משרות ומועמדים סינתטיים בלבד.
- כלי Import אופציונלי צריך לקרוא JSON/CSV לאחר Validation ולהפיק דוח שגיאות.

## 14. העברת הנתונים מהמערכת הקיימת

המפרט אינו כולל נתונים אמיתיים. כדי להעביר אותם:

1. ייצא כל טבלה מהמערכת הקיימת בפורמט JSON או CSV.
2. ייצא את קובצי ה-CV מה-Object Storage תוך שמירת `cv_key` ומיפוי Candidate.
3. עצור כתיבות לזמן Cutover קצר או הפעל Delta Export.
4. טען בסדר הבא:
   - app_users
   - jobs
   - candidates
   - applications
   - ai_instructions
   - evaluation_rules
   - ai_activity_logs
5. העלה את הקבצים ל-Bucket החדש ועדכן Keys.
6. השווה ספירות, Foreign Keys, Hashes של קבצים ומדגם רשומות.
7. בצע Smoke Test לפני הפניית משתמשים.

אין להכניס Export של Production ל-Git או להעבירו ל-LLM.

## 15. בדיקות חובה

### 15.1 Unit

- מיפוי סטטוסים לצבעים.
- Validation לכל DTO.
- חישוב עלות Tokens.
- ניתוח Structured Output.
- הרשאות Role.
- חילוץ מהיר של CV.

### 15.2 Integration

- יצירת משרה ומועמדות.
- מניעת שיוך כפול.
- ארכוב ושחזור.
- העלאת PDF, החלפה ומחיקת הישן.
- הפעלת AI עם Provider מדומה.
- שמירת Activity Log.
- אדמין מול משתמש רגיל.

### 15.3 E2E

1. אדמין נכנס ורואה Dashboard.
2. יוצר משרה ידנית.
3. יוצר משרה מטקסט AI ומאשר טיוטה.
4. יוצר מועמד ומשייך למשרה.
5. מעלה PDF ומאשר פרטים שחולצו.
6. מפעיל הערכה לפני ראיון.
7. מזין חומר גלם לראיון, עורך ומאשר סיכום.
8. מפעיל הערכה לאחר ראיון.
9. מעתיק מייל לגיוס.
10. מגדיר פעולה הבאה.
11. מעביר מועמדות לארכיון ומשחזר.
12. אדמין משנה Prompt ומאפס לברירת מחדל.
13. משתמש רגיל אינו יכול להיכנס למסכי אדמין או ל-API שלהם.

### 15.4 Visual ו-Accessibility

- Desktop: 1440x900.
- Laptop: 1280x720.
- Mobile: 390x844.
- אין גלילה אופקית לא מכוונת.
- Tab Order תקין.
- Focus נראה.
- Labels לכל Inputs.
- Dialogs לוכדים Focus ונסגרים ב-Escape.
- יחס ניגודיות תקין.
- Zoom של 200% נשאר שמיש.

## 16. קריטריוני קבלה לשוויון פונקציונלי

העבודה אינה מסתיימת עד שכל הסעיפים הבאים נכונים:

- [ ] אפשר להיכנס דרך ספק זהות ולחסום משתמש שאינו ב-Allowlist.
- [ ] יש הפרדה בין Admin ל-User גם בשרת.
- [ ] Dashboard משקף מידע אמיתי מה-DB.
- [ ] CRUD מלא למשרות, מועמדים ומועמדויות.
- [ ] מועמד אחד יכול להיות בכמה משרות בלי שכפול פרטי האדם וה-CV.
- [ ] חיפוש, סינון וניווט עובדים.
- [ ] ארכוב ושחזור עובדים ללא אובדן נתונים.
- [ ] מחיקה לצמיתות מוגנת ומנקה גם קבצים לפי הכללים.
- [ ] PDF נשמר ב-Object Storage פרטי ומחולץ לטקסט.
- [ ] יש חילוץ מהיר וחילוץ AI עם אישור אנושי.
- [ ] יצירת משרה ועדכון משרה באמצעות AI עובדים.
- [ ] יצירת טיוטת סיכום ראיון עובדת ואינה נשמרת לפני אישור.
- [ ] הערכה לפני ראיון ולאחר ראיון מחזירה JSON תקין ומוצגת במלואה.
- [ ] משוב משתמש נכלל בהערכה מחדש.
- [ ] מייל גיוס מוכן להעתקה.
- [ ] הוראות AI ניתנות לעריכה ואיפוס על ידי Admin.
- [ ] פעילות AI וטוקנים נרשמים ועלות מוצגת כאומדן.
- [ ] אין Secrets בקוד, Bundle, Logs או Git.
- [ ] כל Migration, Test ו-Build עוברים.
- [ ] האתר שמיש בעברית RTL במחשב ובמובייל.
- [ ] README מאפשר למפתח חדש להרים את המערכת ללא ידע חיצוני.

## 17. שלבי מימוש מחייבים ל-LLM

אל תנסה לבנות הכול במהלך אחד ללא נקודות בדיקה. עבוד לפי הסדר:

### שלב 1 - Discovery ו-Plan

- בדוק אם קוד המקור זמין.
- תעד מה מועתק ומה מוחלף.
- צור `IMPLEMENTATION_PLAN.md` עם Checklist.
- אל תשנה דרישות בלי לציין זאת.

### שלב 2 - Foundation

- אתחל Repository.
- הוסף TypeScript, Lint, Formatting, Env Validation ו-Docker Compose.
- הקם PostgreSQL, MinIO ו-Migrations.

### שלב 3 - Auth ו-Data

- הטמע Login, Session, Allowlist ו-Roles.
- בנה Repositories ו-CRUD.
- הוסף Audit.

### שלב 4 - UI בסיסי

- Shell, Sidebar, Dashboard, Jobs, Candidates ו-Archive.
- Responsive ו-RTL.
- Loading ו-Error states.

### שלב 5 - CV

- Upload מאובטח.
- PDF extraction.
- Quick parsing.
- AI parsing ואישור אנושי.

### שלב 6 - AI workflows

- Provider Adapter.
- Prompts ו-JSON Schemas.
- Job Parse, Job Refine, Interview Summary ושתי הערכות.
- Activity Log ועלויות.

### שלב 7 - Admin

- Users.
- AI Instructions.
- Rules ו-Audit.

### שלב 8 - Quality

- Unit, Integration, E2E, Accessibility ו-Visual QA.
- תיקון כל Failure.
- Build Production.

### שלב 9 - Deployment ו-Operations

- Docker Image לא-Root.
- Health endpoints: `/api/health/live` ו-`/api/health/ready`.
- Backup ו-Restore מתועדים ונבדקים.
- Runbook לתקלות DB, Storage ו-OpenAI.

## 18. כללי עבודה ל-LLM בתוך VS Code

- לפני כל שינוי קרא את הקבצים הרלוונטיים ואל תנחש API קיים.
- שמור Commit קטן לכל Milestone.
- אל תחליף Dependencies קיימות ללא צורך.
- אל תשתמש ב-`any` אלא בגבול מול API חיצוני ולאחר Validation.
- אל תכתוב SQL עם String Interpolation.
- אל תעביר Secret או מידע אישי ל-Client Component.
- אל תשלח ל-AI יותר מידע מהנדרש לפעולה.
- אל תציג פיצ'ר כגמור לפני Test ידני ואוטומטי.
- אם חסר מידע מהותי, עצור ושאל שאלה ממוקדת במקום להמציא.
- בכל סוף שלב עדכן את `IMPLEMENTATION_PLAN.md`, הרץ בדיקות רלוונטיות ודווח מה עובד ומה חסר.

## 19. Prompt מוכן להפעלה ב-VS Code

העתק את הטקסט הבא ל-Agent לאחר פתיחת תיקיית הפרויקט:

```text
קרא במלואו את הקובץ tech-candidate-manager-local-rebuild-spec-he.md ופעל לפיו כמפרט המחייב של הפרויקט.

המטרה היא להקים העתק פונקציונלי מלא של מערכת ניהול והערכת המועמדים, בבעלות מלאה שלי, עם קוד מקומי, PostgreSQL, Object Storage תואם S3, Authentication, הרשאות וחיבור OpenAI.

ראשית בדוק אם קוד מקור קיים כבר בתיקייה. אם הוא קיים, אל תכתוב את המערכת מחדש: מפה את התלות ב-ChatGPT Sites והחלף אותה באמצעות Adapters תוך שימור המסכים, הטקסטים, ה-CSS, חוזי ה-API, סכמות ה-JSON והנחיות ה-AI. אם אין מקור, בנה לפי מסלול השחזור שבמפרט.

לפני כתיבת קוד:
1. סקור את כל ה-Repository.
2. צור IMPLEMENTATION_PLAN.md עם שלבים, קבצים, סיכונים וקריטריוני קבלה.
3. ציין שאלות שחוסמות החלטה. אל תשאל על בחירות שניתן להסיק בבטחה מהמפרט.
4. אל תשתמש בנתוני Production ואל תכניס Secrets ל-Git.

לאחר אישור או אם אין חסימה, בצע את העבודה בשלבים קטנים. בכל שלב:
- כתוב קוד Production-ready ולא Mock.
- הרץ Typecheck ובדיקות רלוונטיות.
- תקן שגיאות לפני מעבר לשלב הבא.
- עדכן את תוכנית העבודה.
- דווח בקצרה מה הושלם, מה נבדק ומה נשאר.

העבודה מסתיימת רק כאשר כל Checklist הקבלה במפרט מסומן, npm run build מצליח, בדיקות E2E המרכזיות עוברות, ו-README מאפשר הרמה מלאה ב-Windows/WSL וב-Docker.
```

## 20. נקודות שבהן נדרש מידע מהבעלים לפני Production

ה-LLM רשאי לפתח מקומית עם Defaults, אך אסור לו להחליט לבדו את הנושאים הבאים לפני פריסה אמיתית:

1. ספק הזהות: Google, Microsoft Entra ID או OIDC אחר.
2. יעד הפריסה: שרת פרטי, AWS, Azure, GCP או פלטפורמה מנוהלת.
3. שירות PostgreSQL בייצור.
4. שירות Object Storage בייצור.
5. Domain ו-TLS.
6. רשימת Admins ראשונית.
7. מדיניות Retention וגיבוי.
8. מודל OpenAI מאושר ותקציב.
9. האם מותר לשלוח קורות חיים וסיכומי ראיונות לספק AI מבחינת פרטיות ואבטחת מידע.
10. מקור הנתונים והליך Cutover מהמערכת הקיימת.

## 21. סיכונים ידועים ושיפורים לעומת המקור

- העתקת UI בלבד אינה העתק של המערכת. עיקר המורכבות נמצא במודל מועמד-מועמדות, CV, Prompts והרשאות.
- חיבור OpenAI ישירות מהדפדפן הוא כשל אבטחה. כל הקריאות חייבות לצאת מהשרת.
- שמירת PDF בדיסק של קונטיינר תגרום לאובדן קבצים בפריסה מחדש.
- שימוש ב-Email שמגיע מה-Client לצורך הרשאה מאפשר התחזות.
- יצירת טבלאות בזמן Request מסתירה בעיות Schema. יש להשתמש ב-Migrations.
- מחירי מודלים משתנים. חישוב עלות חייב להיות Configurable ומתוארך.
- Prompt שניתן לערוך ללא Versioning/Audit עלול לשנות החלטות גיוס בלי עקיבות.
- AI אינו מקור אמת. טיוטות דורשות אישור אנושי, וחוסר מידע חייב להישאר מסומן כחוסר מידע.
- החלטות גיוס עשויות להיות רגישות להטיה. אין להשתמש במאפיינים מוגנים ואין להסיק גיל, מוצא, מצב משפחתי או מידע רפואי.

---

סיום המפרט. אם קוד המקור זמין, הוא גובר על המפרט בפרטי UI ומימוש קיימים. המפרט גובר בנושאי אבטחה, בעלות נתונים, Migrations, Audit, בדיקות וניידות תשתיתית.
