// O objeto 'cv' (OpenCV) e a função 'jsQR' devem estar disponíveis globalmente.

// ------- Elementos HTML e Configurações Globais (Mantenho como você forneceu) -------
// Seleciona o canvas
const video = document.getElementById('video');
const canvas = document.getElementById('photoCanvas');
const auxCanvas = document.getElementById('auxCanvas');
const snapBtn = document.getElementById('snapBtn');
const log = document.getElementById('log');

canvas.style.display = 'block'; // mostra o canvas
canvas.width = 400;
canvas.height = 400;
let ctx = canvas.getContext('2d', { willReadFrequently: true });

const GABARITO_CORRETO = {
    1: 'A', 2: 'B', 3: 'E', 4: 'C', 5: 'D', 6: 'A', 7: 'C', 8: 'B', 9: 'E', 10: 'D',
    11: 'B', 12: 'A', 13: 'C', 14: 'D', 15: 'E', 16: 'B', 17: 'A', 18: 'D', 19: 'C', 20: 'E',
    21: 'A', 22: 'D', 23: 'B', 24: 'C', 25: 'E', 26: 'A', 27: 'B', 28: 'D', 29: 'C', 30: 'E',
    31: 'B', 32: 'A', 33: 'E', 34: 'C', 35: 'D', 36: 'A', 37: 'B', 38: 'C', 39: 'E', 40: 'D',
    41: 'C', 42: 'A', 43: 'B', 44: 'D', 45: 'E', 46: 'A', 47: 'C', 48: 'B', 49: 'E', 50: 'D', 
    51: 'B', 52: 'A', 53: 'C', 54: 'E', 55: 'D', 56: 'B', 57: 'C', 58: 'A', 59: 'D', 60: 'E',
    61: 'A', 62: 'B', 63: 'D', 64: 'C', 65: 'E', 66: 'B', 67: 'A', 68: 'D', 69: 'C', 70: 'E',
    71: 'D', 72: 'B', 73: 'A', 74: 'C', 75: 'E', 76: 'A', 77: 'B', 78: 'C', 79: 'D', 80: 'E',    
    81: 'B', 82: 'D', 83: 'A', 84: 'C', 85: 'E', 86: 'D', 87: 'B', 88: 'A', 89: 'C', 90: 'E',
    91: 'B', 92: 'D', 93: 'A', 94: 'E', 95: 'C', 96: 'D', 97: 'A', 98: 'B', 99: 'E', 100: 'C' 
};

// 1. inicia o OpenCv
function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        document.getElementById('log').innerText = 'OpenCV carregado com sucesso!';
        startCam();

    };
}

// 2. Inicia a câmera do dispositivo
function startCam(){
    const constraints = {         
        video: {
            facingMode: "environment"  // força a usar a câmera traseira
        },
        video: true,
        audio: false
    };
    // Pega a câmera
    navigator.mediaDevices.getUserMedia( { video: { facingMode: "environment"}, audio: false} )
        .then(stream => {
            video.srcObject = stream;
            video.play();             
            video.addEventListener('loadeddata', startProcessing); // Chamada ao processamento do vídeo
        })
        .catch(err => {
            console.error('Erro ao acessar a câmera:', err);
            document.getElementById('log').innerText = 'Erro ao acessar a câmera';
        });
};

// 3. Processa o frame do vídeo (REVISADA)
function startProcessing() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Declara e inicializa a matriz 'src' (source/origem) do OpenCV
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4); 
    // Declara e inicializa a matriz 'dst' (destination/destino) do OpenCV
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);

    function processVideo() {
        try {
            // Captura frame da câmera
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            src.data.set(imageData.data);

            // Copia frame para dst (onde desenharemos)
            src.copyTo(dst);

            // Define as 3 regiões de referência
            let rectSize = 50;
            let rects = [
                { x: 20, y: 20, w: rectSize, h: rectSize },
                { x: canvas.width - rectSize - 20, y: 20, w: rectSize, h: rectSize },
                { x: 20, y: canvas.height - rectSize - 20, w: rectSize, h: rectSize }
            ];

            // 4. CHAMA A FUNÇÃO DE ALINHAMENTO (AGORA RETORNA A MATRIZ BINÁRIA)
            let alignmentResult = detectaRetanguloAlinhamento(dst, src, rects);

            // PROCESSAMENTO DE DADOS (Sub-retângulos)
            if(alignmentResult.isAligned){
                
                // Matriz binária pré-processada (REUTILIZADA)
                const binaryMat = alignmentResult.binaryMat;
                
                // Obtém o objeto cv.Rect da área macro (NÃO a Matriz)
                const macroRoiRect = detectaRetanguloMacro(src, rects);
                
                // Processa o grid de 100 sub-retângulos
                const resultadosDaLeitura = processarGrid100SubRetangulos(binaryMat, macroRoiRect, dst, GABARITO_CORRETO, 25);
                
                document.getElementById('log').innerText = `Alinhamento OK. ${resultadosDaLeitura.marcacoes} marcações detectadas.`;

                // **IMPORTANTE:** Deleta a Matriz Binária aqui, após o uso em todas as verificações.
                binaryMat.delete();
                
            } else {
                 document.getElementById('log').innerText = 'Alinhamento da folha...';
                 // Se não estiver alinhado, a matriz binaryMat já foi deletada dentro de detectaRetanguloAlinhamento
            }
            
            // Exibe a câmera com os retângulos no photoCanvas
            cv.imshow('photoCanvas', dst);

            requestAnimationFrame(processVideo);

        } catch (err) {
            console.error(err);
        }
    }

    requestAnimationFrame(processVideo);
}

