# מערכת ניהול והערכת מועמדים — NAYA Tech Recruitment System

> גרסה: 2.4 | Branch: `dev` | עודכן: 24 בספטמבר 2026

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
│   │   ├── evaluate/           # הערכת AI (pre + post interview, streaming)
│   │   │   ├── chat/           # שיח הבהרה על הערכה קיימת (mode-aware: pre/post)
│   │   │   └── questions/      # שאלות המשך לראיון, נגזרות מהערכה לפני ראיון
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
│   │   ├── instructions.ts     # 14 instructionDefinitions (מפתח/כותרת/trigger/group, ניתנים לעריכה מ-Admin)
│   │   ├── prompt-defaults.ts  # PROMPT_DEFAULTS — מקור אמת יחיד לברירת המחדל של כל פרומפט
│   │   └── get-prompt.ts       # getPrompt(key, fallback) — שליפת override מה-DB, בשימוש בכל route
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
| `jobs` | משרות — דרישות, לקוח, סטטוס, טכנולוגיות | `must_requirements`, `preferred_requirements`, `technologies` (jsonb), `archived` |
| `candidates` | מועמדים — פרטים, קורות חיים, חוות דעת מגייס | `cv_extracted_text`, `cv_extraction_status`, `archived` |
| `applications` | שיוך מועמד↔משרה: סטטוס, ראיון, הערכות | ראה פירוט מתחת לטבלה |
| `ai_activity_logs` | יומן כל קריאות AI — מודל, טוקנים, עלות | נטען **במלואו** (ללא הגבלת שורות) בטאב "פעילות AI ועלויות"; דפדוף בצד לקוח, 50 בעמוד |
| `ai_instructions` | 14 פרומפטים ניתנים לעריכה ע"י Admin (`instructionDefinitions`) | `key` (PK), `content`, `is_custom` |
| `evaluation_rules` | **Legacy** — מנגנון ישן ל"כללי כיול רוחביים" שהוזרקו אוטומטית לכל הערכה. הוחלף (ספטמבר 2026) במנגנון שמוסיף כלל מאושר ישירות לתוכן הפרומפט הרלוונטי ב-`ai_instructions`. נשארה בסכימה לצורך היסטוריה בלבד, קוד הייצור לא קורא ממנה יותר | — |
| `audit_logs` | Audit trail לפעולות רגישות (מחיקת משתמש, אישור/דחיית כלל וכו') | `actor_email`, `action`, `before_json`/`after_json` |

**עמודות `applications` הנוגעות להערכה** (עודכן ספטמבר 2026 — ראה "הערכה לפני/אחרי ראיון נשמרות בנפרד" מתחת):

| קבוצה | עמודות | תפקיד |
|---|---|---|
| "סטטוס נוכחי" (dashboard-wide) | `score`, `recommendation`, `evaluation_type`, `evaluation_date`, `evaluation_json` | תמיד משקפות את ההערכה **האחרונה שרצה מכל סוג** — משמש למסכים שצריכים סטטוס אחד למועמדות (רשימת מועמדים, ספירת high/reasonable fit) |
| הערכה לפני ראיון | `pre_evaluation_json`, `pre_score`, `pre_recommendation`, `pre_evaluation_date` | נכתבות **רק** כשרצה הערכה במצב `pre`; אף פעם לא נדרסות ע"י הרצת "אחרי ראיון" |
| הערכה לאחר ראיון | `post_evaluation_json`, `post_score`, `post_recommendation`, `post_evaluation_date` | נכתבות **רק** כשרצה הערכה במצב `post`; אף פעם לא נדרסות ע"י הרצת "לפני ראיון" |
| כלל שנלמד ממשוב | `proposed_engine_rule`, `proposed_engine_rule_key`, `engine_rule_status` | `proposed_engine_rule_key` שומר לאיזה מפתח ב-`ai_instructions` (`candidate_evaluation` / `post_interview_evaluation`) הכלל שייך, כדי שאישור יוסיף אותו לטקסט הפרומפט הנכון |

### מנוהלות ב-SQL גולמי בתוך ה-route (לא ב-Drizzle schema!)

| טבלה | תפקיד | נוצרת ע"י |
|---|---|---|
| `team_members` | עובדי צוות — `name`, `notes` (פרופיל חופשי), `target_job_ids`, `actions`, `ai_insight` (jsonb, נשמר מ"הפעל סקירת AI") | `CREATE TABLE IF NOT EXISTS` ב-[app/api/team/route.ts](../app/api/team/route.ts) |
| `team_meetings` | פגישות 1:1 — `member_id` (FK), `raw_transcript`, `summary`, `action_items` (jsonb), `meeting_date` | אותו מנגנון, גם ב-[app/api/team/meetings/route.ts](../app/api/team/meetings/route.ts) ו-[run-insight/route.ts](../app/api/team/run-insight/route.ts) |

> **הערה ארכיטקטונית**: שתי הטבלאות האלה לא מוגדרות ב-`db/schema.ts` ולא מופיעות ב-migrations — כל route שנוגע בהן מריץ `CREATE TABLE IF NOT EXISTS` בעצמו. זה עובד, אבל שונה מהדפוס של שאר המערכת (Drizzle + migrations); כדאי לדעת את זה לפני שמחפשים אותן בסכימה.

## לוחות הניווט

| טאב | מה עושים שם |
|---|---|
| לוח בקרה | סטטוס כללי, משימות פתוחות, מועמדים אחרונים |
| משרות | רשימה עם מיון לפי כל שדה, יצירה ידנית / מ-AI |
| מועמדים | רשימה עם מיון לפי כל שדה, חיפוש וסינון |
| מועמד (דף פנימי) | סדר הטאבים: סקירה / קורות חיים / **הערכה לפני ראיון** / סיכום ראיון / **הערכה לאחר ראיון** — שני טאבי ההערכה עצמאיים לגמרי זה מזה (ראו "הערכות נשמרות בנפרד" למטה) |
| ארכיון | משרות ומועמדויות מורדות עם סיבת דחייה, שחזור |
| מדריך | הסבר מעשי על זרימת העבודה (מעודכן) |
| פעילות AI | יומן **כל** קריאות AI מאז ומעולם + עלות/טוקנים כוללים על כל ההיסטוריה, מיון לפי כל שדה, דפדוף 50 בעמוד |
| שאילתות AI | שאל כל שאלה על המערכת |
| ניהול צוות | רשימה מתקפלת — לכל עובד: ציר זמן פגישות, פגישה חדשה + AI summary, התאמת משרות + ניתוח AI במסך אחד (`team_insight`, שמור ב-DB), **קידום כמועמד** — יוצר כרטיס מועמד ומשייך למשרות שנבחרו |
| משתמשים | Admin בלבד — allowlist ותפקידים, "הסרת כולם חוץ ממני" |
| הוראות AI | Admin בלבד — 14 פרומפטים ניתנים לעריכה ואיפוס, מקובצים לפי אזור באתר (מועמדים / משרות / ניהול צוות / שאילתות כלליות) עם סרגל צד נדבק (sticky) |

## יכולות המערכת — פירוט מלא

### משרות

- **יצירה ידנית** או **מטקסט חופשי באמצעות AI** (מייל, תיאור רשמי, הבהרות בעל פה) — `job_parsing`.
- **ניתוח והצעת עדכונים** למשרה קיימת לפי מידע חדש (למשל תמלול שיחה עם מנהל מגייס) — מציג את השינויים המוצעים לאישור לפני שמירה — `job_refine`.
- **סריקת מועמדים קיימים** מול משרה נתונה — סורק את **כל** מאגר המועמדים (כולל מועמדים בארכיון, כי סגירת תהליך במשרה אחת לא אומרת שהם לא מתאימים למשרה הזו) **וגם** את כל עובדי הצוות הפנימיים (כמועמדים פוטנציאליים למעבר תפקיד), ומחזיר לכל אחד ציון, `fit_label`, שורה תחתונה, חוזקות ופערים — `candidate_scan`. תוצאה שכבר מקושרת למשרה (פעיל/בארכיון) מסומנת בהתאם.
- ספירת "התאמה גבוהה"/"התאמה סבירה" מחושבת אוטומטית לכל משרה מתוך הערכות המועמדים המקושרים.
- ארכוב ושחזור משרה.

### מועמדים — ניהול בסיסי

- יצירה ידנית או קידום מעובד צוות קיים (ראו "ניהול צוות" למטה).
- העלאת קורות חיים (PDF) ל-MinIO/S3, חילוץ טקסט (pdfjs), ו**חילוץ פרטי מועמד אוטומטי באמצעות AI** (שם, תפקיד, חברה, ותק, טכנולוגיות, תקציר בעברית) — `cv_extraction`.
- שיוך מועמד למשרה חדשה מבטל אוטומטית ארכוב קיים של המועמד/המועמדות (כדי שלא "ייעלמו" מרשימות שמסננות `archived=false`).
- דחייה עם סיבה / הפסקת תהליך — עובר אוטומטית לארכיון; שחזור מהארכיון מבטל גם את ארכוב המועמד אם היה.

### הערכת מועמד — לפני ואחרי ראיון (נשמרות בנפרד לחלוטין)

- **הערכה לפני ראיון** (`candidate_evaluation`) — קטגורית (לזמן לראיון פנימי / בירור קצר לפני ראיון / לא לקדם), טבלת התאמה מאוחדת מול דרישות המשרה (`fit_table` עם `materiality`+`completable_by_naya` לכל שורה), מייל גיוס להחלטה על זימון לראיון, ואפשרות **לקבל עד 5 שאלות המשך לראיון** (`interview_questions`) גזורות מההערכה.
- **הערכה לאחר ראיון** (`post_interview_evaluation`) — בינארית: להעביר/לא להעביר ללקוח, מייל גיוס להחלטה על העברה, כולל התייחסות לשינוי מול ההערכה הראשונית (Calibration, לא Evidence).
- שתי ההערכות **עצמאיות לגמרי** בבסיס הנתונים (`pre_evaluation_json`/`pre_score`/... מול `post_evaluation_json`/`post_score`/...) — הרצת אחת **לעולם לא דורסת** את השנייה, גם אם המועמדות כוללת חומר ראיון שהוזן/הועתק ממשרה אחרת. עמודות "סטטוס נוכחי" (`score`/`recommendation`/`evaluation_type`/...) ממשיכות לשקף את מה שרץ אחרון, לשימוש מסכי סיכום.
- הרצה עם **streaming** — מציג התקדמות חיה (איזה שדה ה-AI כותב כרגע) במקום מסך ריק לאורך 1-3 דקות.
- **שיח הבהרה על הערכה קיימת** (`evaluation_chat`) — "למה הגעת למסקנה הזו", לא משנה את ההערכה עצמה; מודע ל-mode (פני/אחרי ראיון) וקורא רק מהעמודה הרלוונטית.
- **תיקון הערכה לפי משוב מקצועי** — מזינים משוב חופשי, ה-AI מריץ הערכה מחדש לאור המשוב. אם המשוב כללי (`generalizable_feedback`), ה-AI מציע ניסוח לכלל קבוע; באישור, הכלל מתווסף ישירות לתוכן הפרומפט הרלוונטי (ראו "למידה ממשוב מקצועי" למעלה).
- **שיח עריכת מייל גיוס** (`email_chat`) — עריכה חופשית בשיחה של מייל הגיוס; מתאפס אוטומטית לתוכן העדכני בכל פעם שרצה הערכה חדשה (לא נשאר "תקוע" על נוסח ישן).

### סיכום ראיון

- הדבקת תמלול/הערות גולמיות, או **העלאת קובץ** `.docx` (mammoth) / `.pdf` (unpdf) עם חילוץ טקסט אמיתי (לא Placeholder).
- **טיוטת סיכום באמצעות AI** (`interview_summary`) מתוך החומר הגולמי, לאישור/עריכה ידנית לפני שמירה.
- **שימוש חוזר בחומר גלם של ראיון** בין משרות לאותו מועמד/ת (`interview_raw_material` נשמר בנפרד מהסיכום המאושר).

### ניהול צוות (עובדים פנימיים)

- CRUD עובדים: שם, פרופיל חופשי (`notes`), משרות יעד, פעולות.
- **פגישות 1:1** — שמירת תמלול/הערות + **סיכום AI** (`team_meeting_summary`) + action items, על ציר זמן לכל עובד.
- **התאמת משרות + ניתוח מקצועי במסך אחד** (`team_insight`) — בקריאת AI אחת: אילו משרות פעילות מתאימות, חוזקות/פערים, המלצת קידום וצעדים הבאים; נשמר ב-DB (`ai_insight`) כדי לא להריץ שוב בכל טעינה.
- **בניית פרופיל מטקסט גולמי** (`team_extract_profile`) — למשל הדבקת פרופיל לינקדאין/מייל/הערות שיחה.
- **קידום עובד למועמד** (`team_promote`) — יוצר כרטיס מועמד מלא מפרופיל העובד + סיכומי הפגישות, ומשייך אותו למשרות שנבחרו.

### AI ותפעול

- **שני ספקי AI** מוחלפים בסביבת משתנה אחד (`AI_PROVIDER`): CodeMie/OpenAI proxy (ברירת מחדל) או **Anthropic ישיר** על חשבון פרטי — ראו "חיבור AI" למעלה.
- **14 פרומפטים ניתנים לעריכה** מ-Admin, כל אחד עם `trigger` (איפה בדיוק מפעילים אותו) ו-`group` (איזה אזור באתר) — מוצגים בטאב "הוראות AI" בסרגל צד מקובץ ונדבק, עם אפשרות איפוס לברירת מחדל.
- **יומן פעילות AI מלא**: כל קריאה נרשמת (`ai_activity_logs`) עם מודל, טוקנים (כולל cache), עלות משוערת; הטאב מציג טוטאלים על **כל ההיסטוריה** ולא רק על חלק ממנה, עם דפדוף 50 בעמוד וניתן למיון לפי כל עמודה.
- **שאילתות AI כלליות** (`general_ai`) — שאלה חופשית על נתוני המערכת (משרות, מועמדים) מעמוד ייעודי.

### הרשאות ומשתמשים

- Allowlist מבוסס מייל + role (`admin`/`user`) ב-`app_users`, נבדק ב-iron-session cookie.
- Admin יכול לנהל משתמשים ("הסרת כולם חוץ ממני") ולערוך פרומפטי AI.
- Audit trail (`audit_logs`) לפעולות רגישות: אישור/דחיית כלל שנלמד, ניהול משתמשים.

## זרימת עבודה — מועמד בתהליך

```
משרה פעילה
    ↓
יצירת מועמד + שיוך למשרה
    ↓
העלאת PDF → חילוץ טקסט → אישור פרטים
    ↓
הערכה לפני ראיון (AI) → שאלות לראיון + מייל גיוס + שיח המשך
    ↓ (אישור לראיון)
תמלול ראיון (הדבקה / קובץ .docx/.pdf) → AI מכין טיוטה → אישור סיכום
    ↓
הערכה לאחר ראיון (AI) → להעביר ללקוח / לא להעביר
    ↓
עדכון סטטוס:
  • התקבל / הועבר ללקוח — נשאר פעיל
  • נדחה + סיבה — מועבר לארכיון אוטומטית (נשאר במשרות אחרות)
  • הפסיק תהליך + סיבה — מועבר לארכיון
```

> **חשוב**: "הערכה לפני ראיון" ו"הערכה לאחר ראיון" הן שתי פעולות **עצמאיות** — כל אחת נשמרת בעמודות ה-DB הייעודיות שלה ולא דורסת את השנייה. אפשר להריץ "הערכה לפני ראיון" בכל שלב (גם אם כבר יש הערכה לאחר ראיון שמורה) בלי לאבד את ההערכה שלאחר ראיון, ולהפך.

## פרומפטים AI (14 סה"כ, ניתנים לעריכה מ-Admin)

כל הפרומפטים מוגדרים ב-[lib/ai/instructions.ts](../lib/ai/instructions.ts) (`instructionDefinitions` — מפתח, כותרת, תיאור, מי מפעיל אותו, קבוצה בטאב "הוראות AI") וברירת המחדל של כל אחד ב-[lib/ai/prompt-defaults.ts](../lib/ai/prompt-defaults.ts) (`PROMPT_DEFAULTS`, מקור אמת יחיד — כל ה-routes וגם ה-bootstrap קוראים ממנו, כדי שלא ייווצרו כמה עותקים לא-מסונכרנים של אותו פרומפט). כל route קורא לפרומפט שלו דרך [lib/ai/get-prompt.ts](../lib/ai/get-prompt.ts) (`getPrompt(key, fallback)`), כך שעריכה בטאב "הוראות AI" משפיעה מיד על ההרצה הבאה.

| קבוצה בטאב "הוראות AI" | מפתח | תפקיד |
|---|---|---|
| מועמדים | `candidate_evaluation` | הערכת מועמד לפני ראיון — NAYA context, ללא ציון מספרי (החלטה קטגורית) |
| מועמדים | `post_interview_evaluation` | הערכת מועמד לאחר ראיון — החלטה בינארית: להעביר/לא להעביר ללקוח |
| מועמדים | `interview_questions` | עד 5 שאלות המשך לראיון, נגזרות מהערכה לפני ראיון קיימת |
| מועמדים | `evaluation_chat` | שיח הבהרה על הערכה קיימת ("למה הגעת למסקנה הזו") — לא משנה את ההערכה |
| מועמדים | `email_chat` | שיח חופשי לעריכת מייל הגיוס שההערכה הפיקה |
| מועמדים | `cv_extraction` | חילוץ פרטי מועמד ותקציר מקורות חיים |
| מועמדים | `interview_summary` | סיכום ראיון מתמלול/הערות גולמיות |
| משרות | `job_parsing` | יצירת משרה מטקסט חופשי |
| משרות | `job_refine` | ניתוח והצעת עדכונים למשרה קיימת לפי מידע חדש |
| משרות | `candidate_scan` | סריקת כל מאגר המועמדים (כולל ארכיון + עובדי צוות פנימיים) מול משרה נתונה |
| ניהול צוות | `team_meeting_summary` | סיכום פגישת 1:1 עם עובד |
| ניהול צוות | `team_insight` | התאמת משרות פעילות + ניתוח מקצועי (חוזקות/פערים/המלצת קידום) — קריאת AI אחת ממוזגת (עד ספטמבר 2026 היו שני פרומפטים נפרדים: `team_job_match` + `team_member_analysis`) |
| ניהול צוות | `team_extract_profile` | בניית פרופיל עובד מטקסט גולמי |
| ניהול צוות | `team_promote` | בניית כרטיס מועמד מלא מפרופיל עובד + סיכומי פגישות |
| שאילתות AI כלליות | `general_ai` | מענה חופשי על שאלות לגבי נתוני המערכת |

### למידה ממשוב מקצועי ("כלל שנלמד")

כשמריצים הערכה עם משוב מקצועי (`reviewerFeedback`) וה-AI מזהה שהתיקון הוא כללי (`generalizable_feedback`), הוא מציע ניסוח לכלל קבוע (`proposed_engine_rule`). זה מופיע בכרטיס המועמד תחת "הצעה לעדכון פרומפט ההערכה":

- **דחייה** — ההצעה נזרקת, שום דבר לא משתנה.
- **אישור ככלל קבוע** — הטקסט מתווסף **ישירות לסוף תוכן הפרומפט הספציפי** שהפיק אותו (`candidate_evaluation` או `post_interview_evaluation`, לפי `proposed_engine_rule_key` שנשמר על המועמדות), ומסומן כ"נערך ידנית" (`is_custom=true`). כך אפשר לראות ולערוך את הכלל ישירות בטאב "הוראות AI", ולדעת שאיפוס לברירת מחדל של אותו פרומפט ימחק גם אותו.

> **היסטוריה**: עד ספטמבר 2026 מנגנון זה שמר את הכללים בטבלה נפרדת (`evaluation_rules`) והזריק אותם אוטומטית כתוספת נסתרת לכל הערכה (גם לפני וגם אחרי ראיון), בלי שהמשתמש יכול לראות אותם בשום מסך. הוחלף במנגנון הממוקד שמתואר למעלה כדי שהשינוי יהיה גלוי ומתועד באותו מקום שבו עורכים את שאר הפרומפט.

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
| `evaluate/route.ts` | POST — הערכת מועמד (streaming NDJSON), מצב `pre`/`post` מפורש מהלקוח (לא מוסק מקיום סיכום ראיון), כותב גם לעמודות "סטטוס נוכחי" וגם למשבצת הייעודית (pre/post) בלי לדרוס אחת את השנייה |
| `evaluate/chat/route.ts` | POST — שיח הבהרה על הערכה קיימת; מקבל `mode` ("pre"/"post") וקורא מהעמודה הייעודית המתאימה |
| `evaluate/questions/route.ts` | POST — שאלות המשך לראיון מתוך `pre_evaluation_json` בלבד |
| `interview/summarize/route.ts` | POST — סיכום תמלול ראיון, אישור ושמירה |
| `interview/extract-text/route.ts` | POST — חילוץ טקסט אמיתי מקובץ `.docx` (mammoth) או `.pdf` (unpdf) שהועלה כתמלול ראיון, במקום Placeholder |
| `jobs/parse/route.ts` | POST — חילוץ משרה מטקסט חופשי (מייל, תיאור רשמי, הבהרות) |
| `jobs/refine/route.ts` | POST — עדכון משרה קיימת לפי מידע חדש, הצגת שינויים מוצעים לאישור |
| `jobs/scan-candidates/route.ts` | POST — סריקת כל מאגר המועמדים (פעילים **וגם ארכיון**) + כל עובדי הצוות הפנימיים מול משרה בbatches, מחזיר ציון+חוזקות+פערים לכל אחד |
| `ai-chat/route.ts` | POST — המשך שיח עם AI על מייל גיוס (multi-turn, context per application) |
| `ai-general/route.ts` | POST — שאילתה חופשית על נתוני המערכת |
| `team/route.ts` | GET/POST/PATCH/DELETE — CRUD עובדי צוות, שמירת ai_insight, `CREATE TABLE IF NOT EXISTS` ל-team_members/team_meetings |
| `team/meetings/route.ts` | POST — סיכום תמלול פגישה / שמירה |
| `team/run-insight/route.ts` | POST — `team_insight`: התאמת משרות + ניתוח מקצועי בקריאת AI אחת ממוזגת, שמירה ב-DB |
| `team/extract-profile/route.ts` | POST — בניית פרופיל עובד מסודר מטקסט גולמי |
| `team/promote-to-candidate/route.ts` | POST — קידום עובד כמועמד: יוצר כרטיס, מקשר למשרות שנבחרו |
| `health/live/route.ts` | GET — `{"status":"ok"}` — liveness check |
| `health/ready/route.ts` | GET — בדיקת חיבור DB — readiness check |

### `db/`
| קובץ | תפקיד |
|---|---|
| `schema.ts` | הגדרת 8 טבלאות Drizzle: appUsers, jobs, candidates, applications (כולל עמודות pre/post evaluation ו-proposedEngineRuleKey), aiActivityLogs, aiInstructions, evaluationRules (legacy), auditLogs |
| `client.ts` | יצירת Drizzle client עם connection pool ל-PostgreSQL |
| `migrations/0000_odd_stature.sql` | Migration ראשון — יצירת כל הטבלאות |
| `migrations/0001_famous_power_man.sql` | הוספת `interview_raw_material` ל-applications, תיקון טיפוס `cv_size` ל-bigint |
| `migrations/0002_special_famine.sql` | הוספת עמודות pre/post evaluation נפרדות ל-applications |
| `migrations/0003_kind_tyrannus.sql` | הוספת `proposed_engine_rule_key` ל-applications |

### `lib/`
| קובץ | תפקיד |
|---|---|
| `ai/provider.ts` | Dual-mode adapter: CodeMie/OpenAI proxy (Chat Completions / Responses API) **או** Anthropic ישיר (`AI_PROVIDER=anthropic`). `generateStructured()` (רגיל) + `generateStructuredStream()` (streaming, ל-evaluate) + `estimateCost()` |
| `ai/evaluation-prompt.ts` | פרומפטים הערכת מועמד: `preEvaluationSchema` (לפני ראיון — החלטה קטגורית, ללא ציון) ו-`postEvaluationSchema` (לאחר ראיון, בינארי) + שאלות ראיון + שיח הבהרה + סריקת מועמדים |
| `ai/prompts.ts` | פרומפטים: CV extraction, Job parsing, Interview summary |
| `ai/team-prompts.ts` | `TEAM_INSIGHT_INSTRUCTIONS` (job matching + ניתוח עובד ממוזגים), סיכום פגישה, חילוץ פרופיל |
| `ai/instructions.ts` | `instructionDefinitions` — רשימת 14 המפתחות/כותרות/trigger/group, משמשת bootstrap ו-Admin UI |
| `ai/prompt-defaults.ts` | `PROMPT_DEFAULTS` — מקור אמת יחיד לברירת המחדל של כל פרומפט (מייבאים ממנו `bootstrap.ts` וגם `recruiting/route.ts`, כדי שלא ייווצרו כמה עותקים לא-מסונכרנים) |
| `ai/get-prompt.ts` | `getPrompt(key, fallback)` — שליפת override מה-DB; כל route שמפעיל AI עובר דרכו |
| `auth/session.ts` | iron-session config: cookie name, secret, options |
| `auth/identity.ts` | `requireAppIdentity()`, `requireAdmin()` — guards לכל API route |
| `auth/bootstrap.ts` | מריץ פעם אחת בהפעלה: יוצר admin owner, זורע 14 AI instructions ל-DB מתוך `PROMPT_DEFAULTS` |
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
