const video = document.getElementById('preview');
const btnCapturar = document.getElementById('btn-capturar');
const canvas = document.getElementById('canvas-processamento');
const statusMsg = document.getElementById('status');
const resultCard = document.getElementById('result-card');
const API_KEY = document.getElementById('api-key').value.trim();

// Configurações extraídas do seu Requisito [cite: 14, 23]
const GABARITO_REFERENCIA = "1:A, 2:C, 3:E, 4:B, 5:D";

// Chave da API (Obtenha em: https://aistudio.google.com/)

// Mudamos para v1beta para suportar o formato JSON nativo e usamos o nome completo do modelo
const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// 1. Iniciar Câmera do Celular (Traseira)
async function iniciarCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 } },
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        statusMsg.innerText = "Erro ao acessar câmera: " + err.message;
    }
}

// 2. Capturar e Processar Imagem
btnCapturar.addEventListener('click', async () => {
    const t0 = performance.now(); // Início da medição NFR
    statusMsg.innerText = "Capturando...";

    const ctx = canvas.getContext('2d');
    
    // Especificações Técnicas: Redução para ~1024px 
    const larguraAlvo = 1024;
    const proporcao = video.videoHeight / video.videoWidth;
    canvas.width = larguraAlvo;
    canvas.height = larguraAlvo * proporcao;

    // Desenha o frame atual do vídeo no canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imgBase64 = canvas.toDataURL('image/jpeg', 0.8);
    
    // Simulação da lógica de negócio e chamada de API [cite: 6, 22, 23]
    corrigirComIA(imgBase64, t0);
});

async function corrigirComIA(imagemBase64, tempoInicio) {
    statusMsg.innerText = "IA Analisando gabarito...";

    // Remove o cabeçalho do base64 se existir
    const base64Data = imagemBase64.includes(',') ? imagemBase64.split(',')[1] : imagemBase64;

    const payload = {
        contents: [{
            parts: [{
                text: "Analise o gabarito. Retorne um JSON estrito: {\"questoes\": [{\"id\": 1, \"marcada\": \"A\"}]}. Não adicione texto antes ou depois."
            }, {
                inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Data
                }
            }]
        }],
        generationConfig: {
            // No v1beta, este campo é permitido. Se der erro, o catch tratará.
            response_mime_type: "application/json", 
            temperature: 0.1
        }
    };

    try {
        const response = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        alert(data);

        if (!response.ok) {
            // Se o erro for 404 de novo, é porque sua conta ainda não tem acesso ao Flash no v1beta
            throw new Error(data.error?.message || "Erro na API");
        }

        const textoResposta = data.candidates[0].content.parts[0].text;
        
        // Garante que o texto seja um objeto JSON
        const jsonResposta = JSON.parse(textoResposta.replace(/```json|```/g, ""));
        
        const t1 = performance.now();
        const latencia = ((t1 - tempoInicio) / 1000).toFixed(2);
        
        exibirResultado(jsonResposta, latencia);
        tocarBeep();

    } catch (erro) {
        console.error("Erro detalhado:", erro);
        statusMsg.innerText = "Erro: " + erro.message;
        
        // Dica técnica: Se o erro persistir em 404, tente trocar na URL:
        // gemini-1.5-flash por gemini-1.5-flash-latest
    }
}

function exibirResultado(data, tempo) {
    resultCard.style.display = 'block';
    // O JSON retornado seguirá suas Regras de Negócio [cite: 8, 12, 13]
    document.getElementById('json-output').innerText = JSON.stringify(data, null, 2);
    statusMsg.innerText = `BIP! Sucesso em ${tempo}s`; //[cite: 24]
}

function exibirResultado(data) {
    resultCard.style.display = 'block';
    document.getElementById('json-output').innerText = JSON.stringify(data, null, 2);
    statusMsg.innerText = `Finalizado em ${data.tempo_processamento}`;
}

function tocarBeep() {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

// Inicializa a câmera ao carregar
iniciarCamera();