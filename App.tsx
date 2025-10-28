import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SparklesIcon, ClipboardIcon, CheckIcon, UserPlusIcon, ArrowPathIcon, TrashIcon, BookOpenIcon, MenuIcon, LogoIcon, ChatBubbleLeftRightIcon } from './components/icons';
import AddCharacterModal from './components/AddCharacterModal';
import ConfirmationModal from './components/ConfirmationModal';
import { useAppStore } from './store/useAppStore';
import {
    generateTopic,
    conductResearchStream,
    supplementalResearchStream,
    generateMeetingGroup,
    startDiscussionStream,
    extendDiscussionStream,
    generateFinalArticleStream
} from './services/geminiService';
import type { Character } from './types';


// Make TypeScript aware of the marked library from the CDN
declare const marked: any;

type StepStatus = 'locked' | 'active' | 'completed';

// Helper function to detect API rate limit errors.
const isRateLimitError = (error: any): boolean => {
    if (error instanceof Error) {
        // Check for specific text from the Gemini API 429 error
        return error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED');
    }
    return false;
};

// Helper Components
const PromptEditor: React.FC<{ value: string, onChange: (value: string) => void, status: StepStatus, rows?: number, title?: string, placeholder?: string }> = ({ value, onChange, status, rows = 5, title = "編輯 AI 指令 (Prompt)", placeholder }) => {
    const isDisabled = status === 'locked'; // Only locked steps are truly disabled for editing
    const bgColor = 'bg-slate-50'; // Always light background for editable prompts

    return (
        <div className="space-y-1">
           <label className="block text-sm font-medium text-gray-700">{title}</label>
           <textarea
               value={value}
               onChange={e => onChange(e.target.value)}
               disabled={isDisabled}
               rows={rows}
               placeholder={placeholder}
               className={`w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-800 disabled:cursor-not-allowed disabled:text-gray-600 ${bgColor} custom-scroll`}
           />
        </div>
    );
};

const OutputDisplay: React.FC<{ content: string, isLoading: boolean, emptyStateMessage: string }> = ({ content, isLoading, emptyStateMessage }) => {
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [content, isLoading]);

    if (isLoading && !content) {
        return (
            <div className="flex items-center justify-center h-48 bg-gray-50 p-4 rounded-md border border-gray-200 text-gray-500">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI 正在思考中...
            </div>
        );
    }

    if (!content && !isLoading) {
        return (
            <div className="flex items-center justify-center h-48 bg-gray-50 p-4 rounded-md border border-gray-200 text-gray-500">
                {emptyStateMessage}
            </div>
        );
    }

    return (
        <div ref={outputRef} className="prose prose-indigo max-w-none bg-gray-50 p-4 rounded-md h-64 overflow-y-auto border border-gray-200 custom-scroll" dangerouslySetInnerHTML={{ __html: marked.parse(content) }}></div>
    );
};

