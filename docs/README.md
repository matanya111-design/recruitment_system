# מערכת ניהול והערכת מועמדים — NAYA Tech Recruitment System

> גרסה: 2.6 | Branch: `dev` | עודכן: 25 בספטמבר 2026

## מה זה?

מערכת Web פנימית לניהול תהליכי גיוס טכנולוגי ב-NAYA. הוקמה כהעתקה מקומית מלאה של `tech-candidate-manager` שרץ על ChatGPT Sites עם Cloudflare. כל ה-Infrastructure הוחלף ב-adapters מקומיים — PostgreSQL, MinIO, iron-session.

## Stack

| שכבה | טכנולוגיה |
|---|---|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | PostgreSQL 16 via Drizzle ORM |
| Storage | MinIO (dev) / AWS S3-compatible (prod) |
| Auth | iron-session cookie + DB allowlist |
| AI | CodeMie Proxy (claude-sonnet-4-6) — כל קריאות AI ב-`reasoningEffort: medium` |
| Container | Docker Compose עם `restart: unless-stopped` |

## חיבור AI

המערכת מחוברת ל-**CodeMie Proxy** של EPAM — משתמשת בחשבון הארגוני שלך:

```
OPENAI_BASE_URL=http://127.0.0.1:4001/v1
OPENAI_API_KEY=codemie-proxy
OPENAI_MODEL=claude-sonnet-4-6
```

להחלפה ל-OpenAI ישיר — הסר את `OPENAI_BASE_URL` ושים `OPENAI_API_KEY` אמיתי.

**מעבר ל-Anthropic ישיר (עוקף את CodeMie לגמרי, על חשבונך הפרטי):**

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

`AI_PROVIDER=openai` (או השמטתו) משאיר את ההתנהגות כרגיל דרך CodeMie/OpenAI. המימוש ב-[lib/ai/provider.ts](../lib/ai/provider.ts) קורא ישירות ל-Anthropic Messages API (`tool_choice` מאולץ לפי ה-JSON Schema) — אין תלות ב-CodeMie במצב הזה.

**הערת תאימות:** Claude דרך Bedrock/LiteLLM אינו תומך ב-`minimum`/`maximum` על `integer` ב-JSON Schema strict. כל ה-schemas בפרויקט כבר תוקנו.

## מה הוחלף לעומת המקור

| מקור (ChatGPT Sites) | כאן |
|---|---|
| Cloudflare D1 (SQLite) | PostgreSQL 16 |
| Cloudflare R2 | MinIO / S3 |
| `oai-authenticated-user-email` header | iron-session cookie + allowlist |
| `vinext` / `wrangler` build | `next build` רגיל |
| `cloudflare:workers` env | `process.env` |

## מבנה הפרויקט

```
recruitment_system/
├── app/                        # Next.js App Router
│   ├── api/                    # כל ה-API Routes
│   │   ├── auth/               # login / logout
│   │   ├── session/            # GET מידע משתמש
│   │   ├── recruiting/         # CRUD ראשי (jobs/candidates/applications)
│   │   ├── cv/                 # העלאת PDF + חילוץ
│   │   │   └── ai/             # חילוץ AI
│   │   ├── evaluate/           # הערכת AI ייעוצית (pre + post interview, streaming) — לא קובעת החלטה
│   │   │   ├── chat/           # שיח הבהרה על ההערכה/המלצה (mode-aware: pre/post)
│   │   │   ├── questions/      # שאלות המשך לראיון, נגזרות מהערכה לפני ראיון
│   │   │   └── decision/       # שמירת ההחלטה של המגייס + יצירת מייל גיוס + זיהוי אוטומטי של תובנה
│   │   ├── engine-rule/        # שילוב חכם (propose/apply) של כלל שנלמד לתוך פרומפט קיים
│   │   ├── interview/summarize/ # סיכום ראיון AI
│   │   ├── interview/extract-text/ # חילוץ טקסט מקובץ תמלול (.docx/.pdf) שהועלה
│   │   ├── jobs/parse/         # יצירת משרה מטקסט חופשי באמצעות AI
│   │   ├── jobs/refine/        # עדכון משרה קיימת לפי מידע חדש (תמלול, מייל)
│   │   ├── jobs/scan-candidates/ # סריקת כל מועמדי המאגר מול משרה — מחזיר ציון+הסבר לכל אחד
│   │   ├── ai-chat/            # המשך שיח עם AI על מייל גיוס של מועמד ספציפי
│   │   ├── ai-general/         # שאילתות AI חופשיות על נתוני המערכת
│   │   ├── team/               # CRUD ניהול עובדי צוות
│   │   │   ├── meetings/       # פגישות 1:1 — שמירה, סיכום AI, ניתוח, matching
│   │   │   ├── run-insight/    # סקירת AI מלאה (server-side, parallel, DB-saved)
│   │   │   ├── extract-profile/ # חילוץ פרופיל עובד מטקסט גולמי
│   │   │   └── promote-to-candidate/ # קידום עובד כמועמד — יוצר כרטיס מועמד + שיוך למשרות
│   │   └── health/             # live + ready health checks
│   ├── page.tsx                # SPA React (UI מלא)
│   ├── layout.tsx              # HTML root
│   └── globals.css             # כל ה-CSS (RTL, components)
│
├── db/                         # Database layer
│   ├── schema.ts               # Drizzle schema (8 טבלאות; team_members/team_meetings מנוהלות בנפרד — ראו "מסד הנתונים")
│   ├── client.ts               # PostgreSQL connection pool
│   └── migrations/             # SQL migrations (Drizzle Kit)
│
├── lib/                        # Business logic
│   ├── ai/                     # AI provider, prompts, schemas
│   │   ├── provider.ts         # Dual-mode adapter: CodeMie/OpenAI proxy או Anthropic ישיר (AI_PROVIDER), stream + non-stream
│   │   ├── evaluation-prompt.ts # פרומפטים הערכת מועמד (NAYA context) + שאלות ראיון + שיח הבהרה
│   │   ├── prompts.ts          # פרומפטים: CV, Job, Interview Summary
│   │   ├── team-prompts.ts     # פרומפטים: פגישות, team_insight (matching+ניתוח ממוזג), חילוץ פרופיל
│   │   ├── instructions.ts     # 19 instructionDefinitions (מפתח/כותרת/trigger/group, ניתנים לעריכה מ-Admin)
│   │   ├── prompt-defaults.ts  # PROMPT_DEFAULTS — מקור אמת יחיד לברירת המחדל של כל פרומפט
│   │   ├── get-prompt.ts       # getPrompt(key, fallback) — שליפת override מה-DB, בשימוש בכל route
│   │   ├── recruitment-email-prompt.ts  # מייל גיוס לפני/אחרי ראיון — רק לאחר החלטת המגייס
│   │   ├── rule-merge-prompt.ts         # שילוב חכם של כלל שנלמד לתוך פרומפט הערכה קיים
│   │   └── disagreement-insight-prompt.ts # זיהוי אוטומטי של תובנה כשההחלטה סותרת את המלצת ה-AI
│   ├── auth/                   # Authentication
│   │   ├── session.ts          # iron-session config
│   │   ├── identity.ts         # requireAppIdentity / requireAdmin
│   │   └── bootstrap.ts        # יצירת owner + AI instructions בהפעלה
│   ├── storage/
│   │   └── client.ts           # S3/MinIO adapter
│   └── audit.ts                # כתיבת audit_logs
│
├── db/migrations/              # SQL migrations (Drizzle Kit)
├── scripts/                    # כלי פיתוח
│   ├── migrate.ts              # הרצת DB migrations
│   ├── import-export.ts        # Import מ-JSON export של המקור
│   └── start-docker.ps1        # הפעלת Docker אוטומטית עם Windows
│
├── docs/                       # תיעוד
│   ├── README.md               # מסמך זה
│   ├── spec-he.md              # מפרט מקורי מלא (עברית)
│   └── starting_command.md     # הוראות הפעלה יומיומיות (CodeMie proxy + Docker + dev)
│
├── docker-compose.yml          # postgres + minio + minio-init + web (restart: unless-stopped)
├── Dockerfile                  # Multi-stage build (non-root)
├── .env.example                # Template למשתני סביבה
└── .env.local                  # ערכים מקומיים (לא ב-Git)
```

