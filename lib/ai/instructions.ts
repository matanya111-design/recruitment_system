export const instructionDefinitions = [
  { key: "candidate_evaluation", title: "הערכת מועמד לפני ראיון", description: "הכללים להחלטה אם לזמן לראיון מקצועי וליצירת שאלות ומייל לגיוס." },
  { key: "post_interview_evaluation", title: "הערכת מועמד לאחר ראיון", description: "הכללים לניתוח הראיון ולהחלטה אם להעביר את המועמד ללקוח." },
  { key: "job_parsing", title: "יצירת משרה מטקסט חופשי", description: "הכללים לחילוץ תיאור משרה, דרישות, טכנולוגיות ואי-ודאויות." },
  { key: "cv_extraction", title: "חילוץ פרטי מועמד מקורות חיים", description: "הכללים להפקת כרטיס מועמד ותקציר בעברית מתוך קורות החיים." },
  { key: "interview_summary", title: "יצירת סיכום ראיון מחומר גלם", description: "הכללים לניתוח תמלול או הערות וליצירת טיוטת סיכום לאישור." },
] as const;

export type InstructionKey = typeof instructionDefinitions[number]["key"];
