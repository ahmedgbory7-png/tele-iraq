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
    const model = (ai as any).getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      systemInstruction: "أنت المساعد الذكي لتطبيق 'تليعراق' (TeleIraq). تطبيق مراسلة عراقي متطور. أجب بلهجة عراقية محببة وودودة. ساعد المستخدم في فهم ميزات التطبيق أو دردش معه بذكاء. حافظ على الردود قصيرة ومناسبة للدردشة.",
    });

    const response = await model.generateContent({
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
    });
    
    return response.response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
