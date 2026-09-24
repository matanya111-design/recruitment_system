# מערכת ניהול והערכת מועמדים — NAYA Tech Recruitment System

> גרסה: 2.3 | Branch: `dev` | עודכן: ספטמבר 2026

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
│   │   ├── evaluate/           # הערכת AI (pre + post interview)
│   │   ├── interview/summarize/ # סיכום ראיון AI
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
│   ├── schema.ts               # Drizzle schema (8 טבלאות + team_members)
│   ├── client.ts               # PostgreSQL connection pool
│   └── migrations/             # SQL migrations (Drizzle Kit)
│
├── lib/                        # Business logic
│   ├── ai/                     # AI provider, prompts, schemas
│   │   ├── provider.ts         # Dual-mode adapter (Responses API + Chat Completions)
│   │   ├── evaluation-prompt.ts # פרומפטים הערכת מועמד (NAYA context)
│   │   ├── prompts.ts          # פרומפטים: CV, Job, Interview Summary
│   │   ├── team-prompts.ts     # פרומפטים: פגישות, matching, ניתוח עובד, חילוץ פרופיל
│   │   └── instructions.ts     # 9 instructionDefinitions (ניתנים לעריכה מ-Admin)
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

| טבלה | תפקיד |
|---|---|
| `app_users` | Allowlist משתמשים + roles (admin/user) |
| `jobs` | משרות — דרישות, לקוח, סטטוס, טכנולוגיות |
| `candidates` | מועמדים — פרטים, קורות חיים, חוות דעת מגייס |
| `applications` | שיוך מועמד↔משרה + סטטוס, ראיון, הערכה, סיבת דחייה |
| `ai_activity_logs` | יומן כל קריאות AI — מודל, טוקנים, עלות |
| `ai_instructions` | 9 פרומפטים ניתנים לעריכה ע"י Admin |
| `evaluation_rules` | כללי כיול רוחביים מאושרים |
| `audit_logs` | Audit trail לפעולות רגישות |
| `team_members` | עובדי צוות — פרופיל, ai_insight (נשמר מסריקה) |
| `team_meetings` | פגישות 1:1 — תמלול, סיכום AI, action items, תאריך |

## לוחות הניווט

| טאב | מה עושים שם |
|---|---|
| לוח בקרה | סטטוס כללי, משימות פתוחות, מועמדים אחרונים |
| משרות | רשימה עם מיון לפי כל שדה, יצירה ידנית / מ-AI |
| מועמדים | רשימה עם מיון לפי כל שדה, חיפוש וסינון |
| מועמד (דף פנימי) | סקירה / קורות חיים / סיכום ראיון / הערכה לפני ראיון / הערכה לאחר ראיון |
| ארכיון | משרות ומועמדויות מורדות עם סיבת דחייה, שחזור |
| מדריך | הסבר מעשי על זרימת העבודה (מעודכן) |
| פעילות AI | יומן קריאות AI + עלות משוערת, מיון לפי כל שדה |
| שאילתות AI | שאל כל שאלה על המערכת |
| ניהול צוות | רשימה מתקפלת — לכל עובד: ציר זמן פגישות, פגישה חדשה + AI summary, התאמת משרות + ניתוח AI (שמור ב-DB), **קידום כמועמד** — יוצר כרטיס מועמד ומשייך למשרות שנבחרו |
| משתמשים | Admin בלבד — allowlist ותפקידים, "הסרת כולם חוץ ממני" |
| הוראות AI | Admin בלבד — 9 פרומפטים ניתנים לעריכה ואיפוס |

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
תמלול ראיון (הדבקה / קובץ .txt) → AI מכין טיוטה → אישור סיכום
    ↓
הערכה לאחר ראיון (AI) → להעביר ללקוח / לא להעביר
    ↓
עדכון סטטוס:
  • התקבל / הועבר ללקוח — נשאר פעיל
  • נדחה + סיבה — מועבר לארכיון אוטומטית (נשאר במשרות אחרות)
  • הפסיק תהליך + סיבה — מועבר לארכיון
