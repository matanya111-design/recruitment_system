# מערכת ניהול והערכת מועמדים — תיעוד מלא

## מה זה?

מערכת Web פנימית לניהול תהליכי גיוס טכנולוגיים. הוקמה כהעתקה מקומית מלאה של `tech-candidate-manager` שרץ על ChatGPT Sites עם Cloudflare. כל ה-Infrastructure הוחלף ב-adapters מקומיים.

## Stack

| שכבה | טכנולוגיה |
|---|---|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes (Edge-compatible) |
| Database | PostgreSQL 16 via Drizzle ORM |
| Storage | MinIO (dev) / AWS S3-compatible (prod) |
| Auth | iron-session cookie + DB allowlist |
| AI | OpenAI Responses API with Structured Outputs |
| Container | Docker Compose |

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
│   │   ├── evaluate/           # הערכת AI
│   │   ├── interview/summarize/ # סיכום ראיון AI
│   │   ├── jobs/parse/ & refine/ # יצירת משרה מטקסט
│   │   └── health/             # live + ready health checks
│   ├── page.tsx                # SPA React (UI מלא)
│   ├── layout.tsx              # HTML root
│   └── globals.css             # כל ה-CSS (RTL, components)
│
├── db/                         # Database layer
│   ├── schema.ts               # Drizzle schema (8 טבלאות)
│   └── client.ts               # PostgreSQL connection pool
│
├── lib/                        # Business logic
│   ├── ai/                     # AI provider, prompts, schemas
│   │   ├── provider.ts         # OpenAI Responses API adapter
│   │   ├── evaluation-prompt.ts # פרומפטים הערכת מועמד
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
├── drizzle/                    # SQL migrations
├── scripts/                    # כלי פיתוח
│   ├── migrate.ts              # הרצת DB migrations
│   └── import-export.ts        # Import מ-JSON export של המקור
│
├── docs/                       # תיעוד
│   ├── README.md               # מסמך זה
│   ├── spec-he.md              # מפרט מקורי מלא (עברית)
│   └── source-v37.zip          # קוד מקור המערכת המקורית
│
├── docker-compose.yml          # postgres + minio + minio-init + web
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
# 1. הורד את הפרויקט
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

### הקמה ב-Docker (production)

```powershell
docker compose up --build
```

## משתני סביבה — מה חסר ומה צריך למלא

ערוך את `.env.local`. סעיפים המסומנים ⚠️ **חובה** לפני הפעלה:

| משתנה | סטטוס | הסבר |
|---|---|---|
| `DATABASE_URL` | ✅ מוגדר | מחובר ל-Docker postgres |
| `SESSION_SECRET` | ⚠️ **שנה!** | צור מחרוזת 32 ביית: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_OWNER_EMAIL` | ✅ מוגדר | `Matanya_Vinograd@epam.com` |
| `OPENAI_API_KEY` | ⚠️ **חסר!** | הוסף מפתח מ-https://platform.openai.com |
| `OPENAI_MODEL` | ✅ | `gpt-5.6-terra` |
| `S3_ENDPOINT` | ✅ | מחובר ל-Docker MinIO |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | ⚠️ **שנה ב-Production** | ב-dev: `minioadmin` / `change-me` |
| `APP_BASE_URL` | ✅ dev | שנה ל-domain האמיתי ב-Production |

## פקודות שימושיות

```powershell
npm run dev          # פיתוח עם HMR
npm run build        # בניית Production
npm run typecheck    # TypeScript ללא הרצה
npm run db:generate  # יצירת migration מ-schema
npm run db:migrate   # הרצת migrations
npm run db:seed      # נתוני demo (dev בלבד)
```

## מסד הנתונים — 8 טבלאות

| טבלה | תפקיד |
|---|---|
| `app_users` | Allowlist משתמשים + roles |
| `jobs` | משרות |
| `candidates` | מועמדים + metadata קורות חיים |
| `applications` | שיוך מועמד↔משרה + ציון + הערכה |
| `ai_activity_logs` | יומן כל קריאות AI + עלות |
| `ai_instructions` | פרומפטים ניתנים לעריכה ע"י Admin |
| `evaluation_rules` | כללי כיול רוחביים מאושרים |
| `audit_logs` | Audit trail לפעולות רגישות |

## AI — זרימת עבודה

כל קריאת AI **יוצאת מהשרת בלבד** (לעולם לא מהדפדפן):

```
Client → POST /api/evaluate
           ↓
        requireAppIdentity()
           ↓
        Load prompt from DB (fallback: file)
           ↓
        OpenAI Responses API (structured output + strict JSON Schema)
           ↓
        Validate with Zod
           ↓
        Save to applications.evaluation_json
           ↓
        Write ai_activity_logs (tokens + cost estimate)
           ↓
        Return to client
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