// 4. Verifica se os retângulos de referências foram posicionados na região correta da folha. (REVISADA)
// RETORNA UM OBJETO COM O STATUS E A MATRIZ BINÁRIA.
function detectaRetanguloAlinhamento(dst, src, rects) {
    const rectSize = rects[0].w;

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let binary = new cv.Mat();
    cv.threshold(gray, binary, 60, 255, cv.THRESH_BINARY_INV); // Usando 60 como limiar para 'preto'

    let alignedCount = 0;

    for (let r of rects) {
        // Usa a Matriz Binária para a verificação
        let roi = binary.roi(new cv.Rect(r.x, r.y, rectSize, rectSize));
        let nonZero = cv.countNonZero(roi);
        let fillRatio = nonZero / (rectSize * rectSize);

        // Verde se detectado (preenchido), azul se não
        let color = fillRatio > 0.6
            ? new cv.Scalar(0, 255, 0, 255)   // verde
            : new cv.Scalar(0, 0, 255, 255);  // azul

        if (fillRatio > 0.6) {
            alignedCount++; // contagem dos retângulos alinhados
        }
        alignedCount++; // força temporariamente, mesmo não alinhado, para testes dos processamentos a seguir. 

        cv.rectangle(
            dst,
            new cv.Point(r.x, r.y),
            new cv.Point(r.x + rectSize, r.y + rectSize),
            color,
            2
        );

        roi.delete();
    }

    gray.delete(); // Deleta a matriz cinza intermediária

    if (alignedCount === rects.length) {
        // Alinhado: Retorna a matriz binária para reuso.
        return { isAligned: true, binaryMat: binary };
    } else {
        // Não alinhado: Deleta a matriz binária, pois não será usada.
        binary.delete();
        return { isAligned: false, binaryMat: null };
    }
}


// 5. Obtem o retângulo princial (REVISADA - Retorna cv.Rect, não cv.Mat)
function detectaRetanguloMacro(src, rects) {
    // Calcula a ROI baseada nos 3 retângulos
    let xMin = rects[0].x;
    let yMin = rects[0].y;
    let xMax = rects[1].x + rects[1].w;
    let yMax = rects[2].y + rects[2].h;


    let width = xMax - xMin;
    let height = yMax - yMin;

    xMin = Math.max(0, xMin);
    yMin = Math.max(0, yMin);
    width = Math.min(src.cols - xMin, width);
    height = Math.min(src.rows - yMin, height);
    
    // Retorna o objeto Rect, que contém as coordenadas da ROI.
    return new cv.Rect(xMin, yMin, width, height);
}