```

## פרומפטים AI (9 סה"כ, ניתנים לעריכה מ-Admin)

| מפתח | תפקיד |
|---|---|
| `candidate_evaluation` | הערכת מועמד לפני ראיון — NAYA context |
| `post_interview_evaluation` | הערכת מועמד לאחר ראיון |
| `interview_summary` | סיכום ראיון מחומר גלם |
| `job_parsing` | יצירת משרה מטקסט חופשי |
| `cv_extraction` | חילוץ פרטי מועמד מקורות חיים |
| `team_meeting_summary` | סיכום פגישת 1:1 עם עובד |
| `team_job_match` | התאמת משרות לעובד |
| `team_member_analysis` | ניתוח מקצועי של עובד |
| `team_extract_profile` | בניית פרופיל עובד מטקסט גולמי |

## AI Provider — איך זה עובד

ה-provider ב-`lib/ai/provider.ts` תומך בשני פורמטים:

- **ללא `OPENAI_BASE_URL`**: Native OpenAI Responses API
- **עם `OPENAI_BASE_URL`**: Chat Completions format (לכל proxy: CodeMie, Azure, Anthropic)

```
Client → API Route
           ↓ requireAppIdentity()
           ↓ Load prompt from DB (fallback: lib/ai/*.ts)
           ↓ generateStructured() → CodeMie Proxy / OpenAI
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
| `evaluate/route.ts` | POST — הערכת מועמד (לפני/אחרי ראיון), שמירת JSON מלא, עדכון application |
| `interview/summarize/route.ts` | POST — סיכום תמלול ראיון, אישור ושמירה |
| `jobs/parse/route.ts` | POST — חילוץ משרה מטקסט חופשי (מייל, תיאור רשמי, הבהרות) |
| `jobs/refine/route.ts` | POST — עדכון משרה קיימת לפי מידע חדש, הצגת שינויים מוצעים לאישור |
| `jobs/scan-candidates/route.ts` | POST — סריקת כל מועמדי המאגר מול משרה בbatches, מחזיר ציון+חוזקות+פערים לכל אחד |
| `ai-chat/route.ts` | POST — המשך שיח עם AI על מייל גיוס (multi-turn, context per application) |
| `ai-general/route.ts` | POST — שאילתה חופשית על נתוני המערכת |
| `team/route.ts` | GET/POST/PATCH/DELETE — CRUD עובדי צוות, שמירת ai_insight |
| `team/meetings/route.ts` | POST — סיכום תמלול פגישה / שמירה / התאמת משרות / ניתוח עובד |
| `team/run-insight/route.ts` | POST — סקירת AI מלאה לעובד (job match + analysis בparallel, שמירה ב-DB) |
| `team/extract-profile/route.ts` | POST — בניית פרופיל עובד מסודר מטקסט גולמי |
| `team/promote-to-candidate/route.ts` | POST — קידום עובד כמועמד: יוצר כרטיס, מקשר למשרות שנבחרו |
| `health/live/route.ts` | GET — `{"status":"ok"}` — liveness check |
| `health/ready/route.ts` | GET — בדיקת חיבור DB — readiness check |

### `db/`
| קובץ | תפקיד |
|---|---|
| `schema.ts` | הגדרת 8 טבלאות Drizzle: appUsers, jobs, candidates, applications, aiActivityLogs, aiInstructions, evaluationRules, auditLogs |
| `client.ts` | יצירת Drizzle client עם connection pool ל-PostgreSQL |
| `migrations/0000_odd_stature.sql` | Migration ראשון — יצירת כל הטבלאות |

### `lib/`
| קובץ | תפקיד |
|---|---|
| `ai/provider.ts` | Dual-mode adapter: Chat Completions (proxy) / Responses API (OpenAI ישיר). `generateStructured()` + `estimateCost()` |
| `ai/evaluation-prompt.ts` | פרומפטים הערכת מועמד לפני/אחרי ראיון + `evaluationSchema` (JSON Schema מלא) |
| `ai/prompts.ts` | פרומפטים: CV extraction, Job parsing, Interview summary |
| `ai/team-prompts.ts` | פרומפטים: פגישות 1:1, job matching, ניתוח עובד, חילוץ פרופיל |
| `ai/instructions.ts` | `instructionDefinitions` — רשימת 9 המפתחות+כותרות, משמשת bootstrap ו-Admin UI |
| `auth/session.ts` | iron-session config: cookie name, secret, options |
| `auth/identity.ts` | `requireAppIdentity()`, `requireAdmin()` — guards לכל API route |
| `auth/bootstrap.ts` | מריץ פעם אחת בהפעלה: יוצר admin owner, זורע 9 AI instructions ל-DB |
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
