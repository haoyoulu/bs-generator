import React, { useState } from 'react';
import type { Character } from '../types';

interface AddCharacterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (character: Character) => void;
}

const AddCharacterModal: React.FC<AddCharacterModalProps> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [profession, setProfession] = useState('');
    const [background, setBackground] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (name && profession && background) {
            onSave({ name, profession, background });
            setName('');
            setProfession('');
            setBackground('');
            onClose();
        } else {
            alert('請填寫所有欄位。');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">手動新增角色</h2>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">姓名</label>
                        <input
                            type="text"
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="例如：陳大文 博士"
                        />
                    </div>
                    <div>
                        <label htmlFor="profession" className="block text-sm font-medium text-gray-700">職業</label>
                        <input
                            type="text"
                            id="profession"
                            value={profession}
                            onChange={(e) => setProfession(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="例如：量子物理學家"
                        />
                    </div>
                    <div>
                        <label htmlFor="background" className="block text-sm font-medium text-gray-700">背景與觀點</label>
                        <textarea
                            id="background"
                            value={background}
                            onChange={(e) => setBackground(e.target.value)}
                            rows={4}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="描述角色的專業知識與獨特看法..."
                        />
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                    >
                        儲存角色
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddCharacterModal;