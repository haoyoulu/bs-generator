import { create } from 'zustand';
// Fix: Import createJSONStorage for proper storage handling with persist middleware
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Character } from '../types';

// Fix: Define a type for updater functions to allow both direct values and functional updates
type Updater<T> = T | ((prev: T) => T);

interface AppState {
    // Global State
    step: number;
    setStep: (step: Updater<number>) => void;
    loading: Record<number, boolean>;
    setLoading: (loadingState: Updater<Record<number, boolean>>) => void;
    preparingStep: number | null;
    setPreparingStep: (step: Updater<number | null>) => void;
    error: string | null;
    setError: (error: Updater<string | null>) => void;

    // Step 1: Topic Generation
    topic: string;
    setTopic: (topic: Updater<string>) => void;
    isTopicConfirmed: boolean;
    confirmTopic: () => void;

    // Step 2: Research Alignment
    researchData: string;
    setResearchData: (data: Updater<string>) => void;
    supplementalResearchQuery: string;
    setSupplementalResearchQuery: (query: Updater<string>) => void;
    citations: { title: string; uri: string; }[];
    setCitations: (citations: Updater<{ title: string; uri: string; }[]>) => void;
    
    // Step 3: Meeting Group Generation
    characters: Character[];
    setCharacters: (characters: Updater<Character[]>) => void;
    addCharacter: (character: Character) => void;
    deleteCharacter: (index: number) => void;

    // Step 4: Discussion Simulation
    meetingTranscript: string;
    setMeetingTranscript: (transcript: Updater<string>) => void;

    // Step 5: Final Article Generation
    finalArticle: string;
    setFinalArticle: (article: Updater<string>) => void;
    saveFinalArticleEdit: () => void; // For user-edited article status

    // Prompts (editable by user)
    prompts: {
        step1: string;
        step2: string;
        step2Add: string;
        step3: string;
        step4: string;
        step4Extend: string;
        step5: string;
        step4System: string;
        step5System: string;
    };
    setPrompts: (prompts: Updater<AppState['prompts']>) => void;

    // Global Actions
    resetStepsFrom: (fromStep: number) => void;
    resetAll: () => void;
    
    // Action to append research data (for supplemental research)
    appendToResearch: (newResearch: string, newCitations: { title: string; uri: string; }[]) => void;
}

// Helper function to correctly resolve an Updater (either a direct value or a functional updater)
const resolveUpdater = <T>(updater: Updater<T>, prevState: T): T =>
  typeof updater === 'function' ? (updater as (prev: T) => T)(prevState) : updater;

