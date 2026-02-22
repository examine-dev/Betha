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
    capturarECorrigir();
});


async function capturarECorrigir() {
    const t0 = performance.now();
    
    // 1. CAPTURA A CHAVE DENTRO DA FUNÇÃO (Fundamental para evitar o erro de unregistered)
    const chaveInput = document.getElementById('api-key').value.trim();
    
    if (!chaveInput) {
        alert("Por favor, cole sua chave AIzaSy... no campo de configurações.");
        return;
    }

    // 2. URL COM O NOME DO MODELO ATUALIZADO (gemini-1.5-flash-latest)
    const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${chaveInput}`;

    try {
        statusMsg.innerText = "Capturando imagem...";
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        statusMsg.innerText = "IA Analisando...";

        const payload = {
            contents: [{
                parts: [
                    { text: "Analise o gabarito. Retorne apenas JSON: {\"questoes\": [{\"id\": 1, \"marcada\": \"A\"}]}" },
                    { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json",
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
            // Se der erro, mostra o que o Google respondeu exatamente
            throw new Error(data.error?.message || "Erro na chamada da API");
        }

        const textoResposta = data.candidates[0].content.parts[0].text;
        const jsonResposta = JSON.parse(textoResposta);
        
        const t1 = performance.now();
        const latencia = ((t1 - t0) / 1000).toFixed(2);
        
        // Exibe o resultado usando a sua função renderVisual do HTML
        if (typeof renderVisual === 'function') {
            renderVisual(jsonResposta);
        }
        
        statusMsg.innerText = `Sucesso em ${latencia}s!`;

    } catch (erro) {
        console.error("Erro:", erro);
        statusMsg.innerText = "Falha: " + erro.message;
        alert("Erro detalhado: " + erro.message);
    }
}

// Escuta o clique do botão
btnCapturar.addEventListener('click', capturarECorrigir);

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
