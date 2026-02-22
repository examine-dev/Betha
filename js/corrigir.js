// 1. Referências dos elementos
const video = document.getElementById('preview');
const btnCapturar = document.getElementById('btn-capturar');
const canvas = document.getElementById('canvas-processamento');
const statusMsg = document.getElementById('status');
const apiKeyInput = document.getElementById('api-key');

// 2. Iniciar Câmera (SÓ FUNCIONA EM HTTPS)
async function iniciarCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        video.srcObject = stream;
        statusMsg.innerText = "Câmera ativa. Insira a chave e clique em Corrigir.";
    } catch (err) {
        statusMsg.innerText = "Erro: Acesse via GitHub Pages (HTTPS) para usar a câmera.";
    }
}

// 3. Função de Correção (Ajustada para evitar o erro 404)
async function capturarECorrigir() {
    const tInicio = performance.now();
    const CHAVE = apiKeyInput.value.trim();
    
    if (!CHAVE) {
        alert("Cole sua chave da API do Google primeiro!");
        return;
    }

    // URL UNIVERSAL - Testada para funcionar sem erro 404
    const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CHAVE}`;

    try {
        statusMsg.innerText = "IA Analisando...";
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        // Payload simplificado e robusto
        const payload = {
            contents: [{
                parts: [{
                    text: "Identifique as alternativas marcadas no gabarito. Retorne JSON: {\"questoes\": [{\"id\": 1, \"marcada\": \"A\"}]}"
                }, {
                    inline_data: { mime_type: "image/jpeg", data: base64Data }
                }]
            }],
            generationConfig: {
                // Removemos o response_mime_type para testar a compatibilidade máxima
                temperature: 0.1
            }
        };

        const response = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Erro desconhecido");
        }

        // Limpeza da resposta (caso a IA mande ```json ... ```)
        let textoResposta = data.candidates[0].content.parts[0].text;
        const jsonLimpo = textoResposta.replace(/```json|```/g, "").trim();
        const resultado = JSON.parse(jsonLimpo);
        
        if (typeof renderVisual === 'function') {
            renderVisual(resultado);
        }

        statusMsg.innerText = `Sucesso! (${((performance.now() - tInicio)/1000).toFixed(2)}s)`;

    } catch (erro) {
        console.error(erro);
        alert("Erro: " + erro.message);
        statusMsg.innerText = "Falha na análise.";
    }
}

// Inicialização
window.addEventListener('load', iniciarCamera);
btnCapturar.addEventListener('click', capturarECorrigir);
