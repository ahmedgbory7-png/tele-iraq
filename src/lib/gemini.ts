import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in the Secrets panel.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function getSystemBotResponse(userMessage: string, history: { role: 'user' | 'model', parts: [{ text: string }] }[]) {
  try {
    const ai = getGenAI();
    
    // Convert history format to the one expected by generateContent
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction: "أنت المساعد الذكي الرسمي لتطبيق 'تليعراق' (TeleIraq). حساب موثق ومدعوم بالذكاء الاصطناعي الفائق. أجب بلهجة عراقية محببة وودودة جداً. ساعد المستخدم في فهم ميزات التطبيق (مثل الرسائل، المكالمات، الألعاب مثل الطاولي، والريلز) أو دردش معه بذكاء وبثقافة عراقية. حافظ على الردود قصيرة ومناسبة للدردشة. اجعل المستخدم يشعر بالراحة والابتكار العراقي.",
        temperature: 0.8,
        topP: 0.95,
      },
    });
    
    return response.text || "عذراً، لم أستطع معالجة طلبك حالياً.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