// 6. REVISADA NOVAMENTE: Processa o grid, compara com o gabarito e desenha retângulos/X coloridos.
function processarGrid100SubRetangulos(binaryMat, macroRoiRect, dst, gabarito, numQuestoesPorColuna = 25) {
    
    // --- Configurações da Estrutura ---
    const numColunasGabarito = 4; 
    const numLinhasGabarito = numQuestoesPorColuna; 
    const numFatiasInternas = 6; 
    const options = ['A', 'B', 'C', 'D', 'E']; 
    const thresholdFill = 0.15; 

    // --- Dimensões ---
    const larguraMacro = macroRoiRect.width;
    const alturaMacro = macroRoiRect.height;
    const xOffset = macroRoiRect.x;
    const yOffset = macroRoiRect.y;

    const subLargura = Math.floor(larguraMacro / numColunasGabarito);
    const subAltura = Math.floor(alturaMacro / numLinhasGabarito);
    const fatiaLargura = Math.floor(subLargura / numFatiasInternas);

    let resultadosQuestoes = {}; 
    let marcacoesDetectadas = 0;
    let acertos = 0;
    let questaoGlobal = 0; 

    // --- Cores ---
    const COR_ACERTO = new cv.Scalar(0, 255, 0, 255);   // Verde (Marcação correta)
    const COR_ERRO = new cv.Scalar(255, 0, 0, 255);     // Vermelho (Marcação incorreta/Múltipla)
    const COR_GABARITO_NAO_MARCADO = new cv.Scalar(0, 255, 0, 255); // Verde (para o 'X' do gabarito)
    
    // Percorre os blocos de questões (Colunas)
    for (let j = 0; j < numColunasGabarito; j++) {
        // Percorre as questões dentro do bloco (Linhas)
        for (let i = 0; i < numLinhasGabarito; i++) {
            
            questaoGlobal++;
            const respostaCorreta = gabarito[questaoGlobal]; 
            
            // Verifica se a resposta correta existe no gabarito
            if (typeof respostaCorreta === 'undefined') {
                console.warn(`Aviso: Gabarito faltando para a Questão ${questaoGlobal}. Pulando correção e desenho.`);
                // Se o gabarito não tem essa questão, pulamos o desenho e a lógica de correção para ela.
                continue; 
            }

            resultadosQuestoes[questaoGlobal] = {
                marcadas: [],  
                status: 'EM_BRANCO' 
            };
            
            const x_celula_global = xOffset + j * subLargura;
            const y_celula_global = yOffset + i * subAltura;

            // Variável para armazenar o Rect da opção correta, caso ela não seja marcada
            let rectOpcaoCorretaNaoMarcada = null;

            // --- Loop de Fatias de Opção (A a E) ---
            for (let k = 1; k < numFatiasInternas; k++) { 
                
                const opcao = options[k - 1]; 

                // 1. Cria o Rect da Fatia (posição do balão)
                const rectFatia = new cv.Rect(
                    x_celula_global + k * fatiaLargura, 
                    y_celula_global, 
                    fatiaLargura, 
                    subAltura
                );

                // 2. Cria a VIEW na Matriz Binária
                let subRoiOpcao = binaryMat.roi(rectFatia);
                
                // 3. Contagem
                const areaTotalFatia = fatiaLargura * subAltura;
                const nonZero = cv.countNonZero(subRoiOpcao);
                const fillRatio = nonZero / areaTotalFatia;
                
                // --- Lógica de Marcação e Feedback ---
                if (fillRatio > thresholdFill) {
                    marcacoesDetectadas++;
                    resultadosQuestoes[questaoGlobal].marcadas.push(opcao);
                    
                    // Desenha o RETÂNGULO colorida
                    let corRetangulo = (opcao === respostaCorreta) ? COR_ACERTO : COR_ERRO;
                    cv.rectangle(dst, 
                                 new cv.Point(rectFatia.x, rectFatia.y), 
                                 new cv.Point(rectFatia.x + rectFatia.width, rectFatia.y + rectFatia.height), 
                                 corRetangulo, 2); // Espessura 2
                } else if (opcao === respostaCorreta) {
                    // Se esta é a opção correta E NÃO FOI MARCADA
                    rectOpcaoCorretaNaoMarcada = rectFatia; // Armazena para desenhar o 'X' depois
                }

                // 4. Liberar a memória da VIEW
                subRoiOpcao.delete(); 
            } // Fim do loop de Opções (k)
            
            // --- Pós-processamento da Questão ---
            const marcacoes = resultadosQuestoes[questaoGlobal].marcadas;

            if (marcacoes.length === 1) {
                if (marcacoes[0] === respostaCorreta) {
                    resultadosQuestoes[questaoGlobal].status = 'ACERTO';
                    acertos++;
                } else {
                    resultadosQuestoes[questaoGlobal].status = 'ERRO_RESPOSTA';
                    // Se errou a resposta, desenha um 'X' na opção correta que deveria ter sido marcada
                    if (rectOpcaoCorretaNaoMarcada) {
                        drawX(dst, rectOpcaoCorretaNaoMarcada, COR_GABARITO_NAO_MARCADO, 2);
                    }
                }
            } else if (marcacoes.length > 1) {
                resultadosQuestoes[questaoGlobal].status = 'ERRO_MULTIPLA';
                // Não desenhamos mais o retângulo grande, pois cada marcação já tem seu feedback.
                // Se preferir, pode reativar um retângulo maior aqui, talvez com outra cor.
            } else { // Nenhuma marcação
                resultadosQuestoes[questaoGlobal].status = 'EM_BRANCO';
                // Desenha um 'X' na opção correta quando a questão está em branco
                if (rectOpcaoCorretaNaoMarcada) {
                    drawX(dst, rectOpcaoCorretaNaoMarcada, COR_GABARITO_NAO_MARCADO, 2);
                }
            }
            
        }
    }

    return { 
        totalMarcacoes: marcacoesDetectadas,
        totalAcertos: acertos,
        respostas: resultadosQuestoes 
    };
}

// NOVA FUNÇÃO AUXILIAR para desenhar um 'X'
function drawX(mat, rect, color, thickness) {
    // Linha de cima para baixo (esquerda para direita)
    cv.line(mat, 
            new cv.Point(rect.x, rect.y), 
            new cv.Point(rect.x + rect.width, rect.y + rect.height), 
            color, 
            thickness);
    // Linha de cima para baixo (direita para esquerda)
    cv.line(mat, 
            new cv.Point(rect.x + rect.width, rect.y), 
            new cv.Point(rect.x, rect.y + rect.height), 
            color, 
            thickness);
}