const DEFAULT_PROMPTS = {
    step1: "請以繁體中文，生成一個荒謬但引人深思的長篇文章主題，結合兩個完全無關的概念。例如：「火影忍者的敘事結構與日本當代社會創傷的相似之處」或「藝人豬哥亮與台積電股價表現之間的神秘關聯」。請只提供主題字串，不要加上任何引號或標籤。",
    step2: "針對主題「{{topic}}」，請進行深入的網路搜尋，以繁體中文收集其核心概念的詳細資訊。請將主題拆解為多個關鍵字（例如，若主題為「火影忍者與日本社會創傷」，請搜尋「火影忍者劇情大綱」、「火影忍者核心主題」、「當代日本社會」、「現代日本的社會問題」、「日本社會創傷的成因」等），然後將搜尋結果整合成一份結構清晰、內容詳盡的研究簡報。請盡可能提供豐富且詳細的資訊，並使用 markdown 格式化文本。",
    step2Add: "請根據以下現有研究資料：\n{{researchData}}\n\n針對主題「{{topic}}」，補充搜尋並提供關於「{{supplementalQuery}}」的詳細資訊。將補充資料以結構清晰、內容詳盡的markdown格式文本輸出，並整合到原有資料後方，但不要重複已有的資訊。",
    step3: "根據主題「{{topic}}」及以下研究資料：「{{researchData}}」，請以繁體中文創建一個由6位虛構專家組成的多元化會議小組。每位專家都必須有獨特的中文姓名、具體的職業，以及與主題某一面向相關的詳細背景。這個團隊的設計應能促進辯論，成員間可能持有衝突但皆合理的觀點，以確保對主題進行全面且多角度的分析。例如，若主題是關於火影忍者和社會創傷，團隊可包含一位專攻日本流行文化的社會學家、一位臨床心理學家、一位文學評論家和一位經濟學家。請確保他們的個性和專業能形成有效的制衡與激盪。",
    step4: "主題：{{topic}}\n\n研究簡報：\n{{researchData}}\n\n與會者：\n{{characterProfiles}}\n\n你的任務是模擬一場在這些專家之間進行的、長篇且詳細的辯論會的完整逐字稿。這場討論的目標是為一篇關於此主題的長篇文章擬定大綱。他們應該涵蓋文章的可能結構、核心論點、所需數據和反方論點。每位專家都必須從自身的專業角度發言。目標是在達成大致共識前，對主題進行深入的探討。請以會議記錄的形式輸出，每一行都以角色名稱開頭，後接冒號和其發言內容。請確保討論內容充實，每位角色都有多次發言機會，並全程使用繁體中文。",
    step4Extend: "目前為止的討論紀錄：\n{{existingTranscript}}\n\n主題：{{topic}}\n\n研究簡報：\n{{researchData}}\n\n與會者：\n{{characterProfiles}}\n\n你的任務是接續這場辯論。客戶認為先前的討論不夠深入。請引入新的觀點、挑戰現有的假設，或探討一個被忽略的切入點。生成一段實質性的新對話紀錄，為討論增添更多價值與深度。不要重複先前的論點。直接從下一位發言者的對話開始。全程使用繁體中文。",
    step5: "你的任務是根據以下資料，撰寫一篇至少5000字的全面、深入的繁體中文文章。請利用提供的研究簡報作為事實基礎，並參考會議紀錄來建構核心論點、文章架構和多元觀點。最終的文章必須結構清晰（使用 markdown 標題）、條理分明，並將專家們辯論的想法無縫地整合在一起。請不要只是總結會議紀錄，而是要將其合成為一篇全新、具權威性的文章。\n\n主題：{{topic}}\n\n研究簡報：\n{{researchData}}\n\n會議紀錄：\n{{transcript}}\n\n現在，請開始撰寫這篇詳細的最終文章。",
    step4System: "你是一位專業的會議主持人。你的任務是模擬一場專家間的對話。每位專家都必須根據其背景描述，從自己的專業角度進行論證。他們必須基於他人的觀點進行延伸、批判和挑戰，並使用繁體中文進行交流。",
    step5System: "你是一位專業的長文作家。你的任務是將一場複雜的討論，合成為一篇條理清晰、結構嚴謹且見解深刻的繁體中文文章。你必須保持中立，準確地呈現各位專家的觀點，同時創造出引人入勝的敘事。",
};