## הקמה מאפס (Windows PowerShell)

### דרישות
- Node.js 22+
- Docker Desktop

### שלבים

```powershell
# 1. כנס לתיקיית הפרויקט
cd C:\Users\MatanyaVinograd\my_project\recruitment_system

# 2. העתק קובץ משתני הסביבה ומלא ערכים
Copy-Item .env.example .env.local
# ערוך .env.local — ראה סעיף "משתני סביבה" למטה

# 3. התקן תלויות
npm install

# 4. הרם PostgreSQL ו-MinIO
docker compose up -d postgres minio minio-init

# 5. הרץ migrations
npm run db:migrate

# 6. (אופציונלי) ייבא נתונים מ-export קיים
npx tsx scripts/import-export.ts path\to\export.json

# 7. הפעל בפיתוח
npm run dev
# פתח: http://localhost:3000
```

### הקמה ב-Docker מלא (production)

```powershell
docker compose up --build
```

### הפעלה אוטומטית עם Windows

Docker Desktop רשום ב-Windows Startup. בנוסף, קובץ `start-recruitment-docker.vbs` נמצא בתיקיית ה-Startup של Windows ומריץ `docker compose up -d` אוטומטית 20 שניות לאחר כניסה למחשב.

## משתני סביבה

ערוך את `.env.local`:

| משתנה | סטטוס | הסבר |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://app:change-me@localhost:5432/candidate_manager` |
| `SESSION_SECRET` | ✅ | נוצר אקראי (32 bytes hex) |
| `APP_OWNER_EMAIL` | ✅ | `Matanya_Vinograd@epam.com` |
| `OPENAI_API_KEY` | ✅ | `codemie-proxy` (CodeMie local proxy) |
| `OPENAI_BASE_URL` | ✅ | `http://127.0.0.1:4001/v1` (CodeMie proxy endpoint) |
| `OPENAI_MODEL` | ✅ | `claude-sonnet-4-6` |
| `S3_ENDPOINT` | ✅ | `http://localhost:9000` (MinIO) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | ⚠️ שנה ב-Production | ב-dev: `minioadmin` / `change-me` |
| `DATABASE_URL` password | ⚠️ שנה ב-Production | כרגע `change-me` |

**להחלפה ל-OpenAI ישיר:** הסר את `OPENAI_BASE_URL`, שנה `OPENAI_API_KEY` למפתח אמיתי, שנה `OPENAI_MODEL` ל-`gpt-4.1` או `o3`.

## פקודות שימושיות

```powershell
npm run dev          # פיתוח עם HMR
npm run build        # בניית Production
npm run typecheck    # TypeScript ללא הרצה
npm run db:generate  # יצירת migration מ-schema
npm run db:migrate   # הרצת migrations
```

## מסד הנתונים — טבלאות

### מנוהלות ב-Drizzle (`db/schema.ts` + `db/migrations/`)