const StepWrapper: React.FC<React.PropsWithChildren<{ stepNumber: number, title: string, description: string, onRef: (el: HTMLDivElement | null) => void, status: StepStatus }>> = ({ stepNumber, title, description, children, onRef, status }) => {
    const isCompleted = status === 'completed';
    const isActive = status === 'active';

    let borderColor = 'border-gray-300';
    if (isActive) borderColor = 'border-indigo-500';
    if (isCompleted) borderColor = 'border-green-500';

    return (
        <div ref={onRef} className={`bg-white rounded-xl shadow-md p-6 md:p-8 border-t-4 transition-all ${borderColor}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">{`步驟 ${stepNumber}： ${title}`}</h2>
                    <p className="text-gray-500 mt-1">{description}</p>
                </div>
                {isCompleted && (
                    <span className="flex items-center text-sm text-green-600 bg-green-100 px-3 py-1 rounded-full font-medium">
                        <CheckIcon className="w-4 h-4 mr-1.5" />
                        已完成
                    </span>
                )}
            </div>
            <div className="mt-6">
                {children}
            </div>
        </div>
    );
}

const ActionButton: React.FC<React.PropsWithChildren<{ onClick: () => void, disabled?: boolean, isLoading?: boolean, isCompleted?: boolean, rerunLabel?: string }>> = ({ onClick, disabled, isLoading, isCompleted, children, rerunLabel = "重新執行" }) => (
    <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`
           inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white 
           bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800
           ${isCompleted ? 'bg-gray-500 hover:bg-gray-600' : ''}
           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
           disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out
       `}
    >
        {isLoading ? (
            <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                處理中...
            </>
        ) : isCompleted ? (
            <>
                <ArrowPathIcon className="w-5 h-5 mr-2" />
                {rerunLabel}
            </>
        ) : children}
    </button>
);


const Header: React.FC<{ onToggleSidebar: () => void }> = ({ onToggleSidebar }) => (
    <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-full mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center">
                <button
                    onClick={onToggleSidebar}
                    className="md:hidden p-2 -ml-2 mr-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                >
                    <MenuIcon className="h-6 w-6" />
                </button>
                <LogoIcon className="h-8 w-8 text-indigo-600 mr-2" />
                <h1 className="text-2xl font-bold leading-tight text-gray-900">長文 AI 生成器</h1>
            </div>
            {/* Add any other header elements like user profile or settings here */}
        </div>
    </header>
);

const Sidebar: React.FC<{ currentStep: number, navigateToStep: (stepNum: number) => void, totalSteps: number, isMobileOpen: boolean, onClose: () => void }> = ({ currentStep, navigateToStep, totalSteps, isMobileOpen, onClose }) => {
    const { topic, researchData, characters, meetingTranscript, finalArticle, resetAll, isTopicConfirmed, citations } = useAppStore();

    const getStatus = (stepNum: number): StepStatus => {
        if (stepNum < currentStep) return 'completed';
        if (stepNum === currentStep) return 'active';
        return 'locked';
    };

    const isStepLogicallyCompletedForSidebar = useCallback((stepNumber: number): boolean => {
        switch (stepNumber) {
            case 1: return isTopicConfirmed; // Topic is confirmed
            case 2: return researchData.replace(/\s/g, '').length > 50 || citations.length > 0; // Research data exists or citations are present
            case 3: return characters.length > 0; // Characters exist
            case 4: return !!meetingTranscript.trim(); // Transcript exists
            case 5: return !!finalArticle.trim(); // Final article exists
            default: return false;
        }
    }, [isTopicConfirmed, researchData, characters, meetingTranscript, finalArticle, citations]);


    const stepData = [
        { num: 1, title: '產生議題', isComplete: isStepLogicallyCompletedForSidebar(1) },
        { num: 2, title: '資料研究', isComplete: isStepLogicallyCompletedForSidebar(2) },
        { num: 3, title: '建立小組', isComplete: isStepLogicallyCompletedForSidebar(3) },
        { num: 4, title: '開始研討', isComplete: isStepLogicallyCompletedForSidebar(4) },
        { num: 5, title: '最終文章', isComplete: isStepLogicallyCompletedForSidebar(5) },
    ];

    const handleResetAll = useCallback(() => {
        if (window.confirm('確定要重置所有進度嗎？此操作不可逆。')) {
            resetAll();
            onClose(); // Close sidebar after reset on mobile
        }
    }, [resetAll, onClose]);

    return (
        <>
            {isMobileOpen && <div className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden" onClick={onClose}></div>}
            <div className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-40 md:static md:translate-x-0 transition-transform duration-200 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    {/* Sidebar Header: 固定標題 */}
                    <div className="px-6 pt-6 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">生成步驟</h3>
                    </div>

                    {/* Scrollable Navigation Area: 捲動區塊 */}
                    <nav className="space-y-2 flex-1 overflow-y-auto custom-scroll px-6">
                        {stepData.map((s) => {
                            const status = getStatus(s.num);
                            // Allow navigating back to any previous/current step, and forward if logically completed
                            const isClickable = s.num <= currentStep || (s.num > currentStep && s.isComplete); 
                            const isCompleted = status === 'completed';

                            return (
                                <button
                                    key={s.num}
                                    onClick={() => {
                                        if (isClickable) {
                                            navigateToStep(s.num);
                                            onClose(); // Close sidebar on click for mobile
                                        }
                                    }}
                                    disabled={!isClickable}
                                    className={`group flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors
                                        ${isClickable ? 'hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500' : 'cursor-not-allowed opacity-60'}
                                        ${status === 'active' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}
                                        bg-gradient-to-r from-transparent to-transparent group-hover:from-indigo-50 group-hover:to-indigo-100
                                    `}
                                >
                                    <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-3 text-white text-xs font-semibold
                                        ${status === 'active' ? 'bg-indigo-600' : isCompleted ? 'bg-green-600' : 'bg-gray-400'}`}>
                                        {isCompleted ? <CheckIcon className="w-4 h-4" /> : s.num}
                                    </span>
                                    {s.title}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Sidebar Footer: 固定底部按鈕 */}
                    <div className="mt-auto px-6 py-6 border-t border-gray-200">
                        <button
                            onClick={handleResetAll}
                            className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                            <ArrowPathIcon className="w-5 h-5 mr-2" />
                            重置所有進度
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};


