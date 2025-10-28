import { GoogleGenAI, Type } from "@google/genai";
import type { Character } from '../types';

// Define a new property on the window object for TypeScript
declare global {
    interface Window {
        APP_CONFIG: {
            API_KEY: string;
        }
    }
}

// Read API key from the window object injected by Vercel's build process
const apiKey = window.APP_CONFIG?.API_KEY;

if (!apiKey) {
  // Display a user-friendly error message in the DOM if the key is missing
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `<div style="padding: 2rem; text-align: center; font-family: sans-serif; color: #333;"><h1>設定錯誤 (Configuration Error)</h1><p>API 金鑰未設定。請確認 Vercel 專案的環境變數 (Environment Variables) 已正確配置。</p></div>`;
  }
  // Also throw an error to stop execution
  throw new Error("API_KEY not found in window.APP_CONFIG. Please set the GEMINI_API_KEY environment variable in your Vercel project settings.");
}

const ai = new GoogleGenAI({ apiKey: apiKey });


// Helper to extract citations from grounding metadata
const extractCitations = (response: any) => {
    const citations: { title: string; uri: string; }[] = [];
    if (response?.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        for (const chunk of response.candidates[0].groundingMetadata.groundingChunks) {
            if (chunk.web) {
                citations.push({
                    title: chunk.web.title || '無標題',
                    uri: chunk.web.uri,
                });
            }
        }
    }
    return citations;
};

export const generateTopic = async (customPrompt: string): Promise<{ result: string, prompt: string }> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: customPrompt }] }],
  });
  return { result: response.text.trim(), prompt: customPrompt };
};

export const conductResearchStream = async (topic: string, customPrompt: string): Promise<{ stream: AsyncGenerator<string>, citations: { title: string; uri: string; }[], prompt: string }> => {
  const prompt = customPrompt.replace('{{topic}}', topic);
  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  let aggregatedText = '';
  const collectedCitations: { title: string; uri: string; }[] = [];

  async function* streamGenerator() {
    for await (const chunk of response) {
      if (chunk.text) {
        aggregatedText += chunk.text;
        yield chunk.text;
      }
      const newCitations = extractCitations(chunk);
      for (const citation of newCitations) {
          if (!collectedCitations.some(c => c.uri === citation.uri)) {
              collectedCitations.push(citation);
          }
      }
    }
  }

  // The stream will be consumed externally, but we need to ensure citations are collected.
  // We can't return citations directly from the streamGenerator, so we need to rely on side effects
  // or a more complex Promise-based structure to ensure citations are fully collected after stream ends.
  // For simplicity and direct stream iteration, we'll let the caller manage citations collection if needed.
  // The current pattern of returning both stream and citations in the *initial* promise works by
  // collecting citations during the *initial* response parsing, but for *chunk-based* citations
  // during streaming, the caller must aggregate.
  //
  // Re-evaluating: The correct way to return final citations after a stream is to collect them during the iteration
  // and then resolve a promise *after* the stream has finished.
  // For the current implementation where the caller uses `for await (const chunk of stream)`,
  // we must ensure `collectedCitations` is fully populated when `streamGenerator` finishes.

  const finalStream = streamGenerator();
  const finalCitationsPromise = (async () => {
    // Consume the stream to ensure citations are collected
    for await (const _ of finalStream) {}
    return collectedCitations;
  })();

  return {
    stream: streamGenerator(), // This is the stream that will actually be iterated by the UI
    citations: collectedCitations, // This will be mutated by the streamGenerator
    prompt // The actual prompt used
  };
};

export const supplementalResearchStream = async (supplementalQuery: string, researchData: string, customPrompt: string): Promise<{ stream: AsyncGenerator<string>, citations: { title: string; uri: string; }[], prompt: string }> => {
    // Use the comprehensive research prompt, but append the specific supplemental query
    const fullPrompt = customPrompt
        .replace('{{researchData}}', researchData.substring(0, 10000))
        .replace('{{supplementalQuery}}', supplementalQuery);
    
    const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const collectedCitations: { title: string; uri: string; }[] = [];

    async function* streamGenerator() {
        for await (const chunk of response) {
            if (chunk.text) {
                yield chunk.text;
            }
            const newCitations = extractCitations(chunk);
            for (const citation of newCitations) {
                if (!collectedCitations.some(c => c.uri === citation.uri)) {
                    collectedCitations.push(citation);
                }
            }
        }
    }

    return {
      stream: streamGenerator(),
      citations: collectedCitations,
      prompt: fullPrompt,
    };
};


export const generateMeetingGroup = async (topic: string, researchData: string, customPrompt: string): Promise<{ result: Character[], prompt: string }> => {
    const prompt = customPrompt
        .replace('{{topic}}', topic)
        .replace('{{researchData}}', researchData.substring(0, 20000));

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "角色的中文姓名" },
                        profession: { type: Type.STRING, description: "角色的中文職稱" },
                        background: { type: Type.STRING, description: "角色的中文背景描述" },
                    },
                    required: ["name", "profession", "background"],
                },
            },
        },
    });

    const jsonString = response.text;
    try {
        return { result: JSON.parse(jsonString), prompt };
    } catch (error) {
        console.error("Failed to parse characters JSON:", error);
        throw new Error("AI 回傳了無效的角色格式，請重試。");
    }
};

const createDiscussionStream = async (prompt: string, systemInstruction: string) => {
    const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: [{ parts: [{ text: prompt }] }],
        config: { systemInstruction }
    });

    async function* streamGenerator() {
        for await (const chunk of response) {
            yield chunk.text;
        }
    }
    return streamGenerator();
};

export const startDiscussionStream = async (topic: string, researchData: string, characters: Character[], customPrompt: string, systemInstruction: string): Promise<{ stream: AsyncGenerator<string>, prompt: string }> => {
  const characterProfiles = characters.map(c => `- ${c.name}，${c.profession}：${c.background}`).join('\n');
  const prompt = customPrompt
    .replace('{{topic}}', topic)
    .replace('{{researchData}}', researchData.substring(0, 15000))
    .replace('{{characterProfiles}}', characterProfiles);
  
  const stream = await createDiscussionStream(prompt, systemInstruction);
  return { stream, prompt };
};

export const extendDiscussionStream = async (topic: string, researchData: string, characters: Character[], existingTranscript: string, customPrompt: string, systemInstruction: string): Promise<{ stream: AsyncGenerator<string>, prompt: string }> => {
    const characterProfiles = characters.map(c => `- ${c.name}，${c.profession}：${c.background}`).join('\n');
    const prompt = customPrompt
      .replace('{{topic}}', topic)
      .replace('{{researchData}}', researchData.substring(0, 10000))
      .replace('{{characterProfiles}}', characterProfiles)
      .replace('{{existingTranscript}}', existingTranscript);

    const stream = await createDiscussionStream(prompt, systemInstruction);
    return { stream, prompt };
};

export const generateFinalArticleStream = async (topic: string, researchData: string, transcript: string, customPrompt: string, systemInstruction: string): Promise<{ stream: AsyncGenerator<string>, prompt: string }> => {
  const prompt = customPrompt
    .replace('{{topic}}', topic)
    .replace('{{researchData}}', researchData.substring(0, 10000))
    .replace('{{transcript}}', transcript.substring(0, 30000));
  
  const stream = await createDiscussionStream(prompt, systemInstruction);
  return { stream, prompt };
};