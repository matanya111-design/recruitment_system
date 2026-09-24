כדי להשתמש ב-CodeMie בתוך VS Code, פתח PowerShell והריץ:

```powershell
codemie proxy connect --vscode --profile epam
```

אם מתקבלת הודעה שאין פרטי SSO, התחבר ואז הרץ שוב:

```powershell
codemie profile login --url https://codemie.lab.epam.com/code-assistant-api
codemie proxy connect --vscode --profile epam
```

+++


זה חיבור ה-AI ב-VS Code. הוא נפרד מהפעלת האתר באמצעות Docker ו-`npm run dev`.

כדי להיכנס לאתר ב-`http://localhost:3000`, צריך להריץ את **`npm run dev`**. אבל כדי שפונקציות שמשתמשות במסד הנתונים או בקבצים יעבדו, גם PostgreSQL ו-MinIO צריכים לפעול.

לכן, אחרי הדלקת המחשב, הסדר הבטוח הוא:

```powershell
docker compose up -d postgres minio minio-init
npm run dev
```

אם שירותי Docker כבר פועלים, מספיק להריץ רק `npm run dev`. חלון PowerShell שבו הרצת אותה צריך להישאר פתוח בזמן השימוש באתר.


