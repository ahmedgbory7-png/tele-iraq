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
    
    // Check if history already contains the latest message to avoid duplication
    const lastMsgVisible = history.length > 0 ? history[history.length - 1].parts[0].text : '';
    const cleanHistory = lastMsgVisible === userMessage ? history.slice(0, -1) : history;

    let response;
    try {
      response = await (ai as any).models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          ...cleanHistory,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: "أنت المساعد الذكي لتطبيق 'تليعراق' (TeleIraq). تطبيق مراسلة عراقي متطور. أجب بلهجة عراقية محببة وودودة. ساعد المستخدم في فهم ميزات التطبيق أو دردش معه بذكاء. حافظ على الردود قصيرة ومناسبة للدردشة.",
        },
      });
    } catch (innerError: any) {
      console.warn("Retrying with fallback model...");
      response = await (ai as any).models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...cleanHistory,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: "أنت مساعد ذكي. أجب بباللهجة العراقية.",
        },
      });
    }
    
    return response.text;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    // Log the full error for debugging if possible
    if (error.stack) console.log(error.stack);
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