export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Global State Init
            step: 1,
            setStep: (step) => set(state => ({ step: resolveUpdater(step, state.step) })),
            loading: {},
            setLoading: (loadingState) => set(state => ({ loading: resolveUpdater(loadingState, state.loading) })),
            preparingStep: null,
            setPreparingStep: (step) => set(state => ({ preparingStep: resolveUpdater(step, state.preparingStep) })),
            error: null,
            setError: (error) => set(state => ({ error: resolveUpdater(error, state.error) })),

            // Step 1: Topic Generation
            topic: '',
            setTopic: (topic) => set(state => ({ topic: resolveUpdater(topic, state.topic) })),
            isTopicConfirmed: false,
            confirmTopic: () => set({ isTopicConfirmed: true }),

            // Step 2: Research Alignment
            researchData: '',
            setResearchData: (data) => set(state => ({ researchData: resolveUpdater(data, state.researchData) })),
            supplementalResearchQuery: '',
            setSupplementalResearchQuery: (query) => set(state => ({ supplementalResearchQuery: resolveUpdater(query, state.supplementalResearchQuery) })),
            citations: [],
            setCitations: (citations) => set(state => ({ citations: resolveUpdater(citations, state.citations) })),
            
            // Step 3: Meeting Group Generation
            characters: [],
            setCharacters: (characters) => set(state => ({ characters: resolveUpdater(characters, state.characters) })),
            addCharacter: (character) => set(state => ({ characters: [...state.characters, character] })),
            deleteCharacter: (indexToDelete) => set(state => ({ characters: state.characters.filter((_, i) => i !== indexToDelete) })),

            // Step 4: Discussion Simulation
            meetingTranscript: '',
            setMeetingTranscript: (transcript) => set(state => ({ meetingTranscript: resolveUpdater(transcript, state.meetingTranscript) })),

            // Step 5: Final Article Generation
            finalArticle: '',
            setFinalArticle: (article) => set(state => ({ finalArticle: resolveUpdater(article, state.finalArticle) })),
            saveFinalArticleEdit: () => { /* In a real app, this might save to a backend */ },

            // Prompts
            prompts: DEFAULT_PROMPTS,
            setPrompts: (prompts) => set(state => ({ prompts: resolveUpdater(prompts, state.prompts) })),

            // Global Actions
            resetStepsFrom: (fromStep) => {
                set(state => {
                    const newState: Partial<AppState> = {};
                    if (fromStep <= 1) {
                        newState.topic = '';
                        newState.isTopicConfirmed = false;
                    }
                    if (fromStep <= 2) {
                        newState.researchData = '';
                        newState.supplementalResearchQuery = '';
                        newState.citations = [];
                    }
                    if (fromStep <= 3) {
                        newState.characters = [];
                    }
                    if (fromStep <= 4) {
                        newState.meetingTranscript = '';
                    }
                    if (fromStep <= 5) {
                        newState.finalArticle = '';
                    }
                    // Reset loading/error states for affected steps
                    const newLoading = { ...state.loading };
                    for (let i = fromStep; i <= 5; i++) {
                        delete newLoading[i];
                    }
                    newState.loading = newLoading;
                    newState.error = null; // Clear error on reset
                    return newState;
                });
            },
            resetAll: () => {
                set({
                    step: 1,
                    topic: '',
                    isTopicConfirmed: false,
                    researchData: '',
                    supplementalResearchQuery: '',
                    citations: [],
                    characters: [],
                    meetingTranscript: '',
                    finalArticle: '',
                    prompts: DEFAULT_PROMPTS, // Reset prompts to default
                    loading: {},
                    preparingStep: null,
                    error: null,
                });
            },
            appendToResearch: (newResearch, newCitations) => {
                set(state => {
                    const updatedCitations = [...state.citations];
                    for (const c of newCitations) {
                        if (!updatedCitations.some(mc => mc.uri === c.uri)) {
                            updatedCitations.push(c);
                        }
                    }
                    return {
                        researchData: state.researchData + newResearch,
                        citations: updatedCitations,
                    };
                });
            },
        }),
        {
            name: 'long-form-ai-generator-storage', // unique name
            // Fix: Use createJSONStorage to correctly handle localStorage with JSON serialization/deserialization
            storage: createJSONStorage(() => localStorage), // Use local storage
            // Fix: Explicitly define the return type for partialize to resolve type inference issues
            partialize: (state): Partial<AppState> => Object.fromEntries(
                Object.entries(state).filter(([key]) => ![
                    'loading', 'preparingStep', 'error', 'setLoading', 'setPreparingStep', 'setError', // Do not persist transient UI states
                    'setStep', 'setTopic', 'confirmTopic', 'setResearchData', 'setSupplementalResearchQuery', 'setCitations',
                    'setCharacters', 'addCharacter', 'deleteCharacter', 'setMeetingTranscript', 'setFinalArticle', 'setPrompts',
                    'resetStepsFrom', 'resetAll', 'appendToResearch', 'saveFinalArticleEdit' // Do not persist actions
                ].includes(key))
            ),
        }
    )
);