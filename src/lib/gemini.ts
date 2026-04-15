import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function getSystemBotResponse(userMessage: string, history: { role: 'user' | 'model', parts: [{ text: string }] }[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: "أنت المساعد الذكي لتطبيق 'تليعراق' (TeleIraq). تطبيق مراسلة عراقي متطور. أجب بلهجة عراقية محببة وودودة. ساعد المستخدم في فهم ميزات التطبيق أو دردش معه بذكاء. حافظ على الردود قصيرة ومناسبة للدردشة.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
