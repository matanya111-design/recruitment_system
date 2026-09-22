# מערכת ניהול והערכת מועמדים — NAYA Tech Recruitment System

> גרסה: 2.0 | Branch: `dev` | עודכן: ספטמבר 2026

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
| AI | CodeMie Proxy (claude-sonnet-4-6) / OpenAI Responses API |
| Container | Docker Compose עם `restart: unless-stopped` |

## חיבור AI

המערכת מחוברת ל-**CodeMie Proxy** של EPAM — משתמשת בחשבון הארגוני שלך:

```
OPENAI_BASE_URL=http://127.0.0.1:4001/v1
OPENAI_API_KEY=codemie-proxy
OPENAI_MODEL=claude-sonnet-4-6
```

להחלפה ל-OpenAI ישיר — הסר את `OPENAI_BASE_URL` ושים `OPENAI_API_KEY` אמיתי.

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
│   │   ├── jobs/parse/ & refine/ # יצירת משרה מטקסט
│   │   ├── ai-chat/            # המשך שיח עם AI על מייל גיוס
│   │   ├── ai-general/         # שאילתות AI כלליות + team matching
│   │   ├── team/               # CRUD ניהול צוות
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
│   │   ├── prompts.ts          # יתר הפרומפטים (CV, Job, Interview)
│   │   └── instructions.ts     # instructionDefinitions
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
│   └── source-v37.zip          # קוד מקור המערכת המקורית
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
| `applications` | שיוך מועמד↔משרה + סטטוס, ראיון, הערכה |
| `ai_activity_logs` | יומן כל קריאות AI — מודל, טוקנים, עלות |
| `ai_instructions` | פרומפטים ניתנים לעריכה ע"י Admin |
| `evaluation_rules` | כללי כיול רוחביים מאושרים |
| `audit_logs` | Audit trail לפעולות רגישות |
| `team_members` | חברי צוות — סיכום שיחה, action items, משרות מסומנות |

## לוחות הניווט

| טאב | מה עושים שם |
|---|---|
| לוח בקרה | סטטוס כללי, משימות פתוחות, מועמדים אחרונים |
| משרות | רשימה עם מיון, יצירה ידנית / מ-AI |
| מועמדים | רשימה עם מיון, חיפוש וסינון |
| מועמד (דף פנימי) | 4 טאבים: סקירה / קורות חיים / ראיון / הערכה לפני+אחרי |
| ארכיון | משרות ומועמדויות מורדות, עם שחזור |
| מדריך | הסבר מעשי על זרימת העבודה |
| פעילות AI | יומן קריאות AI + עלות משוערת |
| שאילתות AI | שאל כל שאלה על המערכת |
| ניהול צוות | ישות לכל עובד — סיכום, action items, matching AI |
| משתמשים | Admin בלבד — allowlist ותפקידים |
| הוראות AI | Admin בלבד — עריכת פרומפטים |

## זרימת עבודה — מועמד בתהליך

```
משרה פעילה
    ↓
יצירת מועמד + שיוך למשרה
    ↓
העלאת PDF → חילוץ טקסט → אישור פרטים
    ↓
הערכה לפני ראיון (AI) → שאלות לראיון + מייל גיוס
    ↓ (אישור לראיון)
תמלול ראיון → AI מכין טיוטה → אישור סיכום
    ↓
הערכה לאחר ראיון (AI) → להעביר ללקוח / לא להעביר
    ↓
עדכון סטטוס → הפסיק תהליך / התקבל / הועבר ללקוח
```

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
