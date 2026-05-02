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

export async function getSystemBotResponse(
  userMessage: string, 
  history: { role: 'user' | 'model', parts: [{ text: string }] }[],
  context?: { groupName?: string; participants?: string[]; isGroup: boolean }
) {
  try {
    const ai = getGenAI();
    
    // Model selection based on reliability
    const MODEL_NAME = "gemini-3-flash-preview";
    
    // Build context-aware system instruction
    let systemInstruction = "أنت المساعد الذكي الرسمي لتطبيق 'تلي عراق' (TeleIraq). حساب موثق ومدعوم بالذكاء الاصطناعي الفائق. أجب بلهجة عراقية محببة وودودة جداً. ساعد المستخدم في فهم ميزات التطبيق (مثل الرسائل، المكالمات، الألعاب مثل الطاولي، والريلز) أو دردش معه بذكاء وبثقافة عراقية. حافظ على الردود قصيرة ومناسبة للدردشة. اجعل المستخدم يشعر بالراحة والابتكار العراقي.";
    
    if (context?.isGroup) {
      systemInstruction += `\nأنت الآن في محادثة جماعية يطلق عليها اسم: "${context.groupName || 'مجموعة تلي عراق'}".`;
      if (context.participants && context.participants.length > 0) {
        systemInstruction += ` يوجد في هذه المجموعة ${context.participants.length} أعضاء.`;
      }
      systemInstruction += " تفاعل مع أعضاء المجموعة بروح الفريق والود العراقي المعروف. إذا سألك أحد عن المجموعة أو الأعضاء، حاول أن تكون مفيداً ومرحاً.";
    }

    // Convert history format to the one expected by generateContent
    // Gemini API requires alternating 'user' and 'model' roles.
    // Combining consecutive messages from same role.
    const combinedContents: { role: 'user' | 'model', parts: { text: string }[] }[] = [];
    
    // Sort and filter history
    const rawHistory = [...history, { role: 'user', parts: [{ text: userMessage }] }];
    
    rawHistory.forEach(item => {
      const text = item.parts[0]?.text?.trim();
      if (!text) return;

      const lastItem = combinedContents[combinedContents.length - 1];
      if (lastItem && lastItem.role === item.role) {
        lastItem.parts[0].text += "\n" + text;
      } else {
        combinedContents.push({
          role: item.role as 'user' | 'model',
          parts: [{ text }]
        });
      }
    });

    // Ensure it starts with 'user' role (Gemini requirement often is user first)
    if (combinedContents.length > 0 && combinedContents[0].role === 'model') {
      combinedContents.shift();
    }

    console.log(`[Gemini] Calling ${MODEL_NAME} with ${combinedContents.length} combined messages.`);

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: combinedContents,
      config: {
        systemInstruction,
        temperature: 0.8,
        topP: 0.95,
      },
    });
    
    if (!response.text) {
      console.warn("[Gemini] Empty response received.");
      return "عذراً، لم أستطع معالجة طلبك حالياً. هل يمكنك تكرار ذلك؟";
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini Critical Error:", error);
    // Provide more specific error info if possible
    if (error.message?.includes("API_KEY")) {
      return "عذراً، هناك مشكلة في إعدادات النظام (API Key). يرجى الاتصال بالإدارة. 🇮🇶";
    }
    return "عذراً، واجهت مشكلة في التفكير حالياً. حاول مرة أخرى لاحقاً! 🇮🇶";
  }
}
