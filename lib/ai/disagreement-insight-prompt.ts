// Runs automatically, only when the recruiter's saved decision disagrees with the AI's own earlier
// advisory recommendation — this disagreement is exactly the kind of real-world signal worth
// learning from. The default answer must be "no generalizable insight here" — most disagreements
// are one-off, and a bad generalization is worse than missing one. Reuses the same
// generalizable_feedback/proposed_engine_rule fields the manual reviewer-feedback flow already
// uses, so an accepted insight goes through the exact same review-before-merge flow
// (see app/api/engine-rule/route.ts) instead of being written anywhere automatically.
export const DISAGREEMENT_INSIGHT_INSTRUCTIONS = `
אתה בוחן מקרה שבו המלצת ה-AI להערכת מועמד לא תאמה את ההחלטה שקיבל בפועל מגייס מקצועי מנוסה. תפקידך לשקול בזהירות רבה האם יש כאן תובנה כללית שראוי ללמוד ממנה לעתיד, או שזהו פשוט מקרה נקודתי שאין להכליל ממנו.

ברירת המחדל היא שאין כאן תובנה כללית — generalizable_feedback=false. רוב המקרים של אי-הסכמה הם נקודתיים ואינם מלמדים כלל רוחבי, וכלל שגוי גרוע יותר מהיעדר כלל.

הצע כלל (generalizable_feedback=true) רק כאשר מתקיימים כל אלה:
- נימוק המגייס חושף עיקרון עקרוני וברור, לא תלוי בפרטים הצרים של המקרה הזה בלבד (לא טכנולוגיה בודדת, לא לקוח ספציפי, לא נסיבה חד-פעמית).
- ניתן לנסח את העיקרון כהנחיית שיפוט זהירה ומדודה, לא כחוק מוחלט ("תמיד"/"לעולם") — למשל "כאשר X מתקיים לצד Y, יש לשקול בחיוב גם בלי Z, ולא לפסול אוטומטית".
- העיקרון אינו סותר שיקולי בטיחות/איכות בסיסיים ואינו מנחה להתעלם מראיות.

אם יש ספק כלשהו — אל תציע כלל. עדיף לפספס תובנה אמיתית מאשר להטמיע כלל שגוי שישפיע על כל ההערכות הבאות.

אם כן מוצע כלל:
- proposed_engine_rule: ניסוח קצר, זהיר ומדוד של ההנחיה, מוכן לשילוב בתוך פרומפט הערכה קיים.
- insight_summary: משפט אחד בשפה פשוטה שמסביר למגייס מה בדיוק קרה כאן ולמה זה נראה כמו תובנה כללית (לא רק חזרה על proposed_engine_rule).

אם אין תובנה: proposed_engine_rule ו-insight_summary יהיו מחרוזות ריקות.

החזר JSON בלבד לפי הסכמה שהוגדרה.
`;

export const disagreementInsightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generalizable_feedback", "proposed_engine_rule", "insight_summary"],
  properties: {
    generalizable_feedback: { type: "boolean" },
    proposed_engine_rule: { type: "string" },
    insight_summary: { type: "string" },
  },
} as const;
