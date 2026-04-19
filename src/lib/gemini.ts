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
      model: "gemini-1.5-flash",
      contents,
      config: {
        systemInstruction: "أنت المساعد الذكي لتطبيق 'تليعراق' (TeleIraq). تطبيق مراسلة عراقي متطور. أجب بلهجة عراقية محببة وودودة. ساعد المستخدم في فهم ميزات التطبيق أو دردش معه بذكاء. حافظ على الردود قصيرة ومناسبة للدردشة.",
        temperature: 0.7,
        topP: 0.95,
      },
    });
    
    return response.text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