| טבלה | תפקיד | שדות מרכזיים לתשומת לב |
|---|---|---|
| `app_users` | Allowlist משתמשים + roles (admin/user) | `email` (PK), `role` |
| `jobs` | משרות — דרישות, לקוח, סטטוס, טכנולוגיות | `must_requirements`, `preferred_requirements`, `technologies` (jsonb), `hiring_manager_emphasis` (עדיפות עליונה בהערכה — ראו "יכולות המערכת"), `archived` |
| `candidates` | מועמדים — פרטים, קורות חיים, חוות דעת מגייס | `cv_extracted_text`, `cv_extraction_status`, `archived` |
| `applications` | שיוך מועמד↔משרה: סטטוס, ראיון, הערכות, החלטת המגייס | ראה פירוט מתחת לטבלה |
| `ai_activity_logs` | יומן כל קריאות AI — מודל, טוקנים, עלות | נטען **במלואו** (ללא הגבלת שורות) בטאב "פעילות AI ועלויות"; דפדוף בצד לקוח, 50 בעמוד |
| `ai_instructions` | 19 פרומפטים ניתנים לעריכה ע"י Admin (`instructionDefinitions`) | `key` (PK), `content`, `is_custom` |
| `evaluation_rules` | **Legacy** — מנגנון ישן ל"כללי כיול רוחביים" שהוזרקו אוטומטית לכל הערכה. הוחלף (ספטמבר 2026) במנגנון שמוסיף כלל מאושר ישירות לתוכן הפרומפט הרלוונטי ב-`ai_instructions`. נשארה בסכימה לצורך היסטוריה בלבד, קוד הייצור לא קורא ממנה יותר | — |
| `audit_logs` | Audit trail לפעולות רגישות (מחיקת משתמש, אישור/דחיית כלל וכו') | `actor_email`, `action`, `before_json`/`after_json` |

**עמודות `applications` הנוגעות להערכה** (עודכן ספטמבר 2026 — ראה "הערכת מועמד" תחת "יכולות המערכת" למטה לפרדיגמה המלאה: **ה-AI מייעץ, המגייס מחליט**):

| קבוצה | עמודות | תפקיד |
|---|---|---|
| "סטטוס נוכחי" (dashboard-wide) | `score`, `recommendation`, `evaluation_type`, `evaluation_date`, `evaluation_json` | `recommendation` נכתב **רק** כשהמגייס שומר החלטה (לא ע"י ה-AI); `score` אינו נכתב יותר לאף הערכה חדשה (אין ציון AI במודל הנוכחי, נשאר `NULL`). משמש למסכי סיכום (רשימת מועמדים, ספירת "התאמה" למשרה) |
| הערכה לפני ראיון (AI, ייעוצי) | `pre_evaluation_json` (כולל `ai_recommendation`, `requirement_match_summary`), `pre_evaluation_date` | נכתבות **רק** כשרצה הערכה במצב `pre`; אף פעם לא נדרסות ע"י הרצת "אחרי ראיון". הרצה מחדש **מאפסת** גם את `pre_human_decision*` (ראו שורה הבאה) — ההחלטה הישנה כבר לא תואמת את ההשוואה החדשה |
| החלטת המגייס — לפני ראיון | `pre_human_decision`, `pre_human_decision_reason`, `pre_human_decision_date`, `pre_recommendation` | ההחלטה **היחידה** שקובעת המשך תהליך ומייל גיוס — לעולם לא נכתבת ע"י ה-AI, רק דרך `/api/evaluate/decision` |
| הערכה לאחר ראיון (AI, ייעוצי) | `post_evaluation_json` (כולל `ai_recommendation`, `requirement_match_summary`), `post_evaluation_date` | אותו עיקרון כמו לפני ראיון, עצמאי לגמרי ממנה |
| החלטת המגייס — לאחר ראיון | `post_human_decision`, `post_human_decision_reason`, `post_human_decision_date`, `post_recommendation` | אותו עיקרון — נכתבת רק דרך `/api/evaluate/decision` |
| כלל שנלמד (ידני או אוטומטי) | `proposed_engine_rule`, `proposed_engine_rule_key`, `engine_rule_status` | `proposed_engine_rule_key` שומר לאיזה מפתח ב-`ai_instructions` (`candidate_evaluation` / `post_interview_evaluation`) הכלל שייך. נוצר משני מקורות: משוב מקצועי חופשי בשיח, **או** אוטומטית כשההחלטה שנשמרה סותרת את המלצת ה-AI (ראה "למידה ממשוב" למטה) |

### מנוהלות ב-SQL גולמי בתוך ה-route (לא ב-Drizzle schema!)

| טבלה | תפקיד | נוצרת ע"י |
|---|---|---|
| `team_members` | עובדי צוות — `name`, `notes` (פרופיל חופשי), `role`, `client`, `naya_start_date`, `next_step_summary`, `target_job_ids`/`actions` (לא בשימוש בממשק כיום), `ai_insight` (jsonb, נשמר מ"הפעל סקירת AI") | `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ב-[app/api/team/route.ts](../app/api/team/route.ts) |
| `team_meetings` | פגישות 1:1 — `member_id` (FK), `raw_transcript`, `summary`, `action_items` (jsonb), `meeting_date` | אותו מנגנון, גם ב-[app/api/team/meetings/route.ts](../app/api/team/meetings/route.ts) ו-[run-insight/route.ts](../app/api/team/run-insight/route.ts) |

> **הערה ארכיטקטונית**: שתי הטבלאות האלה לא מוגדרות ב-`db/schema.ts` ולא מופיעות ב-migrations — כל route שנוגע בהן מריץ `CREATE TABLE IF NOT EXISTS` בעצמו. זה עובד, אבל שונה מהדפוס של שאר המערכת (Drizzle + migrations); כדאי לדעת את זה לפני שמחפשים אותן בסכימה.

## לוחות הניווט

| טאב | מה עושים שם |
|---|---|
| לוח בקרה | סטטוס כללי, משימות פתוחות, מועמדים אחרונים |
| משרות | רשימה עם מיון לפי כל שדה, יצירה ידנית / מ-AI |
| מועמדים | רשימה עם מיון לפי כל שדה, חיפוש וסינון |
| מועמד (דף פנימי) | סדר הטאבים: סקירה / קורות חיים / **הערכה לפני ראיון** / סיכום ראיון / **הערכה לאחר ראיון** — שני טאבי ההערכה עצמאיים לגמרי זה מזה. בכל טאב הערכה: השוואת AI ייעוצית → תיבת "ההחלטה שלך" (חובה למלא כדי שייווצר מייל גיוס) |
| ארכיון | משרות ומועמדויות מורדות עם סיבת דחייה, שחזור |
| מדריך | הסבר מעשי על זרימת העבודה (מעודכן) |
| פעילות AI | יומן **כל** קריאות AI מאז ומעולם + עלות/טוקנים כוללים על כל ההיסטוריה, מיון לפי כל שדה, דפדוף 50 בעמוד |
| שאילתות AI | שאל כל שאלה על המערכת |
| ניהול צוות | טבלה ממוינת (שם, תפקיד, לקוח נוכחי, ותק, סיכום להמשך, פגישה אחרונה, עדכון AI) — לחיצה על שורה פותחת: ציר זמן פגישות, פגישה חדשה + AI summary, התאמת משרות + ניתוח AI במסך אחד (`team_insight`, שמור ב-DB), **קידום כמועמד** |
| משתמשים | Admin בלבד — allowlist ותפקידים, "הסרת כולם חוץ ממני" |
| הוראות AI | Admin בלבד — 19 פרומפטים ניתנים לעריכה ואיפוס, מקובצים לפי אזור באתר (מועמדים / משרות / ניהול צוות / שאילתות כלליות) עם סרגל צד נדבק (sticky) |

## יכולות המערכת — פירוט מלא

### משרות

- **יצירה ידנית** או **מטקסט חופשי באמצעות AI** (מייל, תיאור רשמי, הבהרות בעל פה) — `job_parsing`.
- **דגשי מנהל מגייס**: אם הטקסט מייחס במפורש דברים למנהל המגייס בצד הלקוח (ציטוט ישיר, "המנהל אמר ש..."), הם מופרדים לשדה `hiring_manager_emphasis` משלהם — מוצג בכרטיס מודגש (רקע/מסגרת כתומים) בראש עמוד המשרה, לפני התיאור. השדה הזה מקבל **עדיפות עליונה** בכל הערכת מועמד מול המשרה — כמעט כדרישת חובה מיוחדת, מעל דרישות חובה רגילות ומעל דגשים מקצועיים/אישיותיים כלליים. אפשר גם למלא אותו ידנית בטופס העריכה.
- **ניתוח והצעת עדכונים** למשרה קיימת לפי מידע חדש (למשל תמלול שיחה עם מנהל מגייס) — מציג את השינויים המוצעים לאישור לפני שמירה, כולל עדכון דגשי מנהל המגייס — `job_refine`.
- **סריקת מועמדים קיימים** מול משרה נתונה — סורק את **כל** מאגר המועמדים (כולל מועמדים בארכיון, כי סגירת תהליך במשרה אחת לא אומרת שהם לא מתאימים למשרה הזו) **וגם** את כל עובדי הצוות הפנימיים (כמועמדים פוטנציאליים למעבר תפקיד), ומחזיר לכל אחד ציון, `fit_label`, שורה תחתונה, חוזקות ופערים — `candidate_scan`. גם כאן דגשי מנהל המגייס, אם קיימים, מקבלים עדיפות עליונה. תוצאה שכבר מקושרת למשרה (פעיל/בארכיון) מסומנת בהתאם.
- **עמודת "התאמה" אחת** (לא "גבוהה"/"סבירה" בנפרד) — נספרת אוטומטית לכל משרה מתוך החלטות המגייס בפועל על המועמדים המקושרים (לא מתוך ציון AI, שכבר לא קיים).
- ארכוב ושחזור משרה.

### מועמדים — ניהול בסיסי

- יצירה ידנית או קידום מעובד צוות קיים (ראו "ניהול צוות" למטה).
- העלאת קורות חיים (PDF) ל-MinIO/S3, חילוץ טקסט (pdfjs), ו**חילוץ פרטי מועמד אוטומטי באמצעות AI** (שם, תפקיד, חברה, ותק, טכנולוגיות, תקציר בעברית) — `cv_extraction`.
- שיוך מועמד למשרה חדשה מבטל אוטומטית ארכוב קיים של המועמד/המועמדות (כדי שלא "ייעלמו" מרשימות שמסננות `archived=false`).
- דחייה עם סיבה / הפסקת תהליך — עובר אוטומטית לארכיון; שחזור מהארכיון מבטל גם את ארכוב המועמד אם היה.

### הערכת מועמד — לפני ואחרי ראיון (ה-AI מייעץ, המגייס מחליט)

**פרדיגמה (עודכן ספטמבר 2026)**: ה-AI **לעולם לא קובע** אם המועמד עובר או לא — הוא רק משווה, מסכם באחוזים ומייעץ. ההחלטה בפועל, ורק היא, נכנסת לתהליך וגוררת יצירת מייל גיוס.

- **הערכה לפני ראיון** (`candidate_evaluation`) — טבלת התאמה מול דרישות המשרה (`fit_table`, עם `fit_level`/`materiality`/`completable_by_naya` לכל שורה), `requirement_match_summary` (אחוזים: כמה דרישות הן התאמה מלאה / חלקית / לא ברור / אין התאמה), ו-`ai_recommendation`+`ai_recommendation_reason` — **המלצה בלבד** ("לזמן לראיון פנימי" / "בירור קצר לפני ראיון מומלץ" / "לא לקדם למשרה זו").
- **הערכה לאחר ראיון** (`post_interview_evaluation`) — אותו עיקרון: `strengths`/`gaps`/`uncertainties`/`executive_summary`, `requirement_match_summary`, ו-`ai_recommendation` בינארי ("להעביר ללקוח"/"לא להעביר ללקוח") — גם כאן המלצה בלבד, כולל כיול מול ההחלטה (לא המלצת ה-AI!) שכבר נשמרה לפני ראיון, אם הייתה.
- **ההחלטה שלך** — תיבה ייעודית בכל טאב הערכה: בחירה בינארית + נימוק חובה, נשמרת דרך `POST /api/evaluate/decision`. זו ההחלטה היחידה שמשפיעה על סטטוס המועמדות ומייל הגיוס — לא המלצת ה-AI.
- **מייל הגיוס נוצר רק אחרי שמירת החלטה**, ולא כחלק מהערכת ה-AI המקורית:
  - *לפני ראיון* (`pre_recruitment_email`) — מייל קצר, מבוסס אך ורק על ההחלטה והנימוק שהזנת.
  - *לאחר ראיון* (`post_recruitment_email`) — מייל **ארכיוני מלא** (נשמר בתיבות החברה לטווח ארוך): כותרות עם בולטים, לפי הסדר — היבט אישיותי → היבט מקצועי (כולל רשימת **כל** הטכנולוגיות שעלו בראיון ומופיעות בפרופיל המועמד) → התאמה למשרה → שורה תחתונה עם ההחלטה. זה תמיד כלול, בלי קשר אם ההחלטה חיובית או שלילית.
- שתי ההערכות **עצמאיות לגמרי** בבסיס הנתונים — הרצת אחת **לעולם לא דורסת** את השנייה. **הרצת הערכה מחדש כן מאפסת** את ההחלטה השמורה **לאותו שלב בלבד** (כולל המייל, שנעלם עד החלטה חדשה) — כי ההחלטה הישנה כבר לא מבוססת על ההשוואה החדשה.
- הרצה עם **streaming** — מציג התקדמות חיה (איזה שדה ה-AI כותב כרגע) במקום מסך ריק לאורך 1-3 דקות.
- **שיח הבהרה על הערכה קיימת** (`evaluation_chat`) — דנים בהמלצת ה-AI ("למה הגעת למסקנה הזו"), לא בהחלטה; לא משנה שום דבר שמור בפועל.
- **למידה ממשוב — שני מסלולים** (ראו טבלה ייעודית למטה): משוב חופשי בשיח, או זיהוי אוטומטי כשההחלטה שלך סותרת את המלצת ה-AI.
- **שיח עריכת מייל גיוס** (`email_chat`) — עריכה חופשית בשיחה של מייל הגיוס; מתאפס אוטומטית לתוכן העדכני בכל פעם שנוצר מייל חדש (לפי הערכה חדשה או החלטה חדשה) — לא נשאר "תקוע" על נוסח ישן.
- אפשרות **לקבל עד 5 שאלות המשך לראיון** (`interview_questions`), גזורות מהערכת ה-AI לפני הראיון.

### סיכום ראיון

- הדבקת תמלול/הערות גולמיות, או **העלאת קובץ** `.docx` (mammoth) / `.pdf` (unpdf) עם חילוץ טקסט אמיתי (לא Placeholder).
- **טיוטת סיכום באמצעות AI** (`interview_summary`) מתוך החומר הגולמי, לאישור/עריכה ידנית לפני שמירה.
- **שימוש חוזר בחומר גלם של ראיון** בין משרות לאותו מועמד/ת (`interview_raw_material` נשמר בנפרד מהסיכום המאושר).

### ניהול צוות (עובדים פנימיים)

- **תצוגה טבלאית** (עודכן ספטמבר 2026, קודם הייתה רשימת כרטיסים מתקפלת) — עמודות: שם, תפקיד, לקוח נוכחי, ותק בנאיה (מחושב חי מתאריך הצטרפות, לא נשמר כערך קבוע), סיכום להמשך, פגישה אחרונה (מחושב מציר הזמן), עדכון AI אחרון — כל העמודות ניתנות למיון. לחיצה על שורה פותחת מתחתיה את אותו תוכן מורחב שהיה קודם בכרטיס (סיכום/ציר זמן/פגישה חדשה/AI/קידום), בלי לאבד פונקציונליות.
- **חילוץ שדות מובנים אוטומטי** (`team_extract_profile`) — בכל בניית/עיצוב פרופיל מטקסט גולמי, ה-AI מנסה לחלץ גם תפקיד, לקוח נוכחי, תאריך הצטרפות לנאיה וסיכום להמשך מתוך הטקסט — רק אם הם מצוינים במפורש, אחרת משאיר ריק (לא מנחש). ממלא רק שדות שעדיין ריקים בטופס, כדי לא לדרוס עריכה ידנית.
- **פגישות 1:1** — שמירת תמלול/הערות + **סיכום AI** (`team_meeting_summary`) + action items, על ציר זמן לכל עובד.
- **התאמת משרות + ניתוח מקצועי במסך אחד** (`team_insight`) — בקריאת AI אחת: אילו משרות פעילות מתאימות, חוזקות/פערים, המלצת קידום וצעדים הבאים; נשמר ב-DB (`ai_insight`) כדי לא להריץ שוב בכל טעינה.
- **קידום עובד למועמד** (`team_promote`) — יוצר כרטיס מועמד מלא מפרופיל העובד + סיכומי הפגישות, ומשייך אותו למשרות שנבחרו.

### AI ותפעול

- **שני ספקי AI** מוחלפים בסביבת משתנה אחד (`AI_PROVIDER`): CodeMie/OpenAI proxy (ברירת מחדל) או **Anthropic ישיר** על חשבון פרטי — ראו "חיבור AI" למעלה.
- **19 פרומפטים ניתנים לעריכה** מ-Admin, כל אחד עם `trigger` (איפה בדיוק מפעילים אותו) ו-`group` (איזה אזור באתר) — מוצגים בטאב "הוראות AI" בסרגל צד מקובץ ונדבק, עם אפשרות איפוס לברירת מחדל.
- **שילוב חכם של כלל שנלמד** (`engine_rule_merge`) — במקום להוסיף טקסט בסוף פרומפט, ה-AI משלב את הכלל בתוך ההקשר הרלוונטי בפרומפט הקיים (פותר סתירות עם הנחיות קיימות), ומציג "מה ישתנה ולמה" + אפשרות לדון ולחדד לפני שהשינוי נשמר בפועל.
- **יומן פעילות AI מלא**: כל קריאה נרשמת (`ai_activity_logs`) עם מודל, טוקנים (כולל cache), עלות משוערת; הטאב מציג טוטאלים על **כל ההיסטוריה** ולא רק על חלק ממנה, עם דפדוף 50 בעמוד וניתן למיון לפי כל עמודה.
- **שאילתות AI כלליות** (`general_ai`, עודכן ספטמבר 2026) — שאלה חופשית מעמוד ייעודי, עם **גישה מלאה לכל טבלה במערכת**: משרות ומועמדויות (כולל ארכיון), צוות פנימי ופגישות, **תוכן מלא של כל 19 הפרומפטים**, פעילות ועלויות AI (סה"כ + פילוח לפי מודל), משתמשי המערכת, ויומן ביקורת. לכל טבלה שעלולה לגדול יש גם ספירת COUNT/SUM אמיתית מה-DB בנפרד מרשימת הפירוט, כדי שתשובות "כמה" יהיו מדויקות גם כשהרשימה המפורטת חתוכה מטעמי אורך.

### הרשאות ומשתמשים

- Allowlist מבוסס מייל + role (`admin`/`user`) ב-`app_users`, נבדק ב-iron-session cookie.
- Admin יכול לנהל משתמשים ("הסרת כולם חוץ ממני") ולערוך פרומפטי AI.
- Audit trail (`audit_logs`) לפעולות רגישות: אישור/דחיית כלל שנלמד, ניהול משתמשים.

## זרימת עבודה — מועמד בתהליך

```
משרה פעילה (כולל דגשי מנהל מגייס, אם יש)
    ↓
יצירת מועמד + שיוך למשרה
    ↓
העלאת PDF → חילוץ טקסט → אישור פרטים
    ↓
הערכה לפני ראיון (AI) → השוואת דרישות + אחוזי התאמה + המלצה (לא החלטה)
    ↓
ההחלטה שלך (לזמן לראיון פנימי / לא לקדם) + נימוק → נוצר מייל גיוס
    ↓ (אם ההחלטה: לזמן לראיון)
תמלול ראיון (הדבקה / קובץ .docx/.pdf) → AI מכין טיוטה → אישור סיכום
    ↓
הערכה לאחר ראיון (AI) → אותו עיקרון: השוואה + אחוזים + המלצה (לא החלטה)
    ↓
ההחלטה שלך (להעביר ללקוח / לא להעביר) + נימוק → נוצר מייל גיוס ארכיוני מלא
    ↓
עדכון סטטוס:
  • התקבל / הועבר ללקוח — נשאר פעיל
  • נדחה + סיבה — מועבר לארכיון אוטומטית (נשאר במשרות אחרות)
  • הפסיק תהליך + סיבה — מועבר לארכיון
```

> **חשוב**: "הערכה לפני ראיון" ו"הערכה לאחר ראיון" הן שתי פעולות **עצמאיות** — כל אחת נשמרת בעמודות ה-DB הייעודיות שלה ולא דורסת את השנייה. אפשר להריץ "הערכה לפני ראיון" בכל שלב (גם אם כבר יש הערכה לאחר ראיון שמורה) בלי לאבד את ההערכה שלאחר ראיון, ולהפך. **אבל** הרצה מחדש של הערכה כלשהי כן מאפסת את ההחלטה שכבר נשמרה **לאותו שלב** — כי היא הוסקה מהשוואה שכבר הוחלפה.

## פרומפטים AI (19 סה"כ, ניתנים לעריכה מ-Admin)

כל הפרומפטים מוגדרים ב-[lib/ai/instructions.ts](../lib/ai/instructions.ts) (`instructionDefinitions` — מפתח, כותרת, תיאור, מי מפעיל אותו, קבוצה בטאב "הוראות AI") וברירת המחדל של כל אחד ב-[lib/ai/prompt-defaults.ts](../lib/ai/prompt-defaults.ts) (`PROMPT_DEFAULTS`, מקור אמת יחיד — כל ה-routes וגם ה-bootstrap קוראים ממנו, כדי שלא ייווצרו כמה עותקים לא-מסונכרנים של אותו פרומפט). כל route קורא לפרומפט שלו דרך [lib/ai/get-prompt.ts](../lib/ai/get-prompt.ts) (`getPrompt(key, fallback)`), כך שעריכה בטאב "הוראות AI" משפיעה מיד על ההרצה הבאה.

| קבוצה בטאב "הוראות AI" | מפתח | תפקיד |
|---|---|---|
| מועמדים | `candidate_evaluation` | השוואת דרישות המשרה מול המועמד לפני ראיון — **ייעוץ בלבד**, לא החלטה (`ai_recommendation` + `requirement_match_summary`) |
| מועמדים | `post_interview_evaluation` | ניתוח הראיון מול דרישות המשרה — **ייעוץ בלבד** אם להעביר ללקוח |
| מועמדים | `pre_recruitment_email` | מייל גיוס לפני ראיון — מנוסח אך ורק לפי ההחלטה והנימוק שהמגייס הזין |
| מועמדים | `post_recruitment_email` | מייל גיוס ארכיוני מלא לאחר ראיון — פירוט מקצועי+אישיותי מלא (תמיד) + החלטת המגייס בסיום |
| מועמדים | `interview_questions` | עד 5 שאלות המשך לראיון, נגזרות מהערכה לפני ראיון קיימת |
| מועמדים | `evaluation_chat` | שיח הבהרה על המלצת ה-AI ("למה הגעת למסקנה הזו") — לא משנה את ההערכה |
| מועמדים | `email_chat` | שיח חופשי לעריכת מייל הגיוס שנוצר לאחר ההחלטה |
| מועמדים | `engine_rule_merge` | משלב כלל שנלמד (ידני או אוטומטי) בתוך תוכן פרומפט ההערכה הקיים, בעדינות ולא כתוספת בסוף |
| מועמדים | `disagreement_insight` | אוטומטי: בכל שמירת החלטה שסותרת את המלצת ה-AI, בוחן בזהירות אם יש תובנה כללית ראויה ללמידה (ברירת מחדל: אין) |
| מועמדים | `cv_extraction` | חילוץ פרטי מועמד ותקציר מקורות חיים |
| מועמדים | `interview_summary` | סיכום ראיון מתמלול/הערות גולמיות |
| משרות | `job_parsing` | יצירת משרה מטקסט חופשי, כולל הפרדת דגשי מנהל מגייס לשדה ייעודי |
| משרות | `job_refine` | ניתוח והצעת עדכונים למשרה קיימת לפי מידע חדש |
| משרות | `candidate_scan` | סריקת כל מאגר המועמדים (כולל ארכיון + עובדי צוות פנימיים) מול משרה נתונה |
| ניהול צוות | `team_meeting_summary` | סיכום פגישת 1:1 עם עובד |
| ניהול צוות | `team_insight` | התאמת משרות פעילות + ניתוח מקצועי (חוזקות/פערים/המלצת קידום) — קריאת AI אחת ממוזגת (עד ספטמבר 2026 היו שני פרומפטים נפרדים: `team_job_match` + `team_member_analysis`) |
| ניהול צוות | `team_extract_profile` | בניית פרופיל עובד מטקסט גולמי, כולל חילוץ תפקיד/לקוח נוכחי/תאריך הצטרפות/סיכום להמשך כשהם מצוינים במפורש |
| ניהול צוות | `team_promote` | בניית כרטיס מועמד מלא מפרופיל עובד + סיכומי פגישות |
| שאילתות AI כלליות | `general_ai` | מענה חופשי, עם גישה מלאה לכל טבלאות המערכת (כולל ארכיון, פרומפטים, פעילות AI, משתמשים, audit log) — לא רק משרות/מועמדים |

### למידה ממשוב — שני מסלולים, אותו מנגנון סקירה

שני המסלולים מזינים את אותם שדות (`proposed_engine_rule`, `proposed_engine_rule_key`, `engine_rule_status`) ומופיעים באותו כרטיס בכרטיס המועמד — "הצעה לעדכון פרומפט ההערכה", בתחתית לשונית ההערכה (לפני/אחרי ראיון) שבה זה קרה:

1. **ידני** — מריצים הערכה עם משוב מקצועי חופשי (`reviewerFeedback`) בשיח, וה-AI מזהה שהתיקון כללי (`generalizable_feedback`).
2. **אוטומטי** (`disagreement_insight`, חדש ספטמבר 2026) — בכל שמירת החלטה: אם ההחלטה שלך סותרת סתירה אמיתית את המלצת ה-AI (לא כולל "בירור קצר מומלץ" ההססני), מופעלת קריאת AI זהירה שבודקת אם יש כאן דפוס כללי. ברירת המחדל היא **שאין** תובנה — רוב המקרים נקודתיים.

**מה קורה בכרטיס ההצעה** (בשני המסלולים):
- **דחייה** — ההצעה נזרקת, שום דבר לא משתנה.
- **הצג הצעת שינוי** (`engine_rule_merge`) — ה-AI מציע כיצד **לשלב** את הכלל בתוך תוכן הפרומפט הקיים (`candidate_evaluation` או `post_interview_evaluation`, לפי `proposed_engine_rule_key`) — לא להוסיף בסוף, אלא לשלב בהקשר הרלוונטי ולפתור סתירות עם הנחיות קיימות. מוצגת רשימת "מה ישתנה ולמה" + תצוגה מלאה של הפרומפט המוצע, ואפשר לדון ולחדד בשיח לפני שמאשרים.
- **אישור והטמעה** — רק אז השינוי נשמר בפועל (`is_custom=true`). איפוס לברירת מחדל של אותו פרומפט ימחק גם כלל שהוטמע כך.

> **היסטוריה**: עד ספטמבר 2026 המנגנון היה שונה פעמיים — קודם טבלה נפרדת (`evaluation_rules`) שהוזרקה אוטומטית כתוספת נסתרת לכל הערכה; אחר כך הוחלף בהוספה ישירה לסוף הפרומפט; ולבסוף (המצב הנוכחי) בשילוב חכם עם סקירה ואפשרות דיון לפני שמירה, פלוס זיהוי אוטומטי של אי-הסכמה כמקור נוסף לתובנות.

## AI Provider — איך זה עובד

ה-provider ב-`lib/ai/provider.ts` בוחר בין שני מסלולים לפי `AI_PROVIDER`:

- **`AI_PROVIDER=anthropic`**: קריאה ישירה ל-Anthropic Messages API (`tool_choice` מאולץ לפי JSON Schema), על `ANTHROPIC_API_KEY` הפרטי.
- **כל ערך אחר / השמטה** (ברירת מחדל): OpenAI-compatible — ללא `OPENAI_BASE_URL` זה Native OpenAI Responses API, עם `OPENAI_BASE_URL` זה Chat Completions format (לכל proxy: CodeMie, Azure).

שני המסלולים חשופים בשתי צורות: `generateStructured()` (קריאה רגילה, מחזירה תוצאה שלמה) ו-`generateStructuredStream()` (streaming — משמש רק ב-`/api/evaluate`, כדי להציג התקדמות חיה בהערכות הכבדות שיכולות לקחת 1-3 דקות).

```
Client → API Route
           ↓ requireAppIdentity()
           ↓ getPrompt(key, fallback) — DB override מ-ai_instructions, אחרת ברירת המחדל מ-PROMPT_DEFAULTS
           ↓ generateStructured() / generateStructuredStream() → CodeMie/OpenAI proxy או Anthropic ישיר
           ↓ Parse JSON response
           ↓ Save to DB
           ↓ Write ai_activity_logs
           ↓ Return to client
```

## הוספת משתמש חדש

1. היכנס כ-Admin
2. לך ל"משתמשים והרשאות"
3. הוסף כתובת המייל + Role

או ישירות ב-DB:
```sql
INSERT INTO app_users (email, role) VALUES ('user@example.com', 'user');
```

## Backup

```powershell
# Backup DB
docker exec recruitment_system-postgres-1 pg_dump -U app candidate_manager > backup.sql

# Restore
Get-Content backup.sql | docker exec -i recruitment_system-postgres-1 psql -U app candidate_manager
```

## Health Checks

- `GET /api/health/live` — האם השרת עולה
- `GET /api/health/ready` — האם ה-DB מחובר

---

## מפת קבצים מלאה עם הסבר

### `app/`
| קובץ | תפקיד |
|---|---|
| `page.tsx` | כל ה-UI — SPA אחד: Dashboard, Jobs, Candidates, Archive, Team, AI Activity, Admin pages |
| `layout.tsx` | HTML root — dir=rtl, metadata, global CSS import |
| `globals.css` | כל ה-CSS: layout, components, RTL, animations, utility classes |

### `app/api/`
| קובץ | תפקיד |
|---|---|
| `auth/login/route.ts` | POST — אימות מייל מול DB allowlist, יצירת iron-session cookie |
| `auth/logout/route.ts` | GET — מחיקת session cookie |
| `session/route.ts` | GET — מחזיר פרטי משתמש מחובר (email, role, isAdmin) |
| `recruiting/route.ts` | GET/POST/PATCH/DELETE — CRUD ראשי: jobs, candidates, applications, aiInstructions, appUsers |
| `cv/route.ts` | GET/POST — העלאת PDF ל-MinIO, חילוץ טקסט (pdfjs), הורדת קובץ |
| `cv/ai/route.ts` | POST — חילוץ פרטי מועמד מטקסט PDF באמצעות AI |
| `evaluate/route.ts` | POST — הערכה ייעוצית של מועמד (streaming NDJSON), מצב `pre`/`post` מפורש מהלקוח (לא מוסק מקיום סיכום ראיון). לא כותב `score`/`recommendation` — רק את משבצת ה-JSON הייעודית (pre/post). הרצה מחדש מאפסת את החלטת המגייס לאותו שלב בלבד |
| `evaluate/chat/route.ts` | POST — שיח הבהרה על ההערכה/המלצה; מקבל `mode` ("pre"/"post") וקורא מהעמודה הייעודית המתאימה |
| `evaluate/questions/route.ts` | POST — שאלות המשך לראיון מתוך `pre_evaluation_json` בלבד |
| `evaluate/decision/route.ts` | POST — שומר את החלטת המגייס (לא של ה-AI) + נימוק, יוצר מייל גיוס בהתאם (`pre`/`post_recruitment_email`), ומפעיל בדיקה אוטומטית וזהירה (`disagreement_insight`) אם ההחלטה סותרת את המלצת ה-AI |
| `engine-rule/route.ts` | POST — `propose`/`apply`: מציע שילוב חכם של כלל שנלמד (ידני או אוטומטי) לתוך פרומפט הערכה קיים, עם אפשרות דיון/חידוד לפני שמירה |
| `interview/summarize/route.ts` | POST — סיכום תמלול ראיון, אישור ושמירה |
| `interview/extract-text/route.ts` | POST — חילוץ טקסט אמיתי מקובץ `.docx` (mammoth) או `.pdf` (unpdf) שהועלה כתמלול ראיון, במקום Placeholder |
| `jobs/parse/route.ts` | POST — חילוץ משרה מטקסט חופשי (מייל, תיאור רשמי, הבהרות), כולל הפרדת דגשי מנהל מגייס לשדה ייעודי |
| `jobs/refine/route.ts` | POST — עדכון משרה קיימת לפי מידע חדש (כולל דגשי מנהל מגייס), הצגת שינויים מוצעים לאישור |
| `jobs/scan-candidates/route.ts` | POST — סריקת כל מאגר המועמדים (פעילים **וגם ארכיון**) + כל עובדי הצוות הפנימיים מול משרה בbatches, מחזיר ציון+חוזקות+פערים לכל אחד |
| `ai-chat/route.ts` | POST — המשך שיח עם AI על מייל גיוס (multi-turn, context per application) |
| `ai-general/route.ts` | POST — שאילתה חופשית עם גישה מלאה לכל טבלאות המערכת (`buildFullSystemContext`) — משרות/מועמדויות כולל ארכיון, צוות, פרומפטים במלואם, פעילות AI, משתמשים, audit log |
| `team/route.ts` | GET/POST/PATCH/DELETE — CRUD עובדי צוות (כולל role/client/naya_start_date/next_step_summary), שמירת ai_insight, `last_meeting_date` מחושב ב-JOIN מול team_meetings, `CREATE TABLE IF NOT EXISTS` ל-team_members/team_meetings |
| `team/meetings/route.ts` | POST — סיכום תמלול פגישה / שמירה |
| `team/run-insight/route.ts` | POST — `team_insight`: התאמת משרות + ניתוח מקצועי בקריאת AI אחת ממוזגת, שמירה ב-DB |
| `team/extract-profile/route.ts` | POST — בניית פרופיל עובד מסודר מטקסט גולמי, כולל חילוץ תפקיד/לקוח/תאריך הצטרפות/סיכום להמשך כשהם מצוינים במפורש |
| `team/promote-to-candidate/route.ts` | POST — קידום עובד כמועמד: יוצר כרטיס, מקשר למשרות שנבחרו |
| `health/live/route.ts` | GET — `{"status":"ok"}` — liveness check |
| `health/ready/route.ts` | GET — בדיקת חיבור DB — readiness check |

### `db/`
| קובץ | תפקיד |
|---|---|
| `schema.ts` | הגדרת 8 טבלאות Drizzle: appUsers, jobs (כולל hiringManagerEmphasis), candidates, applications (כולל עמודות pre/post evaluation, proposedEngineRuleKey, ו-pre/postHumanDecision+Reason+Date), aiActivityLogs, aiInstructions, evaluationRules (legacy), auditLogs |
| `client.ts` | יצירת Drizzle client עם connection pool ל-PostgreSQL |
| `migrations/0000_odd_stature.sql` | Migration ראשון — יצירת כל הטבלאות |
| `migrations/0001_famous_power_man.sql` | הוספת `interview_raw_material` ל-applications, תיקון טיפוס `cv_size` ל-bigint |
| `migrations/0002_special_famine.sql` | הוספת עמודות pre/post evaluation נפרדות ל-applications |
| `migrations/0003_kind_tyrannus.sql` | הוספת `proposed_engine_rule_key` ל-applications |
| `migrations/0004_dry_killraven.sql` | הוספת עמודות החלטת המגייס (`pre`/`post_human_decision`+`_reason`+`_date`) ל-applications |
| `migrations/0005_modern_brother_voodoo.sql` | הוספת `hiring_manager_emphasis` ל-jobs |

### `lib/`
| קובץ | תפקיד |
|---|---|
| `ai/provider.ts` | Dual-mode adapter: CodeMie/OpenAI proxy (Chat Completions / Responses API) **או** Anthropic ישיר (`AI_PROVIDER=anthropic`). `generateStructured()` (רגיל) + `generateStructuredStream()` (streaming, ל-evaluate) + `estimateCost()` |
| `ai/evaluation-prompt.ts` | פרומפטים הערכת מועמד ייעוצית: `preEvaluationSchema`/`postEvaluationSchema` (שניהם עם `ai_recommendation` + `requirement_match_summary`, ללא ציון ובלי לקבוע החלטה) + שאלות ראיון + שיח הבהרה + סריקת מועמדים |
| `ai/prompts.ts` | פרומפטים: CV extraction, Job parsing, Interview summary |
| `ai/team-prompts.ts` | `TEAM_INSIGHT_INSTRUCTIONS` (job matching + ניתוח עובד ממוזגים), סיכום פגישה, חילוץ פרופיל |
| `ai/instructions.ts` | `instructionDefinitions` — רשימת 19 המפתחות/כותרות/trigger/group, משמשת bootstrap ו-Admin UI |
| `ai/prompt-defaults.ts` | `PROMPT_DEFAULTS` — מקור אמת יחיד לברירת המחדל של כל פרומפט (מייבאים ממנו `bootstrap.ts` וגם `recruiting/route.ts`, כדי שלא ייווצרו כמה עותקים לא-מסונכרנים) |
| `ai/get-prompt.ts` | `getPrompt(key, fallback)` — שליפת override מה-DB; כל route שמפעיל AI עובר דרכו |
| `ai/recruitment-email-prompt.ts` | פרומפטים למייל גיוס לפני/אחרי ראיון — רצים רק אחרי שנשמרה החלטת מגייס |
| `ai/rule-merge-prompt.ts` | שילוב חכם של כלל שנלמד לתוך פרומפט הערכה קיים |
| `ai/disagreement-insight-prompt.ts` | זיהוי אוטומטי, שמרני, של תובנה כשההחלטה סותרת את המלצת ה-AI |
| `auth/session.ts` | iron-session config: cookie name, secret, options |
| `auth/identity.ts` | `requireAppIdentity()`, `requireAdmin()` — guards לכל API route |
| `auth/bootstrap.ts` | מריץ פעם אחת בהפעלה: יוצר admin owner, זורע 19 AI instructions ל-DB מתוך `PROMPT_DEFAULTS` |
| `storage/client.ts` | S3/MinIO adapter: `uploadObject()`, `getSignedUrl()`, `deleteObject()` |
| `audit.ts` | `writeAudit()` — כתיבת שורה ל-audit_logs |

### `scripts/`
| קובץ | תפקיד |
|---|---|
| `migrate.ts` | הרצת Drizzle migrations ב-production |
| `import-export.ts` | ייבוא נתונים מ-JSON export של המערכת המקורית |
| `check-db.mjs` | בדיקת חיבור DB והצגת טבלאות קיימות |
| `start-docker.ps1` | הפעלת Docker Compose אוטומטית (נקרא מ-Windows Startup) |

### קבצי שורש
| קובץ | תפקיד |
|---|---|
| `docker-compose.yml` | 4 services: postgres, minio, minio-init (bucket creation), web |
| `Dockerfile` | Multi-stage build — node:22-alpine, non-root user |
| `next.config.ts` | `serverExternalPackages: ["pg"]` |
| `drizzle.config.ts` | Drizzle Kit config — schema path, migrations path |
| `tsconfig.json` | TypeScript config עם path aliases (`@/*`) |
| `.env.example` | Template לכל משתני הסביבה |
| `docs/starting_command.md` | הוראות הפעלה יומיומיות: CodeMie proxy, Docker, `npm run dev` |
