document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const savedPromptsSelect = document.getElementById('savedPrompts');
    const promptInput = document.getElementById('promptInput');
    const savePromptBtn = document.getElementById('savePromptBtn');
    const referenceImageInput = document.getElementById('referenceImage');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const generateBtn = document.getElementById('generateBtn');
    
    // States
    const emptyState = document.querySelector('.empty-state');
    const loadingState = document.querySelector('.loading-state');
    const successState = document.querySelector('.success-state');
    const errorState = document.querySelector('.error-state');
    const generatedImage = document.getElementById('generatedImage');
    const errorMessage = document.getElementById('errorMessage');
    const downloadBtn = document.getElementById('downloadBtn');

    let currentBase64Image = null;

    // Load API Key
    const savedApiKey = localStorage.getItem('googleAiApiKey');
    if (savedApiKey) apiKeyInput.value = savedApiKey;

    apiKeyInput.addEventListener('change', (e) => {
        localStorage.setItem('googleAiApiKey', e.target.value.trim());
    });

    // Load Saved Prompts
    function loadSavedPrompts() {
        const saved = JSON.parse(localStorage.getItem('savedPrompts') || '[]');
        
        // Keep only default option
        while (savedPromptsSelect.options.length > 1) {
            savedPromptsSelect.remove(1);
        }

        saved.forEach((prompt, index) => {
            const option = document.createElement('option');
            option.value = index;
            // truncate text for display
            option.text = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;
            savedPromptsSelect.appendChild(option);
        });
    }

    loadSavedPrompts();

    // Handle Saving Prompt
    savePromptBtn.addEventListener('click', () => {
        const currentPrompt = promptInput.value.trim();
        if (!currentPrompt) return alert('請先輸入題詞！');

        const saved = JSON.parse(localStorage.getItem('savedPrompts') || '[]');
        if (!saved.includes(currentPrompt)) {
            saved.push(currentPrompt);
            localStorage.setItem('savedPrompts', JSON.stringify(saved));
            loadSavedPrompts();
            alert('題詞已儲存！');
        } else {
            alert('此題詞已存在！');
        }
    });

    // Handle Selecting Saved Prompt
    savedPromptsSelect.addEventListener('change', (e) => {
        if (e.target.value !== "") {
            const saved = JSON.parse(localStorage.getItem('savedPrompts') || '[]');
            promptInput.value = saved[e.target.value];
        }
    });

    // Handle Image Upload
    referenceImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            currentBase64Image = event.target.result; // data:image/jpeg;base64,...
            imagePreview.src = currentBase64Image;
            imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });

    removeImageBtn.addEventListener('click', () => {
        currentBase64Image = null;
        referenceImageInput.value = '';
        imagePreviewContainer.classList.add('hidden');
    });

    // Show specific state in result panel
    function showState(stateElement) {
        [emptyState, loadingState, successState, errorState].forEach(el => el.classList.add('hidden'));
        stateElement.classList.remove('hidden');
    }

    // Generate Image Action
    generateBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const prompt = promptInput.value.trim();
        const model = modelSelect.value;

        if (!apiKey) return alert('請輸入 Google AI API Key！');
        if (!prompt) return alert('請輸入題詞！');

        showState(loadingState);
        generateBtn.disabled = true;
        generateBtn.textContent = '產生中...';

        try {
            // Google Generative Language API generateContent Endpoint
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            const payload = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    // 要求回傳圖片格式 (針對支援的生圖模型)
                    responseMimeType: "image/jpeg"
                }
            };

            // 如果有提供參考圖片，加入到 payload 中
            if (currentBase64Image) {
                const matches = currentBase64Image.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
                if (matches && matches.length === 3) {
                    payload.contents[0].parts.push({
                        inlineData: {
                            mimeType: matches[1],
                            data: matches[2]
                        }
                    });
                }
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'API 請求失敗');
            }

            // Extract image from response (支援 Gemini 格式與舊版 Predict 格式)
            if (data.candidates && data.candidates.length > 0 && 
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                
                const imagePart = data.candidates[0].content.parts.find(p => p.inlineData);
                
                if (imagePart) {
                    const imgBase64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    generatedImage.src = imgBase64;
                    downloadBtn.href = imgBase64;
                    showState(successState);
                } else if (data.candidates[0].content.parts[0].text) {
                    // 若模型只回傳文字
                    throw new Error('API 回傳了文字而非圖片：' + data.candidates[0].content.parts[0].text.substring(0, 50) + '...');
                } else {
                    throw new Error('API 回傳成功，但未包含圖片資料。');
                }
            } else if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64Encoded) {
                const imgBase64 = `data:image/jpeg;base64,${data.predictions[0].bytesBase64Encoded}`;
                generatedImage.src = imgBase64;
                downloadBtn.href = imgBase64;
                showState(successState);
            } else {
                console.log('API 回傳：', data);
                throw new Error('API 沒有回傳預期的圖片格式。請檢查模型名稱或權限。');
            }

        } catch (error) {
            console.error('Generation Error:', error);
            errorMessage.textContent = error.message;
            showState(errorState);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '產生圖片 ✨';
        }
    });
});