const App: React.FC = () => {
    const {
        step, setStep,
        topic, setTopic, isTopicConfirmed, confirmTopic,
        researchData, setResearchData, supplementalResearchQuery, setSupplementalResearchQuery, citations, setCitations,
        characters, setCharacters,
        meetingTranscript, setMeetingTranscript,
        finalArticle, setFinalArticle,
        prompts, setPrompts,
        loading, setLoading, preparingStep, setPreparingStep,
        error, setError,
        resetStepsFrom, appendToResearch, resetAll, deleteCharacter, saveFinalArticleEdit
    } = useAppStore();

    const [isModalOpen, setIsModalOpen] = useState(false); // Add Character modal
    const [copied, setCopied] = useState(false);
    const [confirmation, setConfirmation] = useState<{ message: string; onConfirm: () => void; } | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);


    const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

    const getStepStatus = useCallback((currentStepNumber: number): StepStatus => {
        if (step > currentStepNumber) return 'completed';
        if (step === currentStepNumber) return 'active';
        return 'locked';
    }, [step]);

    // Helper to get logical completion status based on content
    const isStepLogicallyCompleted = useCallback((stepNumber: number): boolean => {
        switch (stepNumber) {
            case 1: return isTopicConfirmed; // Topic is confirmed
            case 2: return researchData.replace(/\s/g, '').length > 50 || citations.length > 0; // Research data exists or citations are present
            case 3: return characters.length > 0; // Characters exist
            case 4: return !!meetingTranscript.trim(); // Transcript exists
            case 5: return !!finalArticle.trim(); // Final article exists
            default: return false;
        }
    }, [isTopicConfirmed, researchData, characters, meetingTranscript, finalArticle, citations]);

    useEffect(() => {
        const activeStepRef = stepRefs.current[step - 1];
        if (activeStepRef) {
            activeStepRef.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [step]);
    
    const handleApiCall = async <T,>(stepNumber: number, apiFn: () => Promise<{ result: T, prompt?: string }>, onSuccess: (result: T) => void, promptUpdater?: (newPrompt: string) => void): Promise<boolean> => {
        setLoading(prev => ({ ...prev, [stepNumber]: true }));
        setPreparingStep(stepNumber);
        setError(null);
        try {
            const { result, prompt } = await apiFn();
            onSuccess(result);
            if (prompt && promptUpdater) promptUpdater(prompt);
            return true;
        } catch (e) {
            if (isRateLimitError(e)) {
                setError('請求過於頻繁，已超出您的目前配額。請稍候片刻再試一次。');
            } else {
                setError(e instanceof Error ? `步驟 ${stepNumber} 失敗: ${e.message}` : '發生未知錯誤。');
            }
            console.error(e);
            return false;
        } finally {
            setLoading(prev => ({ ...prev, [stepNumber]: false }));
            setPreparingStep(null);
        }
    };
    
    const handleStreamApiCall = async (
      stepNumber: number,
      streamApiFn: () => Promise<{ stream: AsyncGenerator<string>, citations?: { title: string; uri: string; }[], prompt?: string }>,
      onStart: () => void,
      onChunk: (chunk: string) => void,
      onComplete: (collectedCitations?: { title: string; uri: string; }[]) => void,
      promptUpdater?: (newPrompt: string) => void
    ): Promise<boolean> => {
        setLoading(prev => ({ ...prev, [stepNumber]: true }));
        setPreparingStep(stepNumber);
        setError(null);
        let collectedCitations: { title: string; uri: string; }[] = [];
        try {
            onStart();
            const { stream, citations: initialCitations, prompt } = await streamApiFn();
            if (prompt && promptUpdater) promptUpdater(prompt);

            // Handle initial citations if returned directly (though stream should handle it)
            if (initialCitations) collectedCitations = initialCitations;

            let firstChunk = true;
            for await (const chunk of stream) {
                if (firstChunk) {
                    setPreparingStep(null);
                    firstChunk = false;
                }
                onChunk(chunk);
                // Note: extracting citations from chunks isn't directly supported by current API model
                // so we rely on the `citations` returned by the promise if available.
                // For a more robust solution, the API should return citations with each chunk,
                // or after the stream is fully consumed.
            }
            onComplete(collectedCitations); // Pass collected citations after stream ends
            return true;
        } catch (e) {
            if (isRateLimitError(e)) {
                setError('請求過於頻繁，已超出您的目前配額。請稍候片刻再試一次。');
            } else {
                setError(e instanceof Error ? `步驟 ${stepNumber} 失敗: ${e.message}` : '發生未知錯誤。');
            }
            console.error(e);
            return false;
        } finally {
            setLoading(prev => ({ ...prev, [stepNumber]: false }));
            setPreparingStep(null);
        }
    };

    const createRerunHandler = (stepToRerun: number, actionFn: () => void, messageOverride?: string) => {
        return () => {
            const isCompleted = isStepLogicallyCompleted(stepToRerun); // Use logical completion for rerun condition
            if (isCompleted) {
                 setConfirmation({
                    message: messageOverride || `這將會重新執行步驟 ${stepToRerun} 並清除其後所有步驟的資料。確定要繼續嗎？`,
                    onConfirm: () => {
                        resetStepsFrom(stepToRerun); // Reset from current step, not next step
                        actionFn();
                        setConfirmation(null);
                    }
                });
            } else {
                actionFn();
            }
        };
    };

    // Step 1 Actions
    // Function that performs the actual AI generation, confirms, and advances.
    const performAITopicGeneration = async () => {
        const success = await handleApiCall(1, () => generateTopic(prompts.step1), setTopic, (p) => setPrompts(prev => ({...prev, step1: p})));
        if (success) {
            // Do NOT auto-confirm or auto-advance. Let the user click "確認議題並前往下一步"
            // confirmTopic();
            // setStep(2);
        }
    };

    // Wrapper for AI generation, potentially with rerun confirmation
    const handleGenerateTopicAI = createRerunHandler(1, performAITopicGeneration, '重新決定議題將會清除所有後續步驟的進度。確定要繼續嗎？');

    // Function to simply confirm the current topic and move to next step, no AI call
    const handleConfirmAndAdvance = () => {
        if (!topic.trim()) {
            setError('請先輸入一個議題。');
            return;
        }
        confirmTopic();
        setStep(2);
        setError(null); // Clear any previous error
    };

    // Handler for "重新決定議題" button to reset topic confirmation and state
    const handleResetTopicConfirmation = () => {
        setConfirmation({
            message: '重新決定議題將會清除所有後續步驟的進度。確定要繼續嗎？',
            onConfirm: () => {
                resetStepsFrom(1); // This sets topic='', isTopicConfirmed=false, and clears steps 2-5.
                setConfirmation(null);
            },
        });
    };


    // Step 2 Actions
    const handleConductResearch = createRerunHandler(2, async () => {
        const success = await handleStreamApiCall(2, 
            () => conductResearchStream(topic, prompts.step2),
            // The `setResearchData` and `setCitations` functions now correctly handle functional updates due to the store changes.
            () => { setResearchData(''); setCitations([]); }, // Clear existing research on start
            (chunk) => setResearchData(prev => prev + chunk),
            (newCitations) => setCitations(newCitations || [])
        );
        if (success) {
            // No auto-advance, user clicks '下一步'
        }
    }, '這將會重新執行「資料研究」並清除所有現有研究資料、引用來源，以及其後所有步驟的資料。確定要繼續嗎？');

    const handleSupplementalResearch = async () => {
        if (!supplementalResearchQuery.trim()) return;

        // Check if there's any progress in subsequent steps that would be reset
        const hasSubsequentProgress = characters.length > 0 || !!meetingTranscript.trim() || !!finalArticle.trim();

        const performSupplementalResearchAction = async () => {
            // Reset steps from 3 (characters, meetingTranscript, finalArticle)
            // This will clear content even if they were empty, which is fine as it ensures clean state.
            resetStepsFrom(3); 
            const query = supplementalResearchQuery.trim();
            const success = await handleStreamApiCall(2,
                () => supplementalResearchStream(query, researchData, prompts.step2Add),
                // The `setResearchData` and `setCitations` functions now correctly handle functional updates due to the store changes.
                () => {
                    // Prepend new heading for supplemental research
                    setResearchData(prev => prev + `\n\n---\n\n## 補充概念：${query}\n\n`);
                },
                (chunk) => setResearchData(prev => prev + chunk),
                (newCitations) => setCitations(prev => {
                    const merged = [...prev];
                    if (newCitations) {
                        for (const c of newCitations) {
                            if (!merged.some(mc => mc.uri === c.uri)) {
                                merged.push(c);
                            }
                        }
                    }
                    return merged;
                })
            );
            if (success) {
                setSupplementalResearchQuery('');
            }
            if (confirmation) { // Only clear confirmation if it was shown
                setConfirmation(null); 
            }
        };

        if (hasSubsequentProgress) {
            setConfirmation({
                message: '補充研究將會重設「產生會議小組」、「開始研討」和「最終文章輸出」的進度。確定要繼續嗎？',
                onConfirm: performSupplementalResearchAction,
            });
        } else {
            // No subsequent progress to reset, proceed directly
            await performSupplementalResearchAction();
        }
    };

    // Step 3 Actions
    const handleGenerateGroup = createRerunHandler(3, async () => {
        // The `setCharacters` and `setPrompts` functions now correctly handle functional updates due to the store changes.
        const success = await handleApiCall(3, () => generateMeetingGroup(topic, researchData, prompts.step3), setCharacters, (p) => setPrompts(prev => ({...prev, step3: p})));
        if (success) {
            // No auto-advance
        }
    }, '這將會重新生成會議小組並清除其後所有步驟的資料。確定要繼續嗎？');

    const handleSaveCharacter = (character: Character) => {
        setCharacters(prev => [...prev, character]);
        resetStepsFrom(4); // Reset discussion and article
        setIsModalOpen(false); // Close modal after saving
    }

    const handleDeleteCharacter = (indexToDelete: number) => {
        setConfirmation({
            message: '刪除此角色將會重設「開始研討」和「最終文章輸出」的進度。確定要繼續嗎？',
            onConfirm: () => {
                deleteCharacter(indexToDelete);
                resetStepsFrom(4); // Reset discussion and article
                setConfirmation(null);
            }
        });
    };

    // Step 4 Actions
    const handleStartDiscussion = createRerunHandler(4, async () => {
        const success = await handleStreamApiCall(4,
            () => startDiscussionStream(topic, researchData, characters, prompts.step4, prompts.step4System),
            // The `setMeetingTranscript` function now correctly handle functional updates due to the store changes.
            () => setMeetingTranscript(''),
            (chunk) => setMeetingTranscript(prev => prev + chunk),
            () => {} // No citations here
        );
        if (success) {
            // No auto-advance
        }
    }, '這將會重新開始研討並清除其後所有步驟的資料。確定要繼續嗎？');

    const handleExtendDiscussion = async () => {
        setConfirmation({
            message: '延長討論將會重設「最終文章輸出」的進度。確定要繼續嗎？',
            onConfirm: async () => {
                resetStepsFrom(5); // Reset article only
                const success = await handleStreamApiCall(4,
                    () => extendDiscussionStream(topic, researchData, characters, meetingTranscript, prompts.step4Extend, prompts.step4System),
                    // The `setMeetingTranscript` function now correctly handle functional updates due to the store changes.
                    () => setMeetingTranscript(prev => `${prev}\n\n---\n\n### 延伸討論\n\n`),
                    (chunk) => setMeetingTranscript(prev => prev + chunk),
                    () => {} // No citations here
                );
                if (success) {
                    // Stay on step 4 for further extensions or user clicks '下一步'
                }
                setConfirmation(null);
            }
        });
    };

    // Step 5 Actions
    const handleGenerateArticle = createRerunHandler(5, async () => {
        const success = await handleStreamApiCall(5,
            () => generateFinalArticleStream(topic, researchData, meetingTranscript, prompts.step5, prompts.step5System),
            // The `setFinalArticle` function now correctly handles functional updates due to the store changes.
            () => setFinalArticle(''),
            (chunk) => setFinalArticle(prev => prev + chunk),
            () => {} // No citations here
        );
        if (success) {
            // No auto-advance
        }
    }, '這將會重新生成最終文章。確定要繼續嗎？');

    const handleSaveFinalArticleEdit = () => {
        // The finalArticle is already state, so editing the textarea
        // automatically updates it. This button would just be a visual cue
        // or could trigger a more complex backend save in a full app.
        alert('文章編輯已儲存！'); // For demonstration
        saveFinalArticleEdit(); // Trigger store action to mark as saved/stable
    };
    
    const handleCopyToClipboard = useCallback(() => {
        if (!finalArticle) return;
        navigator.clipboard.writeText(finalArticle).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [finalArticle]);

    return (
        <div className="min-h-screen flex flex-col">
            <Header onToggleSidebar={() => setIsSidebarOpen(prev => !prev)} />
            <div className="flex flex-1">
                <Sidebar
                    currentStep={step}
                    navigateToStep={setStep}
                    totalSteps={5}
                    isMobileOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                />
                <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
                    <div className="space-y-8">
                        {error && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                                <p className="font-bold">錯誤</p>
                                <p>{error}</p>
                            </div>
                        )}
                        
                        {/* Step 1 */}
                        <StepWrapper stepNumber={1} title="決定議題" description="輸入您想探討的主題，或讓 AI 幫您發想一個。" onRef={el => stepRefs.current[0] = el} status={getStepStatus(1)}>
                            <div className="space-y-4">
                                <textarea
                                    value={topic}
                                    onChange={e => setTopic(e.target.value)}
                                    placeholder="例如：火影忍者故事與日本當代社會創傷的關聯"
                                    className={`w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-800 bg-sky-50 focus:bg-white custom-scroll`}
                                    rows={3}
                                />
                                <PromptEditor value={prompts.step1} onChange={v => setPrompts(p => ({...p, step1: v}))} status={getStepStatus(1)} title="AI 議題發想指令" placeholder="請以繁體中文，生成一個獨特的長篇文章主題..." />
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {!isTopicConfirmed ? (
                                        <>
                                            {/* Button to confirm manual input and move to next step */}
                                            <ActionButton onClick={handleConfirmAndAdvance} isLoading={false} disabled={!topic.trim()}>
                                                確認議題並前往下一步
                                            </ActionButton>
                                            {/* Button to let AI generate, but not confirm or advance */}
                                            <ActionButton onClick={handleGenerateTopicAI} isLoading={loading[1]}>
                                                <SparklesIcon className="w-5 h-5 mr-2" />
                                                讓 AI 隨機發想
                                            </ActionButton>
                                        </>
                                    ) : (
                                        // Once confirmed, this button appears to allow resetting the confirmation and showing initial options
                                        <ActionButton onClick={handleResetTopicConfirmation} isLoading={false} isCompleted={true} rerunLabel="重新決定議題">
                                            重新決定議題
                                        </ActionButton>
                                    )}
                                </div>
                            </div>
                        </StepWrapper>

                        {/* Step 2 */}
                        <StepWrapper stepNumber={2} title="資料研究" description="AI 會根據您的議題，收集詳細的背景資訊與引用來源。" onRef={el => stepRefs.current[1] = el} status={getStepStatus(2)}>
                            <div className="space-y-6">
                                <div>
                                    <PromptEditor value={prompts.step2} onChange={v => setPrompts(p => ({...p, step2: v}))} status={getStepStatus(2)} title="AI 研究指令" />
                                    <div className="flex flex-wrap items-center gap-2 mt-4">
                                        <ActionButton 
                                            onClick={handleConductResearch} 
                                            isLoading={loading[2] && !supplementalResearchQuery.trim()} // Only loading for main research
                                            isCompleted={isStepLogicallyCompleted(2)} 
                                            rerunLabel="重新研究" 
                                            disabled={getStepStatus(2) === 'locked' || !topic.trim()}
                                        >
                                            開始研究
                                        </ActionButton>
                                        {isStepLogicallyCompleted(2) && ( // Use logical completion for visibility
                                            <ActionButton onClick={() => setStep(3)} isLoading={false} isCompleted={false}>
                                                前往下一步
                                            </ActionButton>
                                        )}
                                    </div>
                                </div>
                                <OutputDisplay content={researchData} isLoading={loading[2] && !supplementalResearchQuery.trim() && !researchData} emptyStateMessage="AI 將在此處輸出研究資料..." />
                                {citations.length > 0 && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200 custom-scroll">
                                        <h4 className="text-lg font-semibold text-gray-800 mb-2 flex items-center">
                                            <BookOpenIcon className="w-5 h-5 mr-2 text-indigo-600" />引用來源
                                        </h4>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                                            {citations.map((cite, index) => (
                                                <li key={index}>
                                                    <a href={cite.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{cite.title}</a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <div className="border-t pt-6">
                                    <h3 className="text-lg font-medium text-gray-900">補充概念研究</h3>
                                    <p className="text-sm text-gray-500 mt-1">輸入您想額外研究的關鍵字或問題，AI 會將結果附加到上方。</p>
                                    <div className="mt-4 space-y-4">
                                        <PromptEditor
                                            title="要補充的關鍵字/問題"
                                            value={supplementalResearchQuery}
                                            onChange={setSupplementalResearchQuery}
                                            status={getStepStatus(2)}
                                            rows={2}
                                            placeholder="例如：日本泡沫經濟後的失落一代；動漫如何反映社會壓力"
                                        />
                                        <PromptEditor value={prompts.step2Add} onChange={v => setPrompts(p => ({...p, step2Add: v}))} status={getStepStatus(2)} title="AI 補充研究指令" />
                                        <div className="flex items-center">
                                            <button
                                                onClick={handleSupplementalResearch}
                                                disabled={(loading[2] && !!supplementalResearchQuery.trim()) || !supplementalResearchQuery.trim() || getStepStatus(2) === 'locked'}
                                                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                                            >
                                                { (loading[2] && !!supplementalResearchQuery.trim()) ? (
                                                    <>
                                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        處理中...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-4 h-4 mr-2" />
                                                        新增補充資料
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </StepWrapper>

                        {/* Step 3 */}
                        <StepWrapper stepNumber={3} title="產生會議小組" description="建立一組 AI 專家團隊，從多元角度探討議題。" onRef={el => stepRefs.current[2] = el} status={getStepStatus(3)}>
                             <div className="space-y-4">
                                <PromptEditor value={prompts.step3} onChange={v => setPrompts(p => ({...p, step3: v}))} status={getStepStatus(3)} rows={8} title="AI 小組生成指令" />
                                {characters.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {characters.map((char, index) => (
                                            <div key={index} className="bg-gray-50 p-4 rounded-lg border flex flex-col justify-between">
                                                <div>
                                                    <p className="font-bold text-indigo-700">{char.name}</p>
                                                    <p className="text-sm font-medium text-gray-600">{char.profession}</p>
                                                    <p className="text-sm text-gray-500 mt-2">{char.background}</p>
                                                </div>
                                                <div className="mt-3 flex justify-end">
                                                    <button onClick={() => handleDeleteCharacter(index)} className="text-red-600 hover:text-red-800 transition-colors">
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <OutputDisplay content="" isLoading={loading[3]} emptyStateMessage="AI 將在此處生成專家團隊，每個成員都將有詳細背景描述。" />
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                     <ActionButton onClick={handleGenerateGroup} isLoading={loading[3]} isCompleted={isStepLogicallyCompleted(3)} disabled={getStepStatus(3) === 'locked' || !topic.trim() || !researchData.trim()}>
                                        <SparklesIcon className="w-5 h-5 mr-2" />
                                        建立專家團隊
                                    </ActionButton>
                                    <button onClick={() => setIsModalOpen(true)} disabled={getStepStatus(3) === 'locked'} className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors focus:ring-indigo-500 focus:border-indigo-500">
                                        <UserPlusIcon className="w-5 h-5 mr-2" />
                                        手動新增角色
                                    </button>
                                    {isStepLogicallyCompleted(3) && ( // Use logical completion for visibility
                                        <ActionButton onClick={() => setStep(4)} isLoading={false} isCompleted={false}>
                                            前往下一步
                                        </ActionButton>
                                    )}
                                </div>
                            </div>
                        </StepWrapper>
                        
                        {/* Step 4 */}
                        <StepWrapper stepNumber={4} title="開始研討" description="AI 專家們將針對議題進行辯論，產生文章的核心觀點。" onRef={el => stepRefs.current[3] = el} status={getStepStatus(4)}>
                            <div className="space-y-4">
                                 <PromptEditor title="編輯 AI 角色行為 (System Instruction)" value={prompts.step4System} onChange={v => setPrompts(p => ({...p, step4System: v}))} status={getStepStatus(4)} rows={3} />
                                 <PromptEditor value={prompts.step4} onChange={v => setPrompts(p => ({...p, step4: v}))} status={getStepStatus(4)} rows={8} />
                                <OutputDisplay content={meetingTranscript} isLoading={loading[4]} emptyStateMessage="AI 專家們將在此處進行辯論，產出會議記錄..." />
                                <div className="flex flex-wrap items-center gap-2">
                                    <ActionButton onClick={handleStartDiscussion} isLoading={loading[4] && !meetingTranscript.trim()} isCompleted={isStepLogicallyCompleted(4)} disabled={getStepStatus(4) === 'locked' || characters.length === 0 || !topic.trim() || !researchData.trim()}>
                                        開始研討
                                    </ActionButton>
                                    {isStepLogicallyCompleted(4) && ( // Use logical completion for visibility
                                        <>
                                            <ActionButton onClick={handleExtendDiscussion} isLoading={loading[4] && !!meetingTranscript.trim()} isCompleted={false} disabled={getStepStatus(4) === 'locked' || !topic.trim() || !researchData.trim() || characters.length === 0}>
                                                <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2" />
                                                延長討論
                                            </ActionButton>
                                            <ActionButton onClick={() => setStep(5)} isLoading={false} isCompleted={false}>
                                                前往下一步
                                            </ActionButton>
                                        </>
                                    )}
                                </div>
                            </div>
                        </StepWrapper>
                        
                        {/* Step 5 */}
                        <StepWrapper stepNumber={5} title="最終文章輸出" description="一位中立的 AI 會將所有討論內容，統整成一篇完整的長文。" onRef={el => stepRefs.current[4] = el} status={getStepStatus(5)}>
                             <div className="space-y-4">
                                 <PromptEditor title="編輯 AI 角色行為 (System Instruction)" value={prompts.step5System} onChange={v => setPrompts(p => ({...p, step5System: v}))} status={getStepStatus(5)} rows={3} />
                                 <PromptEditor value={prompts.step5} onChange={v => setPrompts(p => ({...p, step5: v}))} status={getStepStatus(5)} rows={8} />
                                {finalArticle ? (
                                    <div className="relative">
                                        <textarea
                                            value={finalArticle}
                                            onChange={e => setFinalArticle(e.target.value)}
                                            className="prose prose-indigo max-w-none bg-gray-50 p-4 rounded-md h-96 overflow-y-auto border w-full custom-scroll text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            rows={20} // Adjust rows for better initial height
                                        />
                                        <div className="absolute top-2 right-2 flex space-x-2">
                                            <button onClick={handleSaveFinalArticleEdit} className="bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700 transition" aria-label="儲存編輯">
                                                儲存編輯
                                            </button>
                                            <button onClick={handleCopyToClipboard} className="bg-gray-700 text-white p-2 rounded-md hover:bg-gray-600 transition" aria-label="複製文章">
                                                {copied ? <CheckIcon className="w-5 h-5" /> : <ClipboardIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <OutputDisplay content="" isLoading={loading[5]} emptyStateMessage="AI 將在此處生成最終文章..." />
                                )}
                                <div className="flex items-center">
                                    <ActionButton onClick={handleGenerateArticle} isLoading={loading[5]} isCompleted={isStepLogicallyCompleted(5)} disabled={getStepStatus(5) === 'locked' || !topic.trim() || !researchData.trim() || !meetingTranscript.trim()}>
                                        產生最終文章
                                    </ActionButton>
                                </div>
                            </div>
                        </StepWrapper>
                    </div>
                </main>
                <AddCharacterModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveCharacter} />
                <ConfirmationModal 
                    isOpen={!!confirmation}
                    message={confirmation?.message || ''}
                    onConfirm={() => confirmation?.onConfirm()}
                    onCancel={() => setConfirmation(null)}
                />
            </div>
        </div>
    );
};

export default App;